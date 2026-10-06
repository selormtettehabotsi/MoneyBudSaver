import asyncio
from abc import ABC, abstractmethod
from typing import Optional, Dict, Any
import httpx
from app.core.security import redact_sensitive_info
from app.schemas.council import IndividualVote
from app.services.council.json_repair import (
    STRICT_VOTE_SCHEMA_PROMPT,
    extract_and_repair_json,
    validate_and_normalize_vote,
)

_SHARED_KEY_LOCKS: Dict[str, asyncio.Lock] = {}


def _get_shared_lock(key_id: str) -> asyncio.Lock:
    if key_id not in _SHARED_KEY_LOCKS:
        _SHARED_KEY_LOCKS[key_id] = asyncio.Lock()
    return _SHARED_KEY_LOCKS[key_id]


class BaseProviderAdapter(ABC):
    def __init__(
        self,
        name: str,
        display_name: str,
        model_family: str,
        model_id: str,
        shared_rate_limit_key: Optional[str] = None,
    ):
        self.name = name
        self.display_name = display_name
        self.model_family = model_family
        self.model_id = model_id
        self.shared_rate_limit_key = shared_rate_limit_key

    @abstractmethod
    def is_configured(self) -> bool:
        """Returns True if the provider has necessary API keys and model ID."""
        pass

    @abstractmethod
    async def query(
        self,
        prompt: str,
        system_instruction: str,
        timeout_seconds: int = 25,
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
        max_tokens: int = 4096,
        reasoning_effort: Optional[str] = "low",
        reasoning_max_tokens: Optional[int] = None,
        shared_rate_limit_key: Optional[str] = None,
    ):
        super().__init__(name, display_name, model_family, model_id, shared_rate_limit_key=shared_rate_limit_key)
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
        timeout_seconds: int = 25,
        round_number: int = 1,
    ) -> IndividualVote:
        if not self.model_id or not self.model_id.strip():
            return IndividualVote(
                provider_name=self.name,
                model_id="",
                model_family=self.model_family,
                status="skipped",
                round_number=round_number,
                error_message="Model ID not set in configuration.",
            )

        if not self.is_configured():
            return IndividualVote(
                provider_name=self.name,
                model_id=self.model_id,
                model_family=self.model_family,
                status="skipped",
                round_number=round_number,
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

        # For OpenRouter, configure reasoning parameter if available
        if "openrouter" in self.name or "openrouter.ai" in self.base_url:
            if self.reasoning_effort:
                payload["reasoning"] = {"effort": self.reasoning_effort}
                if self.reasoning_max_tokens is not None:
                    payload["reasoning"]["max_tokens"] = self.reasoning_max_tokens

        # If this provider shares an API key and rate limit, acquire lock for staggering
        if self.shared_rate_limit_key:
            lock = _get_shared_lock(self.shared_rate_limit_key)
            async with lock:
                result = await self._execute_query(endpoint, payload, headers, timeout_seconds, round_number)
                # Brief stagger pause before releasing shared key lock to avoid burst collisions
                await asyncio.sleep(0.4)
                return result
        else:
            return await self._execute_query(endpoint, payload, headers, timeout_seconds, round_number)

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

                # Exponential backoff retry once on 429
                if res.status_code == 429:
                    await asyncio.sleep(1.5)
                    res = await client.post(endpoint, json=payload, headers=headers)
                    if res.status_code == 429:
                        return IndividualVote(
                            provider_name=self.name,
                            model_id=self.model_id,
                            model_family=self.model_family,
                            status="rate_limited",
                            round_number=round_number,
                            error_message="Provider rate limit reached (HTTP 429).",
                        )

                if res.status_code == 402:
                    return IndividualVote(
                        provider_name=self.name,
                        model_id=self.model_id,
                        model_family=self.model_family,
                        status="unavailable",
                        round_number=round_number,
                        error_message="Provider credits exhausted / payment required (HTTP 402). Model unavailable.",
                    )

                if res.status_code == 404:
                    return IndividualVote(
                        provider_name=self.name,
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
                        model_id=self.model_id,
                        model_family=self.model_family,
                        status="unavailable",
                        round_number=round_number,
                        error_message=f"Invalid response: failed to parse JSON vote from model ({err}).",
                    )

                return IndividualVote(
                    provider_name=self.name,
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
                model_id=self.model_id,
                model_family=self.model_family,
                status="failed",
                round_number=round_number,
                error_message=clean_exc,
            )
