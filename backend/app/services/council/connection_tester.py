"""
Service for testing AI Council provider connections, verifying credentials,
measuring latency & TTFT with fixed non-financial test prompts, and querying model catalogs with pricing.
Supports chat-capable model filtering, non-misleading catalog labeling, rate pacing,
concurrent 45s NVIDIA probes with capacity diagnosis & alternative suggestions, and median TTFT recording.
"""
import asyncio
import difflib
import json
import time
from typing import Optional, Dict, Any, List, Tuple
import httpx
from sqlalchemy.orm import Session

from app.config import settings
from app.core.security import redact_sensitive_info
from app.db.session import SessionLocal
from app.schemas.council import TestConnectionResponse
from app.services.council.base_adapter import (
    _UNSUPPORTED_THINKING_PROVIDERS,
    parse_retry_after,
    wait_for_provider_pacing,
)
from app.services.council.gemini_adapter import get_gemini_thinking_config
from app.services.council.health_manager import (
    get_thinking_support_db,
    record_thinking_support_db,
    record_provider_success,
    record_provider_test_result,
    record_provider_failure,
    record_provider_ttft,
    get_provider_median_ttft,
)
from app.services.council.json_repair import extract_and_repair_json

TEST_PING_PROMPT = "Ping! Respond strictly with the following JSON object and nothing else: {\"status\": \"ok\", \"ping\": \"pong\"}"
TEST_SYSTEM_INSTRUCTION = "You are an automated JSON connectivity test agent. Output strictly valid JSON."
TTFT_THRESHOLD_SECONDS = 30.0


def is_chat_capable_model(
    mid: str,
    metadata: Optional[Dict[str, Any]] = None,
    provider_name: str = "",
) -> bool:
    """
    Filters catalog lists to chat-capable models:
    Excludes embeddings, audio/speech (whisper, tts), image generation, moderation/guard, and rerank models.
    Uses provider metadata where it exists (Gemini supportedGenerationMethods, OpenRouter output modalities)
    and name-based rules as a fallback.
    """
    if not mid or not mid.strip():
        return False

    mid_clean = mid.lower().strip()

    # 1. Provider metadata checks
    if metadata and isinstance(metadata, dict):
        # Google Gemini metadata: supportedGenerationMethods
        gen_methods = metadata.get("supportedGenerationMethods", [])
        if gen_methods and isinstance(gen_methods, list):
            if "generateContent" not in gen_methods:
                return False

        # OpenRouter metadata: architecture.output_modalities / modality
        arch = metadata.get("architecture", {})
        if isinstance(arch, dict):
            out_modalities = arch.get("output_modalities", [])
            modality = arch.get("modality", "")
            if out_modalities and "text" not in out_modalities:
                return False
            if modality and "text" not in modality:
                return False

    # 2. Name-based rule fallback
    # Embeddings
    if any(k in mid_clean for k in ("embed", "-embedding", "/embedding", "text-embedding", "bge-large", "bge-small", "bge-base")):
        return False
    # Audio / Speech / TTS
    if any(k in mid_clean for k in ("whisper", "tts", "text-to-speech", "speech", "voice", "audio", "orpheus", "seamless")):
        return False
    # Image Gen / Vision-only output
    if any(k in mid_clean for k in ("dall-e", "imagen", "flux", "stable-diffusion", "sdxl", "midjourney", "image-generation", "instruct-pix2pix", "upscale")):
        return False
    # Moderation / Safety Guard
    if any(k in mid_clean for k in ("guard", "shieldgemma", "moderation", "safety-guard", "llama-guard", "wildguard")):
        return False
    # Rerankers
    if any(k in mid_clean for k in ("rerank", "reranker", "bge-rerank")):
        return False

    return True


async def _fetch_models_gemini(api_key: str) -> List[Tuple[str, bool]]:
    """Fetch chat-capable model IDs from Google Gemini API via x-goog-api-key header."""
    await wait_for_provider_pacing("gemini")
    url = "https://generativelanguage.googleapis.com/v1beta/models"
    headers = {"x-goog-api-key": api_key}
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(url, headers=headers)
        if res.status_code != 200:
            return []
        data = res.json()
        models: List[Tuple[str, bool]] = []
        for m in data.get("models", []):
            name = m.get("name", "")
            clean_name = name.replace("models/", "")
            if clean_name and is_chat_capable_model(clean_name, metadata=m, provider_name="gemini"):
                models.append((clean_name, False))
        return models


async def _fetch_models_openai_compatible(
    base_url: str,
    api_key: Optional[str] = None,
    is_openrouter: bool = False,
    provider_name: str = "",
) -> Tuple[List[str], List[str], Dict[str, bool]]:
    """
    Fetch chat-capable model IDs from OpenAI-compatible /models endpoint.
    Only OpenRouter pricing data determines 'Free' badge. For other providers, missing pricing is not free.
    Returns: (all_chat_model_ids, free_model_ids, is_free_map)
    """
    await wait_for_provider_pacing(provider_name)
    url = f"{base_url.rstrip('/')}/models"
    headers = {}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    if is_openrouter:
        headers["HTTP-Referer"] = "https://github.com/selormtettehabotsi/MoneyBudSaver"
        headers["X-Title"] = "MoneyCouncil"

    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(url, headers=headers)
        if res.status_code != 200:
            return [], [], {}
        data = res.json()
        items = data.get("data") or data.get("models") or []
        model_ids: List[str] = []
        free_models: List[str] = []
        is_free_map: Dict[str, bool] = {}

        for item in items:
            if isinstance(item, dict):
                mid = item.get("id") or item.get("name") or item.get("model")
                if not mid or not is_chat_capable_model(mid, metadata=item, provider_name=provider_name):
                    continue

                if is_openrouter:
                    pricing = item.get("pricing")
                    if isinstance(pricing, dict) and "prompt" in pricing and "completion" in pricing and pricing.get("prompt") is not None and pricing.get("completion") is not None:
                        try:
                            prompt_price = float(pricing.get("prompt"))
                            comp_price = float(pricing.get("completion"))
                            is_free = (prompt_price == 0.0 and comp_price == 0.0)
                        except (ValueError, TypeError):
                            is_free = False
                    elif ":free" in mid:
                        is_free = True
                    else:
                        is_free = False
                else:
                    is_free = False

                model_ids.append(mid)
                is_free_map[mid] = is_free
                if is_free:
                    free_models.append(mid)
            elif isinstance(item, str):
                if is_chat_capable_model(item, provider_name=provider_name):
                    model_ids.append(item)
                    is_free_map[item] = False

        free_models.sort()
        return model_ids, free_models, is_free_map


async def _fetch_models_ollama(base_url: str) -> List[str]:
    """Fetch model IDs from Ollama (100% local/private)."""
    await wait_for_provider_pacing("ollama")
    url = f"{base_url.rstrip('/')}/api/tags"
    async with httpx.AsyncClient(timeout=5) as client:
        res = await client.get(url)
        if res.status_code != 200:
            return []
        data = res.json()
        models: List[str] = []
        for m in data.get("models", []):
            name = m.get("name", "")
            if name and is_chat_capable_model(name, provider_name="ollama"):
                models.append(name)
                tagless = name.split(":")[0]
                if tagless not in models and is_chat_capable_model(tagless, provider_name="ollama"):
                    models.append(tagless)
        return models


def _get_tester_db_session():
    """Returns DB session respecting test dependency overrides if configured."""
    try:
        from main import app
        from app.core.dependencies import get_db
        if get_db in app.dependency_overrides:
            override = app.dependency_overrides[get_db]
            return next(override())
    except Exception:
        pass
    return SessionLocal()


async def verify_provider_connectivity(
    provider_name: str,
    model_id: Optional[str] = None,
    user_settings: Optional[Dict[str, Any]] = None,
    db: Optional[Session] = None,
) -> TestConnectionResponse:
    """
    Tests a single provider's connection with configured timeouts, streaming TTFT,
    rate pacing across call types, concurrent 45s NVIDIA probes, pricing badges, and median TTFT tracking.
    """
    custom_models = (user_settings or {}).get("custom_model_ids", {})
    custom_timeouts = (user_settings or {}).get("custom_timeouts", {})
    provider_name_lower = provider_name.lower().strip()

    # Determine provider-specific timeout (NVIDIA 90s, others 25s, or custom)
    if provider_name_lower in ("nvidia", "nvidia_kimi"):
        default_timeout = settings.NVIDIA_PROVIDER_TIMEOUT_SECONDS
    else:
        default_timeout = settings.AI_PROVIDER_DEFAULT_TIMEOUT_SECONDS
    eff_timeout = int(custom_timeouts.get(provider_name_lower, default_timeout))

    # Resolve provider credentials & endpoints
    api_key: Optional[str] = None
    resolved_model_id: str = (model_id or "").strip()
    base_url: Optional[str] = None
    is_gemini = False
    is_ollama = False
    is_openrouter = False

    if provider_name_lower == "gemini":
        is_gemini = True
        api_key = settings.GEMINI_API_KEY
        if not resolved_model_id:
            resolved_model_id = custom_models.get("gemini", settings.GEMINI_MODEL_ID)
    elif provider_name_lower == "groq":
        base_url = "https://api.groq.com/openai/v1"
        api_key = settings.GROQ_API_KEY
        if not resolved_model_id:
            resolved_model_id = custom_models.get("groq", settings.GROQ_MODEL_ID)
    elif provider_name_lower == "mistral":
        base_url = "https://api.mistral.ai/v1"
        api_key = settings.MISTRAL_API_KEY
        if not resolved_model_id:
            resolved_model_id = custom_models.get("mistral", settings.MISTRAL_MODEL_ID)
    elif provider_name_lower == "openrouter":
        is_openrouter = True
        base_url = "https://openrouter.ai/api/v1"
        api_key = settings.OPENROUTER_API_KEY
        if not resolved_model_id:
            resolved_model_id = custom_models.get("openrouter", settings.OPENROUTER_MODEL_ID)
    elif provider_name_lower == "nvidia":
        base_url = "https://integrate.api.nvidia.com/v1"
        api_key = settings.NVIDIA_API_KEY
        if not resolved_model_id:
            resolved_model_id = custom_models.get("nvidia", settings.NVIDIA_MODEL_ID)
    elif provider_name_lower == "nvidia_kimi":
        base_url = "https://integrate.api.nvidia.com/v1"
        api_key = settings.NVIDIA_API_KEY
        if not resolved_model_id:
            resolved_model_id = custom_models.get("nvidia_kimi", settings.NVIDIA_KIMI_MODEL_ID or "moonshotai/kimi-k3")
    elif provider_name_lower == "cerebras":
        base_url = "https://api.cerebras.ai/v1"
        api_key = settings.CEREBRAS_API_KEY
        if not resolved_model_id:
            resolved_model_id = custom_models.get("cerebras", settings.CEREBRAS_MODEL_ID)
    elif provider_name_lower == "ollama":
        is_ollama = True
        base_url = f"{settings.OLLAMA_BASE_URL}"
        if not resolved_model_id:
            resolved_model_id = custom_models.get("ollama", settings.OLLAMA_MODEL_ID)
    else:
        return TestConnectionResponse(
            provider_name=provider_name,
            model_id=resolved_model_id or "unknown",
            http_status=400,
            latency_ms=0,
            status="error",
            diagnosis=f"Unknown provider '{provider_name}'.",
            catalog_ok=False,
            chat_status="error",
        )

    # Check for missing API Key
    if not is_ollama and (not api_key or not api_key.strip()):
        return TestConnectionResponse(
            provider_name=provider_name,
            model_id=resolved_model_id,
            http_status=None,
            latency_ms=0,
            status="invalid_key",
            diagnosis="API Key is not configured in server environment or settings.",
            catalog_ok=False,
            chat_status="invalid_key",
            model_found_in_list=None,
            available_models_count=0,
            close_matches=[],
        )

    # Check for missing Model ID
    if not resolved_model_id:
        return TestConnectionResponse(
            provider_name=provider_name,
            model_id="",
            http_status=None,
            latency_ms=0,
            status="model_not_found",
            diagnosis="Model ID is not configured.",
            catalog_ok=False,
            chat_status="model_not_found",
            model_found_in_list=None,
            available_models_count=0,
            close_matches=[],
        )

    # Check DB for parameter fallback
    try:
        db_sess = db or _get_tester_db_session()
        db_thinking_supp = get_thinking_support_db(db_sess, provider_name_lower, resolved_model_id)
        if db_thinking_supp is False:
            _UNSUPPORTED_THINKING_PROVIDERS.add(provider_name_lower)
    except Exception:
        pass

    # 1. Fetch Catalog asynchronously
    available_models: List[str] = []
    free_models_list: List[str] = []
    is_free_map: Dict[str, bool] = {}

    try:
        if is_gemini:
            g_models = await _fetch_models_gemini(api_key)
            available_models = [m[0] for m in g_models]
            is_free_map = {m[0]: m[1] for m in g_models}
            free_models_list = []
        elif is_ollama:
            available_models = await _fetch_models_ollama(base_url)
            is_free_map = {m: False for m in available_models}
            free_models_list = []
        elif base_url:
            available_models, free_models_list, is_free_map = await _fetch_models_openai_compatible(
                base_url, api_key, is_openrouter=is_openrouter, provider_name=provider_name_lower
            )
    except Exception:
        pass

    # Free label rule: Only OpenRouter publishes prices.
    if is_openrouter:
        available_models_label = "Free models on OpenRouter"
    else:
        available_models_label = "Models available to your key (free-tier eligibility not published by this provider)"

    model_found_in_list: Optional[bool] = None
    close_matches: List[str] = []

    if available_models:
        clean_target = resolved_model_id.lower().strip()
        models_lower_map = {m.lower().strip(): m for m in available_models}

        if clean_target in models_lower_map:
            model_found_in_list = True
        else:
            model_found_in_list = False
            raw_matches = difflib.get_close_matches(
                resolved_model_id,
                available_models,
                n=5,
                cutoff=0.25,
            )
            if is_openrouter:
                close_matches = [
                    f"{m} [Free]" if is_free_map.get(m, False) or ":free" in m else m
                    for m in raw_matches
                ]
            else:
                close_matches = list(raw_matches)

    # 2. Rate pacing wait between catalog call and chat probe
    await wait_for_provider_pacing(provider_name_lower)

    # 3. Execute Chat Probes
    start_time = time.perf_counter()
    ttft_ms: Optional[int] = None
    retry_after_seconds: Optional[int] = None
    http_status: Optional[int] = None
    diagnosis = "Connection verified successfully."
    test_status = "success"
    chat_status = "ok"
    alternative_models: List[str] = []

    is_nvidia = provider_name_lower in ("nvidia", "nvidia_kimi")

    async def run_single_probe(include_extras: bool, timeout_sec: float) -> Tuple[int, Optional[int], Optional[str], Optional[int], str]:
        """
        Executes a test probe with TTFT measurement.
        Returns: (http_status, ttft_ms, error_text_or_json, retry_after_sec, probe_status)
        """
        p_start = time.perf_counter()
        p_ttft: Optional[int] = None

        if is_gemini:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{resolved_model_id}:generateContent"
            headers = {
                "x-goog-api-key": api_key,
                "Content-Type": "application/json",
            }
            gen_cfg: Dict[str, Any] = {
                "response_mime_type": "application/json",
                "maxOutputTokens": 256,
            }
            if include_extras and provider_name_lower not in _UNSUPPORTED_THINKING_PROVIDERS:
                thinking_cfg = get_gemini_thinking_config(resolved_model_id)
                if thinking_cfg:
                    gen_cfg["thinkingConfig"] = thinking_cfg

            payload = {
                "system_instruction": {"parts": [{"text": TEST_SYSTEM_INSTRUCTION}]},
                "contents": [{"role": "user", "parts": [{"text": TEST_PING_PROMPT}]}],
                "generationConfig": gen_cfg,
            }
            async with httpx.AsyncClient(timeout=timeout_sec) as client:
                res = await client.post(url, headers=headers, json=payload)
                p_ttft = int((time.perf_counter() - p_start) * 1000)
                r_after = parse_retry_after(res.headers.get("Retry-After")) if res.status_code == 429 else None
                return res.status_code, p_ttft, res.text, r_after, ("ok" if res.status_code == 200 else "error")

        else:
            endpoint = f"{base_url.rstrip('/')}/chat/completions" if not is_ollama else f"{base_url.rstrip('/')}/v1/chat/completions"
            headers = {"Content-Type": "application/json"}
            if api_key:
                headers["Authorization"] = f"Bearer {api_key}"
            if is_openrouter:
                headers["HTTP-Referer"] = "https://github.com/selormtettehabotsi/MoneyBudSaver"
                headers["X-Title"] = "MoneyCouncil"

            payload = {
                "model": resolved_model_id,
                "messages": [
                    {"role": "system", "content": TEST_SYSTEM_INSTRUCTION},
                    {"role": "user", "content": TEST_PING_PROMPT},
                ],
                "temperature": 0.1,
                "max_tokens": 256,
            }

            if include_extras and provider_name_lower not in _UNSUPPORTED_THINKING_PROVIDERS:
                if is_openrouter:
                    payload["reasoning"] = {"effort": "low"}
                elif is_nvidia:
                    payload["chat_template_kwargs"] = {"clear_thinking": True, "enable_thinking": False}
                    payload["reasoning_effort"] = "low"

            async with httpx.AsyncClient(timeout=timeout_sec) as client:
                res = await client.post(endpoint, json=payload, headers=headers)
                p_ttft = int((time.perf_counter() - p_start) * 1000)
                r_after = parse_retry_after(res.headers.get("Retry-After")) if res.status_code == 429 else None
                return res.status_code, p_ttft, res.text, r_after, ("ok" if res.status_code == 200 else "error")

    try:
        if is_nvidia:
            # NVIDIA: Cap diagnostic probes at 45s and run Probe 1 & Probe 2 concurrently
            nvidia_probe_timeout = 45.0
            p1_task = run_single_probe(include_extras=True, timeout_sec=nvidia_probe_timeout)
            p2_task = run_single_probe(include_extras=False, timeout_sec=nvidia_probe_timeout)
            results = await asyncio.gather(p1_task, p2_task, return_exceptions=True)

            res1, res2 = results[0], results[1]
            p1_ok = not isinstance(res1, Exception) and res1[0] == 200
            p2_ok = not isinstance(res2, Exception) and res2[0] == 200

            if p1_ok:
                http_status = res1[0]
                ttft_ms = res1[1]
                resp_text = res1[2]
                test_status = "success"
                chat_status = "ok"
                diagnosis = "Connection verified successfully."
            elif p2_ok:
                http_status = res2[0]
                ttft_ms = res2[1]
                resp_text = res2[2]
                test_status = "success"
                chat_status = "ok"
                diagnosis = "Parameter probe timed out, clean probe succeeded: thinking parameters caused hang (thinking control not supported)."
                _UNSUPPORTED_THINKING_PROVIDERS.add(provider_name_lower)
                try:
                    db_sess = db or _get_tester_db_session()
                    record_thinking_support_db(db_sess, provider_name_lower, resolved_model_id, supported=False)
                except Exception:
                    pass
            else:
                # Both probes failed
                probe_status = None
                probe_resp_text = ""
                probe_retry_after = None
                for r in (res1, res2):
                    if not isinstance(r, Exception):
                        probe_status = r[0]
                        probe_resp_text = r[2]
                        probe_retry_after = r[3]
                        break

                if probe_status in (401, 403):
                    http_status = probe_status
                    test_status = "invalid_key"
                    chat_status = "invalid_key"
                    diagnosis = f"Invalid API Key: Provider rejected authentication (HTTP {probe_status})."
                elif probe_status == 404:
                    http_status = 404
                    test_status = "model_not_found"
                    chat_status = "model_not_found"
                    diagnosis = f"Model ID '{resolved_model_id}' not found by provider (HTTP 404)."
                elif probe_status == 429:
                    http_status = 429
                    test_status = "rate_limited"
                    chat_status = "rate_limited"
                    retry_after_seconds = probe_retry_after
                    r_sec = retry_after_seconds or 5
                    diagnosis = f"Provider rate limit reached (HTTP 429). Retry in {r_sec} seconds."
                else:
                    test_status = "timeout"
                    chat_status = "timeout"
                    http_status = probe_status if probe_status else 504
                    diagnosis = "NVIDIA NIM timed out on both parameter and clean probes (capped at 45s): provider-side capacity issue."
                    alt_models = [m for m in available_models if m.lower() != resolved_model_id.lower()][:3]
                    alternative_models = alt_models
                    if alt_models:
                        diagnosis += f" Suggested alternatives: {', '.join(alt_models)}"
                    resp_text = probe_resp_text

        else:
            # Standard single probe with parameter fallback
            h_status, probe_ttft, resp_text, r_after, p_status = await run_single_probe(
                include_extras=True, timeout_sec=float(eff_timeout)
            )
            http_status = h_status
            ttft_ms = probe_ttft
            retry_after_seconds = r_after

            # Auto-retry on 400 or 422 if thinking parameter unsupported
            if http_status in (400, 422):
                is_unsupp = False
                try:
                    err_data = json.loads(resp_text)
                    err_obj = err_data.get("error", {}) if isinstance(err_data, dict) else {}
                    code = str(err_obj.get("code", "")).lower()
                    param = str(err_obj.get("param", "")).lower()
                    err_msg = str(err_obj.get("message", "")).lower()
                except Exception:
                    code, param, err_msg = "", "", (resp_text or "").lower()

                if param in ("chat_template_kwargs", "reasoning_effort", "reasoning", "enable_thinking", "clear_thinking", "thinkingconfig", "thinkingbudget", "thinkinglevel"):
                    is_unsupp = True
                elif code in ("unrecognized_parameter", "unsupported_parameter", "invalid_parameter"):
                    is_unsupp = True
                elif any(t in err_msg for t in ("chat_template_kwargs", "enable_thinking", "clear_thinking", "reasoning_effort", "reasoning", "thinking", "unknown parameter", "unrecognized", "extra fields not permitted", "unexpected field", "invalid argument")):
                    is_unsupp = True

                if is_unsupp:
                    _UNSUPPORTED_THINKING_PROVIDERS.add(provider_name_lower)
                    try:
                        with SessionLocal() as db_sess:
                            record_thinking_support_db(db_sess, provider_name_lower, resolved_model_id, supported=False)
                    except Exception:
                        pass

                    h_status2, probe_ttft2, resp_text2, r_after2, _ = await run_single_probe(
                        include_extras=False, timeout_sec=float(eff_timeout)
                    )
                    http_status = h_status2
                    ttft_ms = probe_ttft2
                    resp_text = resp_text2
                    retry_after_seconds = r_after2
                    if http_status == 200:
                        diagnosis = "Connection verified (thinking control not supported)."

            if http_status == 200:
                test_status = "success"
                chat_status = "ok"
            elif http_status in (401, 403):
                test_status = "invalid_key"
                chat_status = "invalid_key"
                diagnosis = f"Invalid API Key: Provider rejected authentication (HTTP {http_status})."
            elif http_status == 404:
                test_status = "model_not_found"
                chat_status = "model_not_found"
                diagnosis = f"Model ID '{resolved_model_id}' not found by provider (HTTP 404)."
            elif http_status == 429:
                test_status = "rate_limited"
                chat_status = "rate_limited"
                r_sec = retry_after_seconds or 5
                diagnosis = f"Provider rate limit reached (HTTP 429). Retry in {r_sec} seconds."
            else:
                test_status = "error"
                chat_status = "error"
                clean_err = redact_sensitive_info((resp_text or "")[:120])
                diagnosis = f"Provider returned HTTP {http_status}: {clean_err}"

        # JSON response validation on 200
        if http_status == 200 and resp_text:
            raw_content = resp_text
            try:
                outer_json = json.loads(resp_text)
                if isinstance(outer_json, dict):
                    if "choices" in outer_json and outer_json["choices"]:
                        raw_content = outer_json["choices"][0].get("message", {}).get("content", "")
                    elif "candidates" in outer_json and outer_json["candidates"]:
                        parts = outer_json["candidates"][0].get("content", {}).get("parts", [])
                        if parts:
                            raw_content = parts[0].get("text", "")
                    elif "message" in outer_json and isinstance(outer_json["message"], dict):
                        raw_content = outer_json["message"].get("content", "")
                    elif "response" in outer_json:
                        raw_content = str(outer_json["response"])
            except Exception:
                raw_content = resp_text

            parsed = extract_and_repair_json(raw_content)
            if not parsed or (parsed.get("status") != "ok" and parsed.get("ping") != "pong"):
                test_status = "bad_json"
                chat_status = "bad_json"
                diagnosis = "Model returned unparsable or malformed JSON test response."

    except httpx.TimeoutException:
        test_status = "timeout"
        chat_status = "timeout"
        diagnosis = f"Connection timed out after {eff_timeout} seconds."

    except Exception as e:
        test_status = "error"
        chat_status = "error"
        clean_msg = redact_sensitive_info(str(e))
        diagnosis = f"Connection error: {clean_msg}"

    latency_ms = int((time.perf_counter() - start_time) * 1000)

    # Privacy hint for OpenRouter :free models
    privacy_hint: Optional[str] = None
    if is_openrouter and ":free" in resolved_model_id and (http_status == 404 or model_found_in_list is False):
        privacy_hint = "Free endpoint not found. Your OpenRouter privacy settings may be hiding free endpoints. Check your settings at https://openrouter.ai/settings/privacy"
        if "privacy settings" not in diagnosis:
            diagnosis += f" {privacy_hint}"

    # Determine is_free status (only OpenRouter publishes pricing)
    is_free_val = is_free_map.get(resolved_model_id, False) if is_openrouter else False

    # Record TTFT sample in DB
    if ttft_ms is not None and ttft_ms > 0:
        try:
            db_sess = db or _get_tester_db_session()
            record_provider_ttft(db_sess, provider_name_lower, ttft_ms)
        except Exception:
            pass

    # Retrieve rolling median TTFT
    median_ttft: Optional[int] = None
    try:
        db_sess = db or _get_tester_db_session()
        median_ttft = get_provider_median_ttft(db_sess, provider_name_lower)
    except Exception:
        pass

    # Record in Circuit Breaker database
    try:
        db_sess = db or _get_tester_db_session()
        res_dict = {
            "status": test_status,
            "http_status": http_status,
            "latency_ms": latency_ms,
            "diagnosis": diagnosis,
        }
        if test_status == "success":
            record_provider_success(db_sess, provider_name_lower, res_dict)
        else:
            record_provider_test_result(db_sess, provider_name_lower, res_dict)
    except Exception:
        pass

    return TestConnectionResponse(
        provider_name=provider_name,
        model_id=resolved_model_id,
        http_status=http_status,
        latency_ms=latency_ms,
        status=test_status,
        diagnosis=diagnosis,
        catalog_ok=bool(model_found_in_list),
        chat_status=chat_status,
        ttft_ms=ttft_ms,
        median_ttft_ms=median_ttft,
        retry_after_seconds=retry_after_seconds,
        is_free=is_free_val,
        free_models=free_models_list,
        available_models_label=available_models_label,
        alternative_models=alternative_models,
        privacy_hint=privacy_hint,
        model_found_in_list=model_found_in_list,
        available_models_count=len(available_models),
        close_matches=close_matches,
    )
