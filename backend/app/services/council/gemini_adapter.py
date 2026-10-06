"""
Google Gemini Provider Adapter.
"""
import time
from typing import Optional, Dict, Any
import httpx
from app.core.security import redact_sensitive_info
from app.schemas.council import IndividualVote
from app.services.council.base_adapter import BaseProviderAdapter, _UNSUPPORTED_THINKING_PROVIDERS
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
        timeout_seconds: int = 25,
        max_output_tokens: int = 4096,
    ):
        super().__init__(
            name=name,
            display_name=display_name,
            model_family=model_family,
            model_id=model_id,
            timeout_seconds=timeout_seconds,
        )
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

        # Google Gemini API generationConfig documentation:
        # https://ai.google.dev/api/rest/v1beta/models/generateContent#GenerationConfig
        # https://ai.google.dev/gemini-api/docs/thinking
        if self.name not in _UNSUPPORTED_THINKING_PROVIDERS:
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
            async with httpx.AsyncClient(timeout=eff_timeout) as client:
                res = await client.post(endpoint, headers=headers, json=payload)

                # Retry on 400 or 422 if error mentions thinking config
                if res.status_code in (400, 422) and "thinkingConfig" in generation_config:
                    is_unsupported = False
                    try:
                        err_json = res.json()
                        err_obj = err_json.get("error", {})
                        status_str = str(err_obj.get("status", "")).lower()
                        msg_str = str(err_obj.get("message", "")).lower()
                        details_str = str(err_obj.get("details", "")).lower()
                    except Exception:
                        status_str, msg_str, details_str = "", res.text.lower(), ""

                    if "thinking" in msg_str or "thinkingconfig" in msg_str or "thinkingbudget" in msg_str or "thinkinglevel" in msg_str or "invalid_argument" in status_str or "invalid argument" in msg_str:
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

                        retry_gen_cfg = dict(generation_config)
                        retry_gen_cfg.pop("thinkingConfig", None)
                        retry_payload = dict(payload)
                        retry_payload["generationConfig"] = retry_gen_cfg
                        res = await client.post(endpoint, headers=headers, json=retry_payload)

                if res.status_code == 429:
                    import asyncio
                    from app.services.council.base_adapter import parse_retry_after
                    retry_after_str = res.headers.get("Retry-After")
                    retry_secs = parse_retry_after(retry_after_str)
                    if retry_secs <= 5:
                        await asyncio.sleep(retry_secs)
                        res = await client.post(endpoint, headers=headers, json=payload)
                        if res.status_code == 429:
                            latency_ms = int((time.perf_counter() - start_time) * 1000)
                            return IndividualVote(
                                provider_name=self.name,
                                display_name=self.display_name,
                                model_id=self.model_id,
                                model_family=self.model_family,
                                status="rate_limited",
                                round_number=round_number,
                                latency_ms=latency_ms,
                                error_message=f"Gemini rate limit reached (HTTP 429). Retry in {retry_secs} seconds.",
                            )
                    else:
                        latency_ms = int((time.perf_counter() - start_time) * 1000)
                        return IndividualVote(
                            provider_name=self.name,
                            display_name=self.display_name,
                            model_id=self.model_id,
                            model_family=self.model_family,
                            status="rate_limited",
                            round_number=round_number,
                            latency_ms=latency_ms,
                            error_message=f"Gemini rate limit reached (HTTP 429). Retry in {retry_secs} seconds.",
                        )

                if res.status_code in (401, 403):
                    latency_ms = int((time.perf_counter() - start_time) * 1000)
                    return IndividualVote(
                        provider_name=self.name,
                        display_name=self.display_name,
                        model_id=self.model_id,
                        model_family=self.model_family,
                        status="failed",
                        round_number=round_number,
                        latency_ms=latency_ms,
                        error_message=f"Invalid API Key: Provider rejected authentication (HTTP {res.status_code}).",
                    )

                if res.status_code == 402:
                    latency_ms = int((time.perf_counter() - start_time) * 1000)
                    return IndividualVote(
                        provider_name=self.name,
                        display_name=self.display_name,
                        model_id=self.model_id,
                        model_family=self.model_family,
                        status="unavailable",
                        round_number=round_number,
                        latency_ms=latency_ms,
                        error_message="Gemini billing/quota exhausted (HTTP 402). Model unavailable.",
                    )

                if res.status_code == 404:
                    latency_ms = int((time.perf_counter() - start_time) * 1000)
                    return IndividualVote(
                        provider_name=self.name,
                        display_name=self.display_name,
                        model_id=self.model_id,
                        model_family=self.model_family,
                        status="unavailable",
                        round_number=round_number,
                        latency_ms=latency_ms,
                        error_message=f"Gemini model '{self.model_id}' not found (HTTP 404). Model unavailable.",
                    )

                if res.status_code != 200:
                    clean_err = redact_sensitive_info(res.text[:200])
                    latency_ms = int((time.perf_counter() - start_time) * 1000)
                    return IndividualVote(
                        provider_name=self.name,
                        display_name=self.display_name,
                        model_id=self.model_id,
                        model_family=self.model_family,
                        status="failed",
                        round_number=round_number,
                        latency_ms=latency_ms,
                        error_message=f"HTTP {res.status_code}: {clean_err}",
                    )

                data = res.json()
                candidates = data.get("candidates", [])
                if not candidates:
                    latency_ms = int((time.perf_counter() - start_time) * 1000)
                    return IndividualVote(
                        provider_name=self.name,
                        display_name=self.display_name,
                        model_id=self.model_id,
                        model_family=self.model_family,
                        status="unavailable",
                        round_number=round_number,
                        latency_ms=latency_ms,
                        error_message="Invalid response: No candidates returned by Gemini API.",
                    )

                candidate = candidates[0]
                finish_reason = candidate.get("finishReason")
                if finish_reason in ("MAX_TOKENS", "LENGTH"):
                    latency_ms = int((time.perf_counter() - start_time) * 1000)
                    return IndividualVote(
                        provider_name=self.name,
                        display_name=self.display_name,
                        model_id=self.model_id,
                        model_family=self.model_family,
                        status="unavailable",
                        round_number=round_number,
                        latency_ms=latency_ms,
                        error_message="Truncated response: model output hit max_tokens limit before finishing JSON vote.",
                    )

                parts = candidate.get("content", {}).get("parts", [])
                raw_text = parts[0].get("text", "") if parts else ""

                parsed = extract_and_repair_json(raw_text)
                is_valid, norm, err = validate_and_normalize_vote(parsed)

                latency_ms = int((time.perf_counter() - start_time) * 1000)
                if not is_valid:
                    return IndividualVote(
                        provider_name=self.name,
                        display_name=self.display_name,
                        model_id=self.model_id,
                        model_family=self.model_family,
                        status="unavailable",
                        round_number=round_number,
                        latency_ms=latency_ms,
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
                    latency_ms=latency_ms,
                )

        except httpx.TimeoutException:
            latency_ms = int((time.perf_counter() - start_time) * 1000)
            return IndividualVote(
                provider_name=self.name,
                display_name=self.display_name,
                model_id=self.model_id,
                model_family=self.model_family,
                status="timeout",
                round_number=round_number,
                latency_ms=latency_ms,
                error_message=f"Request timed out after {eff_timeout}s.",
            )
        except Exception as e:
            latency_ms = int((time.perf_counter() - start_time) * 1000)
            clean_err = redact_sensitive_info(str(e))
            return IndividualVote(
                provider_name=self.name,
                display_name=self.display_name,
                model_id=self.model_id,
                model_family=self.model_family,
                status="failed",
                round_number=round_number,
                latency_ms=latency_ms,
                error_message=clean_err,
            )
