import asyncio
import random
import time
from abc import ABC, abstractmethod
from typing import Optional, Dict, Any, List
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


async def wait_for_provider_pacing(provider_name: str, min_interval_seconds: float = 0.0) -> None:
    """
    Enforces a minimum interval between ALL requests to the same provider
    (including catalog, test and chat calls).
    """
    norm_name = provider_name.lower().strip()
    eff_interval = min_interval_seconds
    if eff_interval <= 0.0:
        return

    if norm_name not in _PROVIDER_SERIAL_LOCKS:
        _PROVIDER_SERIAL_LOCKS[norm_name] = asyncio.Lock()

    async with _PROVIDER_SERIAL_LOCKS[norm_name]:
        loop = asyncio.get_running_loop()
        last_call = _PROVIDER_LAST_CALLED.get(norm_name, 0.0)
        now = loop.time()
        elapsed = now - last_call
        if elapsed < eff_interval:
            await asyncio.sleep(eff_interval - elapsed)
        _PROVIDER_LAST_CALLED[norm_name] = asyncio.get_running_loop().time()


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
        fallback_model_id: Optional[str] = None,
        timeout_seconds: int = 25,
        temperature: float = 0.5,
        top_p: float = 0.95,
        max_tokens: int = 4096,
        exclude_slow_round2: bool = False,
        shared_rate_limit_key: Optional[str] = None,
        stagger_interval_seconds: float = 1.5,
        min_request_interval_seconds: Optional[float] = None,
    ):
        self.name = name
        self.display_name = display_name
        self.model_family = model_family
        self.model_id = model_id
        self.fallback_model_id = fallback_model_id
        self.timeout_seconds = timeout_seconds
        self.temperature = temperature
        self.top_p = top_p
        self.max_tokens = max_tokens
        self.exclude_slow_round2 = exclude_slow_round2
        self.shared_rate_limit_key = shared_rate_limit_key
        self.stagger_interval_seconds = stagger_interval_seconds
        self.min_request_interval_seconds = min_request_interval_seconds if min_request_interval_seconds is not None else 0.0

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
    Groq (1 & 2), NVIDIA NIM (1 & 2), OpenRouter (1 & 2), Custom (1 & 2), and Ollama.
    """
    def __init__(
        self,
        name: str,
        display_name: str,
        model_family: str,
        model_id: str,
        base_url: str,
        fallback_model_id: Optional[str] = None,
        api_key: Optional[str] = None,
        is_local: bool = False,
        extra_headers: Optional[Dict[str, str]] = None,
        timeout_seconds: int = 25,
        temperature: float = 0.5,
        top_p: float = 0.95,
        max_tokens: int = 4096,
        exclude_slow_round2: bool = False,
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
            fallback_model_id=fallback_model_id,
            timeout_seconds=timeout_seconds,
            temperature=temperature,
            top_p=top_p,
            max_tokens=max_tokens,
            exclude_slow_round2=exclude_slow_round2,
            shared_rate_limit_key=shared_rate_limit_key,
            stagger_interval_seconds=stagger_interval_seconds,
            min_request_interval_seconds=min_request_interval_seconds,
        )
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.is_local = is_local
        self.extra_headers = extra_headers or {}
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
                error_message="Model ID not set in configuration (choose a model).",
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

        endpoint = f"{self.base_url}/chat/completions" if not self.is_local else f"{self.base_url}/v1/chat/completions"
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
            "temperature": self.temperature,
            "top_p": self.top_p,
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

        # Provider-specific reasoning / thinking parameter configuration
        if self.name not in _UNSUPPORTED_THINKING_PROVIDERS:
            if "openrouter" in self.name or "openrouter.ai" in self.base_url:
                if self.reasoning_effort:
                    payload["reasoning"] = {"effort": self.reasoning_effort}
                    if self.reasoning_max_tokens is not None:
                        payload["reasoning"]["max_tokens"] = self.reasoning_max_tokens

            if "nvidia" in self.name or "integrate.api.nvidia.com" in self.base_url:
                payload["chat_template_kwargs"] = {"clear_thinking": True, "enable_thinking": False}
                if self.reasoning_effort:
                    payload["reasoning_effort"] = self.reasoning_effort

        # Enforce minimum interval between all requests to this provider
        await wait_for_provider_pacing(self.name, self.min_request_interval_seconds)

        # If this provider shares an API key and rate limit, space out request START times
        if self.shared_rate_limit_key:
            await _wait_for_shared_key_start(
                self.shared_rate_limit_key,
                min_interval_seconds=self.stagger_interval_seconds,
            )

        # Run HTTP query with retry and fallback model support
        vote = await self._execute_query(endpoint, payload, headers, eff_timeout, round_number)
        vote.latency_ms = int((time.perf_counter() - start_time) * 1000)
        vote.display_name = self.display_name
        return vote

    async def _execute_single_attempt(
        self,
        client: httpx.AsyncClient,
        endpoint: str,
        payload: Dict[str, Any],
        headers: Dict[str, str],
        model_name_used: str,
        is_fallback_model: bool,
        round_number: int,
    ) -> IndividualVote:
        res = await client.post(endpoint, json=payload, headers=headers)

        # Auto-retry without thinking/reasoning parameters if rejected with 400 or 422
        if res.status_code in (400, 422) and any(k in payload for k in ("chat_template_kwargs", "reasoning", "reasoning_effort")):
            is_unsupported = False
            try:
                err_data = res.json()
                err_obj = err_data.get("error", {}) if isinstance(err_data, dict) else {}
                code = str(err_obj.get("code", "")).lower()
                param = str(err_obj.get("param", "")).lower()
                err_msg = str(err_obj.get("message", "")).lower()
            except Exception:
                code, param, err_msg = "", "", res.text.lower()

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
                        record_thinking_support_db(db_sess, self.name, model_name_used, supported=False)
                except Exception:
                    pass

                retry_payload = {
                    k: v for k, v in payload.items()
                    if k not in ("chat_template_kwargs", "reasoning", "reasoning_effort")
                }
                res = await client.post(endpoint, json=retry_payload, headers=headers)

        # Check transient errors and return vote
        if res.status_code == 429:
            retry_after_str = res.headers.get("Retry-After")
            retry_secs = parse_retry_after(retry_after_str)
            # Check if error message indicates quota exhaustion (not free)
            err_text = res.text.lower()
            if any(q in err_text for q in ("insufficient", "quota", "credit", "balance", "billable")):
                return IndividualVote(
                    provider_name=self.name,
                    display_name=self.display_name,
                    model_id=self.model_id,
                    model_family=self.model_family,
                    model_used=model_name_used,
                    is_fallback=is_fallback_model,
                    status="rate_limited",
                    round_number=round_number,
                    error_message="not free, disabled: Free quota exhausted or billing required.",
                )
            return IndividualVote(
                provider_name=self.name,
                display_name=self.display_name,
                model_id=self.model_id,
                model_family=self.model_family,
                model_used=model_name_used,
                is_fallback=is_fallback_model,
                status="rate_limited",
                round_number=round_number,
                error_message=f"Provider rate limit reached (HTTP 429). Retry in {retry_secs} seconds.",
            )

        if res.status_code in (502, 503, 529) or (res.status_code >= 500 and "overloaded" in res.text.lower()):
            clean_err = redact_sensitive_info(res.text[:200])
            return IndividualVote(
                provider_name=self.name,
                display_name=self.display_name,
                model_id=self.model_id,
                model_family=self.model_family,
                model_used=model_name_used,
                is_fallback=is_fallback_model,
                status="unavailable",
                round_number=round_number,
                error_message=f"Provider transiently unavailable (HTTP {res.status_code}): {clean_err}",
            )

        if res.status_code in (401, 403):
            return IndividualVote(
                provider_name=self.name,
                display_name=self.display_name,
                model_id=self.model_id,
                model_family=self.model_family,
                model_used=model_name_used,
                is_fallback=is_fallback_model,
                status="invalid_key",
                round_number=round_number,
                error_message=f"Invalid API Key: Provider rejected authentication (HTTP {res.status_code}).",
            )

        if res.status_code == 402:
            return IndividualVote(
                provider_name=self.name,
                display_name=self.display_name,
                model_id=self.model_id,
                model_family=self.model_family,
                model_used=model_name_used,
                is_fallback=is_fallback_model,
                status="unavailable",
                round_number=round_number,
                error_message="not free, disabled: Provider credits exhausted / payment required (HTTP 402).",
            )

        if res.status_code == 404:
            return IndividualVote(
                provider_name=self.name,
                display_name=self.display_name,
                model_id=self.model_id,
                model_family=self.model_family,
                model_used=model_name_used,
                is_fallback=is_fallback_model,
                status="model_not_found",
                round_number=round_number,
                error_message=f"Model ID '{model_name_used}' no longer exists for provider '{self.name}', fix in Settings (HTTP 404).",
            )

        if res.status_code != 200:
            clean_err = redact_sensitive_info(res.text[:200])
            return IndividualVote(
                provider_name=self.name,
                display_name=self.display_name,
                model_id=self.model_id,
                model_family=self.model_family,
                model_used=model_name_used,
                is_fallback=is_fallback_model,
                status="failed",
                round_number=round_number,
                error_message=f"HTTP {res.status_code}: {clean_err}",
            )

        data = res.json()

        # Free-only enforcement check: non-zero cost rejection
        if "openrouter" in self.name or "openrouter.ai" in self.base_url:
            usage = data.get("usage", {})
            cost = usage.get("total_cost") or usage.get("cost")
            if cost is not None:
                try:
                    if float(cost) > 0.0:
                        return IndividualVote(
                            provider_name=self.name,
                            display_name=self.display_name,
                            model_id=self.model_id,
                            model_family=self.model_family,
                            model_used=model_name_used,
                            is_fallback=is_fallback_model,
                            status="failed",
                            round_number=round_number,
                            error_message="Free-only enforcement: Model returned non-zero cost, usage stopped.",
                        )
                except (ValueError, TypeError):
                    pass

        choice = data.get("choices", [{}])[0]
        finish_reason = choice.get("finish_reason")

        if finish_reason == "length":
            return IndividualVote(
                provider_name=self.name,
                display_name=self.display_name,
                model_id=self.model_id,
                model_family=self.model_family,
                model_used=model_name_used,
                is_fallback=is_fallback_model,
                status="unavailable",
                round_number=round_number,
                error_message="Truncated response: model output hit max_tokens limit before finishing JSON vote.",
            )

        content = choice.get("message", {}).get("content", "")

        # If empty response, retry once with temperature=1.0
        if not content or not content.strip():
            temp_retry_payload = dict(payload)
            temp_retry_payload["temperature"] = 1.0
            retry_res = await client.post(endpoint, json=temp_retry_payload, headers=headers)
            if retry_res.status_code == 200:
                retry_data = retry_res.json()
                choice = retry_data.get("choices", [{}])[0]
                content = choice.get("message", {}).get("content", "")

        parsed = extract_and_repair_json(content)
        is_valid, norm, err = validate_and_normalize_vote(parsed)

        if not is_valid:
            return IndividualVote(
                provider_name=self.name,
                display_name=self.display_name,
                model_id=self.model_id,
                model_family=self.model_family,
                model_used=model_name_used,
                is_fallback=is_fallback_model,
                status="unavailable",
                round_number=round_number,
                error_message=f"Invalid response: failed to parse JSON vote from model ({err}).",
            )

        return IndividualVote(
            provider_name=self.name,
            display_name=self.display_name,
            model_id=self.model_id,
            model_family=self.model_family,
            model_used=model_name_used,
            is_fallback=is_fallback_model,
            status="success",
            verdict=norm["verdict"],
            confidence=norm["confidence"],
            reasoning=norm["reasoning"],
            risks=norm["risks"],
            conditions=norm["conditions"],
            suggested_amount=norm["suggested_amount"],
            round_number=round_number,
        )

    async def _execute_query(
        self,
        endpoint: str,
        payload: Dict[str, Any],
        headers: Dict[str, str],
        timeout_seconds: int,
        round_number: int,
    ) -> IndividualVote:
        last_vote: Optional[IndividualVote] = None

        try:
            async with httpx.AsyncClient(timeout=timeout_seconds, follow_redirects=False) as client:
                for attempt in range(3):
                    try:
                        vote = await self._execute_single_attempt(
                            client=client,
                            endpoint=endpoint,
                            payload=payload,
                            headers=headers,
                            model_name_used=self.model_id,
                            is_fallback_model=False,
                            round_number=round_number,
                        )
                        last_vote = vote

                        if vote.status == "success":
                            return vote

                        # Determine if error is transient and eligible for retry
                        is_transient = (
                            vote.status == "rate_limited"
                            or (vote.error_message and any(
                                t in vote.error_message.lower()
                                for t in ("503", "502", "529", "overloaded", "rate limit", "temporarily unavailable", "capacity")
                            ))
                        )

                        if is_transient and attempt < 2:
                            if vote.status == "rate_limited" and "Retry in" in (vote.error_message or ""):
                                import re
                                m = re.search(r'Retry in (\d+) seconds', vote.error_message or "")
                                retry_secs = int(m.group(1)) if m else 1
                                delay = retry_secs + 0.5 + random.uniform(0.05, 0.3)
                            else:
                                delay = (0.75 * (2 ** attempt)) + 0.5 + random.uniform(0.05, 0.3)
                            await asyncio.sleep(delay)
                            continue

                        break

                    except httpx.TimeoutException:
                        last_vote = IndividualVote(
                            provider_name=self.name,
                            display_name=self.display_name,
                            model_id=self.model_id,
                            model_family=self.model_family,
                            model_used=self.model_id,
                            is_fallback=False,
                            status="timeout",
                            round_number=round_number,
                            error_message=f"Request timed out after {timeout_seconds}s.",
                        )
                        if attempt < 2:
                            delay = (0.75 * (2 ** attempt)) + 0.5 + random.uniform(0.05, 0.3)
                            await asyncio.sleep(delay)
                            continue
                        break

                # If primary model failed and fallback_model_id is configured, attempt fallback
                if (
                    last_vote
                    and last_vote.status != "success"
                    and self.fallback_model_id
                    and self.fallback_model_id.strip()
                    and self.fallback_model_id.strip() != self.model_id.strip()
                ):
                    fallback_payload = dict(payload)
                    fallback_payload["model"] = self.fallback_model_id.strip()
                    try:
                        fb_vote = await self._execute_single_attempt(
                            client=client,
                            endpoint=endpoint,
                            payload=fallback_payload,
                            headers=headers,
                            model_name_used=self.fallback_model_id.strip(),
                            is_fallback_model=True,
                            round_number=round_number,
                        )
                        if fb_vote.status == "success":
                            return fb_vote
                    except Exception:
                        pass

                return last_vote or IndividualVote(
                    provider_name=self.name,
                    display_name=self.display_name,
                    model_id=self.model_id,
                    model_family=self.model_family,
                    model_used=self.model_id,
                    is_fallback=False,
                    status="failed",
                    round_number=round_number,
                    error_message="All retry attempts failed.",
                )

        except Exception as e:
            clean_exc = redact_sensitive_info(str(e))
            return IndividualVote(
                provider_name=self.name,
                display_name=self.display_name,
                model_id=self.model_id,
                model_family=self.model_family,
                model_used=self.model_id,
                is_fallback=False,
                status="failed",
                round_number=round_number,
                error_message=clean_exc,
            )
