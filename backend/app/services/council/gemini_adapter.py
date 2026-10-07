import asyncio
import random
import time
from typing import Optional, Dict, Any
import httpx
from app.core.security import redact_sensitive_info
from app.schemas.council import IndividualVote
from app.services.council.base_adapter import (
    BaseProviderAdapter,
    _UNSUPPORTED_THINKING_PROVIDERS,
    parse_retry_after,
    wait_for_provider_pacing,
)
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
        model_id: str = "gemini-2.5-flash",
        fallback_model_id: Optional[str] = None,
        api_key: Optional[str] = None,
        thinking_level: Optional[str] = "low",
        timeout_seconds: int = 25,
        temperature: float = 0.5,
        top_p: float = 0.95,
        max_output_tokens: int = 4096,
        exclude_slow_round2: bool = False,
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
            max_tokens=max_output_tokens,
            exclude_slow_round2=exclude_slow_round2,
            min_request_interval_seconds=min_request_interval_seconds,
        )
        self.api_key = api_key
        self.thinking_level = thinking_level
        self.max_output_tokens = max_output_tokens

    def is_configured(self) -> bool:
        if not self.model_id or not self.model_id.strip():
            return False
        return bool(self.api_key and len(self.api_key.strip()) > 0)

    async def _execute_single_attempt(
        self,
        client: httpx.AsyncClient,
        model_name_used: str,
        is_fallback_model: bool,
        system_instruction: str,
        prompt: str,
        round_number: int,
    ) -> IndividualVote:
        endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name_used}:generateContent"
        headers = {
            "x-goog-api-key": self.api_key,
            "Content-Type": "application/json",
        }

        generation_config: Dict[str, Any] = {
            "temperature": self.temperature,
            "topP": self.top_p,
            "response_mime_type": "application/json",
            "maxOutputTokens": self.max_output_tokens,
        }

        # Check DB for parameter fallback support
        try:
            from app.db.session import SessionLocal
            from app.services.council.health_manager import get_thinking_support_db
            with SessionLocal() as db_sess:
                supported = get_thinking_support_db(db_sess, self.name, model_name_used)
                if supported is False:
                    _UNSUPPORTED_THINKING_PROVIDERS.add(self.name)
        except Exception:
            pass

        if self.name not in _UNSUPPORTED_THINKING_PROVIDERS:
            thinking_cfg = get_gemini_thinking_config(model_name_used, self.thinking_level)
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

        res = await client.post(endpoint, headers=headers, json=payload)

        # Retry on 400 or 422 if error mentions thinking config
        if res.status_code in (400, 422) and "thinkingConfig" in generation_config:
            is_unsupported = False
            try:
                err_json = res.json()
                err_obj = err_json.get("error", {})
                status_str = str(err_obj.get("status", "")).lower()
                msg_str = str(err_obj.get("message", "")).lower()
            except Exception:
                status_str, msg_str = "", res.text.lower()

            if "thinking" in msg_str or "thinkingconfig" in msg_str or "thinkingbudget" in msg_str or "thinkinglevel" in msg_str or "invalid_argument" in status_str or "invalid argument" in msg_str:
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

                retry_gen_cfg = dict(generation_config)
                retry_gen_cfg.pop("thinkingConfig", None)
                retry_payload = dict(payload)
                retry_payload["generationConfig"] = retry_gen_cfg
                res = await client.post(endpoint, headers=headers, json=retry_payload)

        if res.status_code == 429:
            retry_after_str = res.headers.get("Retry-After")
            retry_secs = parse_retry_after(retry_after_str)
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
                    error_message="not free, disabled: Gemini quota exhausted or billing required.",
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
                error_message=f"Gemini rate limit reached (HTTP 429). Retry in {retry_secs} seconds.",
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
                error_message=f"Gemini transiently unavailable (HTTP {res.status_code}): {clean_err}",
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
                error_message="not free, disabled: Gemini billing/quota exhausted (HTTP 402).",
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
        candidates = data.get("candidates", [])
        if not candidates:
            return IndividualVote(
                provider_name=self.name,
                display_name=self.display_name,
                model_id=self.model_id,
                model_family=self.model_family,
                model_used=model_name_used,
                is_fallback=is_fallback_model,
                status="unavailable",
                round_number=round_number,
                error_message="Invalid response: No candidates returned by Gemini API.",
            )

        candidate = candidates[0]
        finish_reason = candidate.get("finishReason")
        if finish_reason in ("MAX_TOKENS", "LENGTH"):
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

        parts = candidate.get("content", {}).get("parts", [])
        raw_text = parts[0].get("text", "") if parts else ""

        # If output empty, retry once with temperature=1.0
        if not raw_text or not raw_text.strip():
            retry_gen_cfg = dict(generation_config)
            retry_gen_cfg["temperature"] = 1.0
            retry_payload = dict(payload)
            retry_payload["generationConfig"] = retry_gen_cfg
            retry_res = await client.post(endpoint, headers=headers, json=retry_payload)
            if retry_res.status_code == 200:
                retry_data = retry_res.json()
                cands = retry_data.get("candidates", [])
                if cands:
                    p_parts = cands[0].get("content", {}).get("parts", [])
                    raw_text = p_parts[0].get("text", "") if p_parts else ""

        parsed = extract_and_repair_json(raw_text)
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
                error_message=f"Invalid response: failed to parse JSON vote from Gemini ({err}).",
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

        await wait_for_provider_pacing(self.name, self.min_request_interval_seconds)

        last_vote: Optional[IndividualVote] = None

        try:
            async with httpx.AsyncClient(timeout=eff_timeout, follow_redirects=False) as client:
                for attempt in range(3):
                    try:
                        vote = await self._execute_single_attempt(
                            client=client,
                            model_name_used=self.model_id,
                            is_fallback_model=False,
                            system_instruction=system_instruction,
                            prompt=prompt,
                            round_number=round_number,
                        )
                        last_vote = vote

                        if vote.status == "success":
                            vote.latency_ms = int((time.perf_counter() - start_time) * 1000)
                            vote.display_name = self.display_name
                            return vote

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
                            error_message=f"Gemini request timed out after {eff_timeout}s.",
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
                    try:
                        fb_vote = await self._execute_single_attempt(
                            client=client,
                            model_name_used=self.fallback_model_id.strip(),
                            is_fallback_model=True,
                            system_instruction=system_instruction,
                            prompt=prompt,
                            round_number=round_number,
                        )
                        if fb_vote.status == "success":
                            fb_vote.latency_ms = int((time.perf_counter() - start_time) * 1000)
                            fb_vote.display_name = self.display_name
                            return fb_vote
                    except Exception:
                        pass

                ret_vote = last_vote or IndividualVote(
                    provider_name=self.name,
                    display_name=self.display_name,
                    model_id=self.model_id,
                    model_family=self.model_family,
                    model_used=self.model_id,
                    is_fallback=False,
                    status="failed",
                    round_number=round_number,
                    error_message="All Gemini retry attempts failed.",
                )
                ret_vote.latency_ms = int((time.perf_counter() - start_time) * 1000)
                ret_vote.display_name = self.display_name
                return ret_vote

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
                latency_ms=int((time.perf_counter() - start_time) * 1000),
                error_message=clean_exc,
            )
