"""
Google Gemini Provider Adapter.
"""
from typing import Optional
import httpx
from app.schemas.council import IndividualVote
from app.services.council.base_adapter import BaseProviderAdapter
from app.services.council.json_repair import (
    STRICT_VOTE_SCHEMA_PROMPT,
    extract_and_repair_json,
    validate_and_normalize_vote,
)


class GeminiAdapter(BaseProviderAdapter):
    def __init__(
        self,
        name: str = "gemini",
        display_name: str = "Google Gemini",
        model_family: str = "Google Gemini Family",
        model_id: str = "gemini-2.5-flash",
        api_key: Optional[str] = None,
    ):
        super().__init__(name, display_name, model_family, model_id)
        self.api_key = api_key

    def is_configured(self) -> bool:
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
                error_message="GEMINI_API_KEY not configured in environment.",
            )

        endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model_id}:generateContent?key={self.api_key}"

        payload = {
            "system_instruction": {
                "parts": [{"text": f"{system_instruction}\n\n{STRICT_VOTE_SCHEMA_PROMPT}"}]
            },
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": prompt}],
                }
            ],
            "generationConfig": {
                "temperature": 0.2,
                "response_mime_type": "application/json",
            },
        }

        try:
            async with httpx.AsyncClient(timeout=timeout_seconds) as client:
                res = await client.post(endpoint, json=payload)

                if res.status_code == 429:
                    return IndividualVote(
                        provider_name=self.name,
                        model_id=self.model_id,
                        model_family=self.model_family,
                        status="rate_limited",
                        round_number=round_number,
                        error_message="Gemini free quota rate limit reached.",
                    )

                if res.status_code == 402:
                    return IndividualVote(
                        provider_name=self.name,
                        model_id=self.model_id,
                        model_family=self.model_family,
                        status="unavailable",
                        round_number=round_number,
                        error_message="Gemini billing/quota exhausted (HTTP 402). Model unavailable.",
                    )

                if res.status_code == 404:
                    return IndividualVote(
                        provider_name=self.name,
                        model_id=self.model_id,
                        model_family=self.model_family,
                        status="unavailable",
                        round_number=round_number,
                        error_message=f"Gemini model '{self.model_id}' not found (HTTP 404). Model unavailable.",
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
                candidates = data.get("candidates", [])
                if not candidates:
                    return IndividualVote(
                        provider_name=self.name,
                        model_id=self.model_id,
                        model_family=self.model_family,
                        status="failed",
                        round_number=round_number,
                        error_message="No candidates returned by Gemini API.",
                    )

                parts = candidates[0].get("content", {}).get("parts", [])
                raw_text = parts[0].get("text", "") if parts else ""

                parsed = extract_and_repair_json(raw_text)
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
