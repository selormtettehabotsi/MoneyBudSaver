"""
Abstract Base Adapter and OpenAI-Compatible Generic Adapter for Council AI Providers.
"""
from abc import ABC, abstractmethod
from typing import Optional, Dict, Any
import httpx
from app.schemas.council import IndividualVote
from app.services.council.json_repair import (
    STRICT_VOTE_SCHEMA_PROMPT,
    extract_and_repair_json,
    validate_and_normalize_vote,
)


class BaseProviderAdapter(ABC):
    def __init__(self, name: str, display_name: str, model_family: str, model_id: str):
        self.name = name
        self.display_name = display_name
        self.model_family = model_family
        self.model_id = model_id

    @abstractmethod
    def is_configured(self) -> bool:
        """Returns True if the provider has necessary API keys or is reachable."""
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
    Groq, Cerebras, Mistral, OpenRouter, and Ollama.
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
    ):
        super().__init__(name, display_name, model_family, model_id)
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.is_local = is_local
        self.extra_headers = extra_headers or {}

    def is_configured(self) -> bool:
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

        payload = {
            "model": self.model_id,
            "messages": [
                {
                    "role": "system",
                    "content": f"{system_instruction}\n\n{STRICT_VOTE_SCHEMA_PROMPT}",
                },
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.2,
            "response_format": {"type": "json_object"} if not self.is_local else None,
        }

        try:
            async with httpx.AsyncClient(timeout=timeout_seconds) as client:
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
                    return IndividualVote(
                        provider_name=self.name,
                        model_id=self.model_id,
                        model_family=self.model_family,
                        status="failed",
                        round_number=round_number,
                        error_message=f"HTTP {res.status_code}: {res.text[:200]}",
                    )

                data = res.json()
                content = data["choices"][0]["message"]["content"]
                parsed = extract_and_repair_json(content)
                is_valid, norm, err = validate_and_normalize_vote(parsed)

                if not is_valid:
                    return IndividualVote(
                        provider_name=self.name,
                        model_id=self.model_id,
                        model_family=self.model_family,
                        status="failed",
                        round_number=round_number,
                        error_message=f"JSON schema error: {err}",
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
            return IndividualVote(
                provider_name=self.name,
                model_id=self.model_id,
                model_family=self.model_family,
                status="failed",
                round_number=round_number,
                error_message=str(e),
            )
