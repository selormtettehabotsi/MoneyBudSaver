"""
Google Gemini Provider Adapter.
"""
from typing import Optional, Dict, Any
import httpx
from app.core.security import redact_sensitive_info
from app.schemas.council import IndividualVote
from app.services.council.base_adapter import BaseProviderAdapter
from app.services.council.json_repair import (
    STRICT_VOTE_SCHEMA_PROMPT,
    extract_and_repair_json,
    validate_and_normalize_vote,
)


def get_gemini_thinking_config(model_id: str, thinking_level: Optional[str] = "low") -> Optional[Dict[str, Any]]:
    """
    Selects the correct thinking configuration based on the Gemini model family:
    - Gemini 3 models: thinkingLevel ('low', 'medium', 'high')
    - Gemini 2.5 models: thinkingBudget (integer token count, e.g. 1024)
    - Older or non-thinking models (e.g. Gemini 1.5, 2.0): None (thinking not supported)
    """
    m = (model_id or "").lower().strip()
    if "gemini-3" in m or "gemini-v3" in m:
        return {"thinkingLevel": thinking_level or "low"}
    elif "gemini-2.5" in m:
        return {"thinkingBudget": 1024}
    return None


class GeminiAdapter(BaseProviderAdapter):
    def __init__(
        self,
        name: str = "gemini",
        display_name: str = "Google Gemini",
        model_family: str = "Google Gemini Family",
        model_id: str = "gemini-3.8-flash",
        api_key: Optional[str] = None,
        thinking_level: Optional[str] = "low",
        max_output_tokens: int = 4096,
    ):
        super().__init__(name, display_name, model_family, model_id)
        self.api_key = api_key
        self.thinking_level = thinking_level
        self.max_output_tokens = max_output_tokens

    def is_configured(self) -> bool:
        if not self.model_id or not self.model_id.strip():
            return False
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
                error_message="GEMINI_API_KEY not configured in environment.",
            )

        # Gemini Generative Language API uses x-goog-api-key header (never in URL)
        endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model_id}:generateContent"
        headers = {
            "x-goog-api-key": self.api_key,
            "Content-Type": "application/json",
        }

        generation_config: Dict[str, Any] = {
            "temperature": 0.2,
            "response_mime_type": "application/json",
            "maxOutputTokens": self.max_output_tokens,
        }

        thinking_cfg = get_gemini_thinking_config(self.model_id, self.thinking_level)
        if thinking_cfg:
            generation_config["thinkingConfig"] = thinking_cfg

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
            "generationConfig": generation_config,
        }

        try:
            async with httpx.AsyncClient(timeout=timeout_seconds) as client:
                res = await client.post(endpoint, headers=headers, json=payload)

                # Retry on 400 if error mentions thinking config
                if res.status_code == 400 and "thinkingConfig" in generation_config:
                    err_txt = res.text.lower()
                    if "thinking" in err_txt or "thinkingconfig" in err_txt or "thinkingbudget" in err_txt or "thinkinglevel" in err_txt:
                        retry_gen_cfg = dict(generation_config)
                        retry_gen_cfg.pop("thinkingConfig", None)
                        retry_payload = dict(payload)
                        retry_payload["generationConfig"] = retry_gen_cfg
                        res = await client.post(endpoint, headers=headers, json=retry_payload)

                if res.status_code == 429:
                    import asyncio
                    await asyncio.sleep(1.5)
                    res = await client.post(endpoint, headers=headers, json=payload)
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
                candidates = data.get("candidates", [])
                if not candidates:
                    return IndividualVote(
                        provider_name=self.name,
                        model_id=self.model_id,
                        model_family=self.model_family,
                        status="unavailable",
                        round_number=round_number,
                        error_message="Invalid response: No candidates returned by Gemini API.",
                    )

                candidate = candidates[0]
                finish_reason = candidate.get("finishReason")
                if finish_reason in ("MAX_TOKENS", "LENGTH"):
                    return IndividualVote(
                        provider_name=self.name,
                        model_id=self.model_id,
                        model_family=self.model_family,
                        status="unavailable",
                        round_number=round_number,
                        error_message="Truncated response: model output hit max_tokens limit before finishing JSON vote.",
                    )

                parts = candidate.get("content", {}).get("parts", [])
                raw_text = parts[0].get("text", "") if parts else ""

                parsed = extract_and_repair_json(raw_text)
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
            return IndividualVote(
                provider_name=self.name,
                model_id=self.model_id,
                model_family=self.model_family,
                status="failed",
                round_number=round_number,
                error_message=str(e),
            )
