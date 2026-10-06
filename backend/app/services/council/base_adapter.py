import asyncio
import time
from abc import ABC, abstractmethod
from typing import Optional, Dict, Any
import httpx
from app.config import settings
from app.core.security import redact_sensitive_info
from app.schemas.council import IndividualVote
from app.services.council.json_repair import (
    STRICT_VOTE_SCHEMA_PROMPT,
    extract_and_repair_json,
    validate_and_normalize_vote,
)

# Global process-level registry of providers where thinking / reasoning parameters failed or are unsupported
_UNSUPPORTED_THINKING_PROVIDERS: set = set()
_SHARED_KEY_LAST_START: Dict[str, float] = {}
_SHARED_KEY_START_LOCKS: Dict[str, asyncio.Lock] = {}
_PROVIDER_SERIAL_LOCKS: Dict[str, asyncio.Lock] = {}
_PROVIDER_LAST_CALLED: Dict[str, float] = {}


def parse_retry_after(header_value: Optional[str]) -> int:
    """Parses Retry-After header string into integer seconds."""
    if not header_value:
        return 1
    val = header_value.strip()
    if val.isdigit():
        return max(1, int(val))
    try:
        import email.utils
        from datetime import datetime, timezone
        dt = email.utils.parsedate_to_datetime(val)
        if dt:
            now = datetime.now(timezone.utc)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            secs = int((dt - now).total_seconds())
            return max(1, secs)
    except Exception:
        pass
    return 1


async def _wait_for_shared_key_start(key_id: str, min_interval_seconds: float = 1.5) -> None:
    """
    Spaces out request STARTS for providers sharing an API key/rate limit.
    Releases the lock immediately before the HTTP call begins, allowing
    concurrent in-flight execution while preventing burst start collisions.
    """
    if key_id not in _SHARED_KEY_START_LOCKS:
        _SHARED_KEY_START_LOCKS[key_id] = asyncio.Lock()
    lock = _SHARED_KEY_START_LOCKS[key_id]

    async with lock:
        loop = asyncio.get_running_loop()
        now = loop.time()
        last_start = _SHARED_KEY_LAST_START.get(key_id, 0.0)
        elapsed = now - last_start
        if elapsed < min_interval_seconds:
            await asyncio.sleep(min_interval_seconds - elapsed)
        _SHARED_KEY_LAST_START[key_id] = asyncio.get_running_loop().time()


class BaseProviderAdapter(ABC):
    def __init__(
        self,
        name: str,
        display_name: str,
        model_family: str,
        model_id: str,
        timeout_seconds: int = 25,
        shared_rate_limit_key: Optional[str] = None,
        stagger_interval_seconds: float = 1.5,
        min_request_interval_seconds: Optional[float] = None,
    ):
        self.name = name
        self.display_name = display_name
        self.model_family = model_family
        self.model_id = model_id
        self.timeout_seconds = timeout_seconds
        self.shared_rate_limit_key = shared_rate_limit_key
        self.stagger_interval_seconds = stagger_interval_seconds
        self.min_request_interval_seconds = min_request_interval_seconds if min_request_interval_seconds is not None else (1.5 if name.lower() == "mistral" else 0.0)

    @abstractmethod
    def is_configured(self) -> bool:
        """Returns True if the provider has necessary API keys and model ID."""
        pass

    @abstractmethod
    async def query(
        self,
        prompt: str,
        system_instruction: str,
        timeout_seconds: Optional[int] = None,
        round_number: int = 1,
    ) -> IndividualVote:
        """Query the model and return a validated IndividualVote."""
        pass


class OpenAICompatibleAdapter(BaseProviderAdapter):
    """
    Adapter for any OpenAI-compatible provider:
    Groq, NVIDIA NIM (GLM & Kimi), Cerebras, Mistral, OpenRouter, and Ollama.
    """
    def __init__(
        self,
        name: str,
        display_name: str,
        model_family: str,
        model_id: str,
        base_url: str,
        api_key: Optional[str] = None,
        is_local: bool = False,
        extra_headers: Optional[Dict[str, str]] = None,
        timeout_seconds: int = 25,
        max_tokens: int = 4096,
        reasoning_effort: Optional[str] = "low",
        reasoning_max_tokens: Optional[int] = None,
        shared_rate_limit_key: Optional[str] = None,
        stagger_interval_seconds: float = 1.5,
        min_request_interval_seconds: Optional[float] = None,
    ):
        super().__init__(
            name=name,
            display_name=display_name,
            model_family=model_family,
            model_id=model_id,
            timeout_seconds=timeout_seconds,
            shared_rate_limit_key=shared_rate_limit_key,
            stagger_interval_seconds=stagger_interval_seconds,
            min_request_interval_seconds=min_request_interval_seconds,
        )
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.is_local = is_local
        self.extra_headers = extra_headers or {}
        self.max_tokens = max_tokens
        self.reasoning_effort = reasoning_effort
        self.reasoning_max_tokens = reasoning_max_tokens

    def is_configured(self) -> bool:
        if not self.model_id or not self.model_id.strip():
            return False
        if self.is_local:
            return True
        return bool(self.api_key and len(self.api_key.strip()) > 0)

    async def query(
        self,
        prompt: str,
        system_instruction: str,
        timeout_seconds: Optional[int] = None,
        round_number: int = 1,
    ) -> IndividualVote:
        eff_timeout = timeout_seconds or self.timeout_seconds
        start_time = time.perf_counter()

        if not self.model_id or not self.model_id.strip():
            return IndividualVote(
                provider_name=self.name,
                display_name=self.display_name,
                model_id="",
                model_family=self.model_family,
                status="not_configured",
                round_number=round_number,
                latency_ms=0,
                error_message="Model ID not set in configuration.",
            )

        if not self.is_configured():
            return IndividualVote(
                provider_name=self.name,
                display_name=self.display_name,
                model_id=self.model_id,
                model_family=self.model_family,
                status="not_configured",
                round_number=round_number,
                latency_ms=0,
                error_message="API Key not configured in environment.",
            )

        endpoint = f"{self.base_url}/chat/completions"
        headers = {
            "Content-Type": "application/json",
            **self.extra_headers,
        }
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        payload: Dict[str, Any] = {
            "model": self.model_id,
            "messages": [
                {
                    "role": "system",
                    "content": f"{system_instruction}\n\n{STRICT_VOTE_SCHEMA_PROMPT}",
                },
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.2,
            "max_tokens": self.max_tokens,
            "response_format": {"type": "json_object"} if not self.is_local else None,
        }

        # Check DB for parameter fallback support
        try:
            from app.db.session import SessionLocal
            from app.services.council.health_manager import get_thinking_support_db
            with SessionLocal() as db_sess:
                supported = get_thinking_support_db(db_sess, self.name, self.model_id)
                if supported is False:
                    _UNSUPPORTED_THINKING_PROVIDERS.add(self.name)
        except Exception:
            pass

        # Provider-specific reasoning / thinking parameter configuration (treated as optional extras)
        # 1. OpenRouter reasoning parameters: https://openrouter.ai/docs/parameters#reasoning
        if self.name not in _UNSUPPORTED_THINKING_PROVIDERS:
            if "openrouter" in self.name or "openrouter.ai" in self.base_url:
                if self.reasoning_effort:
                    payload["reasoning"] = {"effort": self.reasoning_effort}
                    if self.reasoning_max_tokens is not None:
                        payload["reasoning"]["max_tokens"] = self.reasoning_max_tokens

            # 2. NVIDIA NIM OpenAI-compatible parameters:
            # https://docs.api.nvidia.com/nim/reference/openai-compatible-chat-completions
            # https://build.nvidia.com/
            if "nvidia" in self.name or "integrate.api.nvidia.com" in self.base_url:
                payload["chat_template_kwargs"] = {"clear_thinking": True, "enable_thinking": False}
                if self.reasoning_effort:
                    payload["reasoning_effort"] = self.reasoning_effort

        # Serialise calls to the same provider and enforce minimum request interval
        if self.name not in _PROVIDER_SERIAL_LOCKS:
            _PROVIDER_SERIAL_LOCKS[self.name] = asyncio.Lock()

        async with _PROVIDER_SERIAL_LOCKS[self.name]:
            if self.min_request_interval_seconds > 0:
                loop = asyncio.get_running_loop()
                last_call = _PROVIDER_LAST_CALLED.get(self.name, 0.0)
                elapsed = loop.time() - last_call
                if elapsed < self.min_request_interval_seconds:
                    await asyncio.sleep(self.min_request_interval_seconds - elapsed)
                _PROVIDER_LAST_CALLED[self.name] = asyncio.get_running_loop().time()

            # If this provider shares an API key and rate limit, space out request START times
            if self.shared_rate_limit_key:
                await _wait_for_shared_key_start(
                    self.shared_rate_limit_key,
                    min_interval_seconds=self.stagger_interval_seconds,
                )

            # Run HTTP query concurrently
            vote = await self._execute_query(endpoint, payload, headers, eff_timeout, round_number)
            vote.latency_ms = int((time.perf_counter() - start_time) * 1000)
            vote.display_name = self.display_name
            return vote

    async def _execute_query(
        self,
        endpoint: str,
        payload: Dict[str, Any],
        headers: Dict[str, str],
        timeout_seconds: int,
        round_number: int,
    ) -> IndividualVote:
        try:
            async with httpx.AsyncClient(timeout=timeout_seconds) as client:
                res = await client.post(endpoint, json=payload, headers=headers)

                # Auto-retry without thinking/reasoning parameters if rejected with 400 or 422
                if res.status_code in (400, 422) and any(k in payload for k in ("chat_template_kwargs", "reasoning", "reasoning_effort")):
                    is_unsupported = False
                    try:
                        err_data = res.json()
                        err_obj = err_data.get("error", {}) if isinstance(err_data, dict) else {}
                        code = str(err_obj.get("code", "")).lower()
                        param = str(err_obj.get("param", "")).lower()
                        err_type = str(err_obj.get("type", "")).lower()
                        err_msg = str(err_obj.get("message", "")).lower()
                    except Exception:
                        code, param, err_type, err_msg = "", "", "", res.text.lower()

                    if param in ("chat_template_kwargs", "reasoning_effort", "reasoning", "enable_thinking", "clear_thinking", "thinkingconfig", "thinkingbudget", "thinkinglevel"):
                        is_unsupported = True
                    elif code in ("unrecognized_parameter", "unsupported_parameter", "invalid_parameter", "unknown_parameter"):
                        is_unsupported = True
                    elif any(t in err_msg for t in ("chat_template_kwargs", "enable_thinking", "clear_thinking", "reasoning_effort", "reasoning", "thinking", "unknown parameter", "unrecognized", "extra fields not permitted", "unexpected field", "invalid argument", "not supported")):
                        is_unsupported = True

                    if is_unsupported:
                        _UNSUPPORTED_THINKING_PROVIDERS.add(self.name)
                        try:
                            from app.db.session import SessionLocal
                            from app.services.council.health_manager import record_thinking_support_db
                            with SessionLocal() as db_sess:
                                record_thinking_support_db(db_sess, self.name, self.model_id, supported=False)
                        except Exception:
                            pass

                        retry_payload = {
                            k: v for k, v in payload.items()
                            if k not in ("chat_template_kwargs", "reasoning", "reasoning_effort")
                        }
                        res = await client.post(endpoint, json=retry_payload, headers=headers)

                # Exponential backoff / Retry-After handling on 429
                if res.status_code == 429:
                    retry_after_str = res.headers.get("Retry-After")
                    retry_secs = parse_retry_after(retry_after_str)
                    if retry_secs <= 5:
                        await asyncio.sleep(retry_secs)
                        res = await client.post(endpoint, json=payload, headers=headers)
                        if res.status_code == 429:
                            new_retry_str = res.headers.get("Retry-After")
                            new_retry_secs = parse_retry_after(new_retry_str) or retry_secs
                            return IndividualVote(
                                provider_name=self.name,
                                display_name=self.display_name,
                                model_id=self.model_id,
                                model_family=self.model_family,
                                status="rate_limited",
                                round_number=round_number,
                                error_message=f"Provider rate limit reached (HTTP 429). Retry in {new_retry_secs} seconds.",
                            )
                    else:
                        return IndividualVote(
                            provider_name=self.name,
                            display_name=self.display_name,
                            model_id=self.model_id,
                            model_family=self.model_family,
                            status="rate_limited",
                            round_number=round_number,
                            error_message=f"Provider rate limit reached (HTTP 429). Retry in {retry_secs} seconds.",
                        )

                if res.status_code == 401 or res.status_code == 403:
                    return IndividualVote(
                        provider_name=self.name,
                        display_name=self.display_name,
                        model_id=self.model_id,
                        model_family=self.model_family,
                        status="failed",
                        round_number=round_number,
                        error_message=f"Invalid API Key: Provider rejected authentication (HTTP {res.status_code}).",
                    )

                if res.status_code == 402:
                    return IndividualVote(
                        provider_name=self.name,
                        display_name=self.display_name,
                        model_id=self.model_id,
                        model_family=self.model_family,
                        status="unavailable",
                        round_number=round_number,
                        error_message="Provider credits exhausted / payment required (HTTP 402). Model unavailable.",
                    )

                if res.status_code == 404:
                    return IndividualVote(
                        provider_name=self.name,
                        display_name=self.display_name,
                        model_id=self.model_id,
                        model_family=self.model_family,
                        status="unavailable",
                        round_number=round_number,
                        error_message=f"Model ID '{self.model_id}' not found or deprecated by provider (HTTP 404). Model unavailable.",
                    )

                if res.status_code != 200:
                    clean_err = redact_sensitive_info(res.text[:200])
                    return IndividualVote(
                        provider_name=self.name,
                        display_name=self.display_name,
                        model_id=self.model_id,
                        model_family=self.model_family,
                        status="failed",
                        round_number=round_number,
                        error_message=f"HTTP {res.status_code}: {clean_err}",
                    )

                data = res.json()
                choice = data.get("choices", [{}])[0]
                finish_reason = choice.get("finish_reason")

                # Detect truncation caused by hitting max_tokens budget
                if finish_reason == "length":
                    return IndividualVote(
                        provider_name=self.name,
                        display_name=self.display_name,
                        model_id=self.model_id,
                        model_family=self.model_family,
                        status="unavailable",
                        round_number=round_number,
                        error_message="Truncated response: model output hit max_tokens limit before finishing JSON vote.",
                    )

                content = choice.get("message", {}).get("content", "")
                parsed = extract_and_repair_json(content)
                is_valid, norm, err = validate_and_normalize_vote(parsed)

                if not is_valid:
                    return IndividualVote(
                        provider_name=self.name,
                        display_name=self.display_name,
                        model_id=self.model_id,
                        model_family=self.model_family,
                        status="unavailable",
                        round_number=round_number,
                        error_message=f"Invalid response: failed to parse JSON vote from model ({err}).",
                    )

                return IndividualVote(
                    provider_name=self.name,
                    display_name=self.display_name,
                    model_id=self.model_id,
                    model_family=self.model_family,
                    status="success",
                    verdict=norm["verdict"],
                    confidence=norm["confidence"],
                    reasoning=norm["reasoning"],
                    risks=norm["risks"],
                    conditions=norm["conditions"],
                    suggested_amount=norm["suggested_amount"],
                    round_number=round_number,
                )

        except httpx.TimeoutException:
            return IndividualVote(
                provider_name=self.name,
                display_name=self.display_name,
                model_id=self.model_id,
                model_family=self.model_family,
                status="timeout",
                round_number=round_number,
                error_message=f"Request timed out after {timeout_seconds}s.",
            )
        except Exception as e:
            clean_exc = redact_sensitive_info(str(e))
            return IndividualVote(
                provider_name=self.name,
                display_name=self.display_name,
                model_id=self.model_id,
                model_family=self.model_family,
                status="failed",
                round_number=round_number,
                error_message=clean_exc,
            )
