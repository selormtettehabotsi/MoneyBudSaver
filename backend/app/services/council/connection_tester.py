"""
Service for testing AI Council provider connections, verifying credentials,
measuring latency & TTFT with fixed non-financial test prompts, querying model catalogs,
enforcing Free-Only eligibility, ranking model candidates (non-alphabetical),
concurrent 90s NVIDIA probes, and rolling median TTFT tracking.
"""
import asyncio
import difflib
import json
import os
import time
from typing import Optional, Dict, Any, List, Tuple, Set
import httpx
from sqlalchemy.orm import Session

from app.config import settings
from app.core.security import redact_sensitive_info
from app.db.session import SessionLocal
from app.models.council import ProviderSetting, RecommendedModel, FreeTierAllowlist
from app.schemas.council import (
    TestConnectionResponse,
    FindWorkingModelCandidateResult,
)
from app.services.council.adapters_factory import (
    derive_model_family,
    get_resolved_provider_config,
)
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
from app.services.council.ssrf_protection import validate_custom_endpoint_url
from app.services.council.pattern_resolver import (
    get_patterns_for_provider,
    resolve_provider_recommended_patterns,
)

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
    if any(k in mid_clean for k in ("embed", "-embedding", "/embedding", "text-embedding", "nv-embed", "bge-large", "bge-small", "bge-base")):
        return False
    # Audio / Speech / TTS
    if any(k in mid_clean for k in ("whisper", "tts", "text-to-speech", "speech", "voice", "audio", "orpheus", "seamless", "parakeet")):
        return False
    # Vision-only / OCR / Parse
    if any(k in mid_clean for k in ("fuyu", "nemotron-parse", "nougat", "ocr", "parse")):
        return False
    # Image Gen / Video Gen
    if any(k in mid_clean for k in ("dall-e", "imagen", "flux", "stable-diffusion", "sdxl", "midjourney", "image-generation", "instruct-pix2pix", "upscale", "video")):
        return False
    # Moderation / Safety Guard
    if any(k in mid_clean for k in ("guard", "shieldgemma", "moderation", "safety-guard", "llama-guard", "wildguard", "omni-moderation", "text-moderation")):
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
    async with httpx.AsyncClient(timeout=10, follow_redirects=False) as client:
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
    allowlist: Optional[Set[str]] = None,
) -> Tuple[List[str], List[str], Dict[str, bool]]:
    """
    Fetch chat-capable model IDs from OpenAI-compatible /models endpoint.
    Only OpenRouter pricing data determines 'Free' badge directly. For other providers,
    the free tier allowlist or user confirmation flag is used.
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

    allow_set = allowlist or set()

    async with httpx.AsyncClient(timeout=10, follow_redirects=False) as client:
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
                    is_free = (mid.lower() in allow_set)

                model_ids.append(mid)
                is_free_map[mid] = is_free
                if is_free:
                    free_models.append(mid)

            elif isinstance(item, str):
                if is_chat_capable_model(item, provider_name=provider_name):
                    model_ids.append(item)
                    is_free = (item.lower() in allow_set)
                    is_free_map[item] = is_free
                    if is_free:
                        free_models.append(item)

        return model_ids, sorted(free_models), is_free_map


async def _fetch_models_ollama(base_url: str) -> List[str]:
    """Fetch model IDs from Ollama (100% local/private)."""
    await wait_for_provider_pacing("ollama")
    url = f"{base_url.rstrip('/')}/api/tags"
    async with httpx.AsyncClient(timeout=5, follow_redirects=False) as client:
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


def rank_model_candidates(
    candidates: List[str],
    provider_name: str,
    recommended_ids: List[str],
    other_active_families: Optional[Set[str]] = None,
) -> List[str]:
    """
    Ranks candidate models according to strict non-alphabetical criteria:
    1. In recommended list (ranked by sort order)
    2. Family not already used by other voters (increases council diversity)
    3. Larger instruct or chat models (70b, 72b, 120b, flash, etc.)
    4. Recent release / version numbers (e.g. 3.3 > 3.1, 2.5 > 1.5, glm-5.3, etc.)
    
    NEVER ranks alphabetically.
    """
    other_fams = other_active_families or set()
    rec_lower_list = [r.lower().strip() for r in recommended_ids]

    def candidate_score(mid: str) -> float:
        score = 0.0
        m_lower = mid.lower().strip()

        # 1. Recommended list priority
        if m_lower in rec_lower_list:
            rec_idx = rec_lower_list.index(m_lower)
            score += 1000.0 - (rec_idx * 10.0)

        # 2. Family diversity bonus
        fam = derive_model_family(mid, provider_name)
        if fam and fam not in other_fams:
            score += 200.0

        # 3. Model capacity / parameter size
        if any(s in m_lower for s in ("120b", "405b", "72b", "70b", "32b", "27b")):
            score += 100.0
        elif any(s in m_lower for s in ("flash", "instruct", "chat")):
            score += 50.0
        elif any(s in m_lower for s in ("8b", "9b", "7b", "3b")):
            score += 25.0

        # 4. Modern version bonus
        if any(v in m_lower for v in ("3.3", "3.8", "3.5", "2.5", "5.3", "r1", "k3", "v3", "qwq")):
            score += 40.0
        elif any(v in m_lower for v in ("3.1", "3.0", "2.0", "1.5")):
            score += 20.0

        return score

    return sorted(candidates, key=candidate_score, reverse=True)


async def verify_provider_connectivity(
    provider_name: str,
    model_id: Optional[str] = None,
    user_settings: Optional[Dict[str, Any]] = None,
    db: Optional[Session] = None,
) -> TestConnectionResponse:
    """
    Tests a single provider's connection with configured timeouts, streaming TTFT,
    rate pacing across call types, concurrent 90s NVIDIA probes, pricing badges, and median TTFT tracking.
    """
    p_name_lower = provider_name.lower().strip()

    # Map legacy keys to slot keys
    p_key = p_name_lower
    if p_key == "groq":
        p_key = "groq_1"
    elif p_key == "openrouter":
        p_key = "openrouter_1"
    elif p_key == "nvidia":
        p_key = "nvidia_2"
    elif p_key == "nvidia_kimi":
        p_key = "nvidia_1"

    # Resolve settings from DB/Env/Defaults
    db_session = db or _get_tester_db_session()
    resolved_cfg = get_resolved_provider_config(p_key, db=db_session, user_settings=user_settings)

    eff_timeout = int(resolved_cfg["timeout"])
    if p_key in ("nvidia_1", "nvidia_2", "nvidia", "nvidia_kimi"):
        eff_timeout = max(eff_timeout, 90)

    resolved_model_id = (model_id or resolved_cfg["model_id"] or "").strip()

    # Resolve provider credentials & endpoints
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    is_gemini = False
    is_ollama = False
    is_openrouter = False
    is_nvidia = p_key in ("nvidia_1", "nvidia_2", "nvidia", "nvidia_kimi")
    is_custom = p_key in ("custom_1", "custom_2")

    if p_key == "gemini":
        is_gemini = True
        api_key = settings.GEMINI_API_KEY

    elif p_key in ("groq_1", "groq_2"):
        base_url = "https://api.groq.com/openai/v1"
        api_key = settings.GROQ_API_KEY

    elif p_key in ("openrouter_1", "openrouter_2"):
        is_openrouter = True
        base_url = "https://openrouter.ai/api/v1"
        api_key = settings.OPENROUTER_API_KEY

    elif p_key in ("nvidia_1", "nvidia_2"):
        base_url = "https://integrate.api.nvidia.com/v1"
        api_key = settings.NVIDIA_API_KEY

    elif is_custom:
        base_url = resolved_cfg.get("base_url")
        env_key_name = resolved_cfg.get("env_key_name") or ""
        if env_key_name:
            api_key = os.environ.get(env_key_name, "")
        if not base_url:
            return TestConnectionResponse(
                provider_name=provider_name,
                model_id=resolved_model_id or "unknown",
                http_status=400,
                latency_ms=0,
                status="error",
                diagnosis="Custom provider missing Base URL.",
                catalog_ok=False,
                chat_status="error",
            )
        is_valid_url, url_err = validate_custom_endpoint_url(base_url)
        if not is_valid_url:
            return TestConnectionResponse(
                provider_name=provider_name,
                model_id=resolved_model_id or "unknown",
                http_status=400,
                latency_ms=0,
                status="error",
                diagnosis=f"SSRF Protection Error: {url_err}",
                catalog_ok=False,
                chat_status="error",
            )

    elif p_key == "ollama":
        is_ollama = True
        base_url = f"{settings.OLLAMA_BASE_URL}"

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
            diagnosis="API Key is not configured in server environment.",
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
            diagnosis="Model ID is not configured (choose a model).",
            catalog_ok=False,
            chat_status="model_not_found",
            model_found_in_list=None,
            available_models_count=0,
            close_matches=[],
        )

    # Check DB for parameter fallback
    try:
        db_thinking_supp = get_thinking_support_db(db_session, p_key, resolved_model_id)
        if db_thinking_supp is False:
            _UNSUPPORTED_THINKING_PROVIDERS.add(p_key)
    except Exception:
        pass

    # Load free tier allowlist from DB
    allowlist_models: Set[str] = set()
    try:
        raw_allow = db_session.query(FreeTierAllowlist).all()
        allowlist_models = {r.model_id.lower().strip() for r in raw_allow}
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
            for m in available_models:
                is_free_map[m] = (m.lower() in allowlist_models)
                if is_free_map[m]:
                    free_models_list.append(m)
        elif is_ollama:
            available_models = await _fetch_models_ollama(base_url)
            is_free_map = {m: True for m in available_models}
            free_models_list = list(available_models)
        elif base_url:
            available_models, free_models_list, is_free_map = await _fetch_models_openai_compatible(
                base_url, api_key, is_openrouter=is_openrouter, provider_name=p_key, allowlist=allowlist_models
            )
    except Exception:
        pass

    # Catalog Label
    if is_openrouter:
        available_models_label = "Free models on OpenRouter"
    elif is_custom:
        available_models_label = "Models available on custom endpoint (Warning: free eligibility unverified)"
    else:
        available_models_label = "Models available to your key (free-tier eligibility not published by this provider)"

    # Check model presence in catalog
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
                close_matches = [f"{m} [Free]" if is_free_map.get(m) else f"{m} [Paid]" for m in raw_matches]
            else:
                close_matches = list(raw_matches)

    # 2. Rate pacing wait between catalog call and chat probe
    await wait_for_provider_pacing(p_key)

    # 3. Execute Chat Probes
    start_time = time.perf_counter()
    ttft_ms: Optional[int] = None
    retry_after_seconds: Optional[int] = None
    http_status: Optional[int] = None
    diagnosis = "Connection verified successfully."
    test_status = "success"
    chat_status = "ok"
    alternative_models: List[str] = []

    async def run_single_probe(include_extras: bool, timeout_sec: float) -> Tuple[int, Optional[int], Optional[str], Optional[int], str]:
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
            if include_extras and p_key not in _UNSUPPORTED_THINKING_PROVIDERS:
                thinking_cfg = get_gemini_thinking_config(resolved_model_id)
                if thinking_cfg:
                    gen_cfg["thinkingConfig"] = thinking_cfg

            payload = {
                "system_instruction": {"parts": [{"text": TEST_SYSTEM_INSTRUCTION}]},
                "contents": [{"role": "user", "parts": [{"text": TEST_PING_PROMPT}]}],
                "generationConfig": gen_cfg,
            }
            async with httpx.AsyncClient(timeout=timeout_sec, follow_redirects=False) as client:
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

            if include_extras and p_key not in _UNSUPPORTED_THINKING_PROVIDERS:
                if is_openrouter:
                    payload["reasoning"] = {"effort": "low"}
                elif is_nvidia:
                    payload["chat_template_kwargs"] = {"clear_thinking": True, "enable_thinking": False}
                    payload["reasoning_effort"] = "low"

            async with httpx.AsyncClient(timeout=timeout_sec, follow_redirects=False) as client:
                res = await client.post(endpoint, json=payload, headers=headers)
                p_ttft = int((time.perf_counter() - p_start) * 1000)
                r_after = parse_retry_after(res.headers.get("Retry-After")) if res.status_code == 429 else None
                return res.status_code, p_ttft, res.text, r_after, ("ok" if res.status_code == 200 else "error")

    try:
        if is_nvidia:
            # NVIDIA: Cap diagnostic probes at 90s and run Probe 1 & Probe 2 concurrently
            nvidia_probe_timeout = 90.0
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
                diagnosis = "Clean probe succeeded: thinking control not supported (thinking parameters caused hang)."
                _UNSUPPORTED_THINKING_PROVIDERS.add(p_key)
                try:
                    record_thinking_support_db(db_session, p_key, resolved_model_id, supported=False)
                except Exception:
                    pass
            else:
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
                elif probe_status in (402, 429) and any(q in (probe_resp_text or "").lower() for q in ("insufficient", "quota", "credit", "balance", "billable")):
                    http_status = probe_status
                    test_status = "rate_limited"
                    chat_status = "rate_limited"
                    diagnosis = "not free, disabled: Free quota exhausted or billing required."
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
                    diagnosis = "NVIDIA NIM timed out on both parameter and clean probes (capped at 90s): provider-side capacity issue."
                    resp_text = probe_resp_text

        else:
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
                    _UNSUPPORTED_THINKING_PROVIDERS.add(p_key)
                    try:
                        record_thinking_support_db(db_session, p_key, resolved_model_id, supported=False)
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
            elif http_status in (402, 429) and any(q in (resp_text or "").lower() for q in ("insufficient", "quota", "credit", "balance", "billable")):
                test_status = "rate_limited"
                chat_status = "rate_limited"
                diagnosis = "not free, disabled: Free quota exhausted or billing required."
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

    # Determine is_free status
    is_free_val = is_free_map.get(resolved_model_id, False) if is_openrouter else (resolved_model_id.lower() in allowlist_models or resolved_cfg.get("confirmed_free", False))

    # Record TTFT sample in DB
    if ttft_ms is not None and ttft_ms > 0:
        try:
            record_provider_ttft(db_session, p_key, ttft_ms)
        except Exception:
            pass

    # Retrieve rolling median TTFT
    median_ttft: Optional[int] = None
    try:
        median_ttft = get_provider_median_ttft(db_session, p_key)
    except Exception:
        pass

    # Record in Circuit Breaker database
    try:
        res_dict = {
            "status": test_status,
            "http_status": http_status,
            "latency_ms": latency_ms,
            "diagnosis": diagnosis,
        }
        if test_status == "success":
            record_provider_success(db_session, p_key, res_dict)
        else:
            record_provider_test_result(db_session, p_key, res_dict)
    except Exception:
        pass

    # Build Alternative suggestions if failed or requested
    if available_models and test_status != "success":
        recs: List[str] = []
        try:
            db_recs = db_session.query(RecommendedModel).filter(RecommendedModel.provider_name == p_key).order_by(RecommendedModel.sort_order.asc()).all()
            recs = [r.model_id for r in db_recs]
        except Exception:
            pass
        ranked_alts = rank_model_candidates(
            [m for m in available_models if m.lower() != resolved_model_id.lower()],
            provider_name=p_key,
            recommended_ids=recs,
        )
        alternative_models = ranked_alts[:4]

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


async def find_working_candidates_for_provider(
    provider_name: str,
    db: Session,
    user_settings: Optional[Dict[str, Any]] = None,
) -> List[FindWorkingModelCandidateResult]:
    """
    Sequentially probes candidates for a provider:
    1. Resolves recommended patterns against live catalog first (newest/largest first)
    2. Then tests top ranked candidates from live catalog
    Paced, non-alphabetical ranking, returns test results list for user to tap 'Apply'.
    """
    p_key = provider_name.lower().strip()
    if p_key == "groq":
        p_key = "groq_1"
    elif p_key == "openrouter":
        p_key = "openrouter_1"
    elif p_key == "nvidia":
        p_key = "nvidia_2"
    elif p_key == "nvidia_kimi":
        p_key = "nvidia_1"

    # 1. Fetch recommended patterns
    patterns = get_patterns_for_provider(p_key, db=db)

    # 2. Probe catalog to discover candidate models
    test_res = await verify_provider_connectivity(provider_name=p_key, db=db, user_settings=user_settings)
    all_catalog = test_res.free_models if test_res.free_models else (test_res.close_matches or [])

    # 3. Resolve patterns against live catalog
    resolved_records = resolve_provider_recommended_patterns(
        provider_name=p_key,
        patterns=patterns,
        catalog_models=all_catalog,
        is_free_map=None,
    )
    rec_resolved_ids = [r["resolved_model_id"] for r in resolved_records if r["resolved_model_id"]]
    if not rec_resolved_ids:
        for pat in patterns:
            if "*" not in pat and "?" not in pat and pat not in rec_resolved_ids:
                rec_resolved_ids.append(pat)

    # 4. Form candidate list (resolved recommended first, then ranked catalog)
    candidate_set: Set[str] = set()
    candidate_list: List[str] = []

    for r_id in rec_resolved_ids:
        if r_id not in candidate_set:
            candidate_set.add(r_id)
            candidate_list.append(r_id)

    ranked_catalog = rank_model_candidates(
        candidates=[m for m in all_catalog if m not in candidate_set],
        provider_name=p_key,
        recommended_ids=rec_resolved_ids,
    )

    for m_id in ranked_catalog:
        if len(candidate_list) >= 6:
            break
        if m_id not in candidate_set:
            candidate_set.add(m_id)
            candidate_list.append(m_id)

    results: List[FindWorkingModelCandidateResult] = []

    for cand_id in candidate_list[:5]:
        await wait_for_provider_pacing(p_key)
        probe_res = await verify_provider_connectivity(
            provider_name=p_key,
            model_id=cand_id,
            user_settings=user_settings,
            db=db,
        )
        passed = (probe_res.status == "success")
        fam = derive_model_family(cand_id, p_key)
        is_rec = (cand_id in rec_resolved_ids or cand_id in patterns)

        results.append(
            FindWorkingModelCandidateResult(
                model_id=cand_id,
                provider_name=p_key,
                model_family=fam,
                is_recommended=is_rec,
                is_free=bool(probe_res.is_free),
                status="passed" if passed else "failed",
                http_status=probe_res.http_status,
                latency_ms=probe_res.latency_ms,
                ttft_ms=probe_res.ttft_ms,
                diagnosis=probe_res.diagnosis,
            )
        )

        # Space out probe calls
        await asyncio.sleep(0.5)

    return results


async def use_recommended_for_provider(
    provider_name: str,
    db: Session,
    user_settings: Optional[Dict[str, Any]] = None,
) -> Tuple[bool, Optional[str], List[FindWorkingModelCandidateResult], str]:
    """
    One-tap flow: resolves recommended patterns against live catalog at runtime,
    tests resolved models in order (newest/largest first), and activates the first one that passes.
    Returns: (success, applied_model_id, attempts_list, message)
    """
    p_key = provider_name.lower().strip()
    if p_key == "groq":
        p_key = "groq_1"
    elif p_key == "openrouter":
        p_key = "openrouter_1"
    elif p_key == "nvidia":
        p_key = "nvidia_2"
    elif p_key == "nvidia_kimi":
        p_key = "nvidia_1"

    # 1. Fetch patterns from DB or config
    patterns = get_patterns_for_provider(p_key, db=db)

    # 2. Probe catalog to resolve patterns against live catalog
    cat_probe = await verify_provider_connectivity(provider_name=p_key, db=db, user_settings=user_settings)
    catalog_models = list(cat_probe.free_models if cat_probe.free_models else (cat_probe.close_matches or []))
    if cat_probe.model_id and cat_probe.model_id not in catalog_models:
        catalog_models.append(cat_probe.model_id)

    # 3. Resolve patterns
    resolved_records = resolve_provider_recommended_patterns(
        provider_name=p_key,
        patterns=patterns,
        catalog_models=catalog_models,
        is_free_map=None,
    )
    candidates_to_test = [r["resolved_model_id"] for r in resolved_records if r["resolved_model_id"]]

    # Fallback to literal patterns without wildcards if catalog resolution is empty
    if not candidates_to_test:
        for pat in patterns:
            if "*" not in pat and "?" not in pat and pat not in candidates_to_test:
                candidates_to_test.append(pat)

    # Fallback to configured model if still empty
    if not candidates_to_test:
        cfg = get_resolved_provider_config(p_key, db=db)
        if cfg["model_id"]:
            candidates_to_test = [cfg["model_id"]]

    attempts: List[FindWorkingModelCandidateResult] = []

    for r_id in candidates_to_test:
        await wait_for_provider_pacing(p_key)
        probe_res = await verify_provider_connectivity(
            provider_name=p_key,
            model_id=r_id,
            user_settings=user_settings,
            db=db,
        )
        is_confirmed_free = bool(probe_res.is_free)
        passed = (probe_res.status == "success" and is_confirmed_free)
        fam = derive_model_family(r_id, p_key)
        diag = probe_res.diagnosis
        if probe_res.status == "success" and not is_confirmed_free:
            diag = f"Model '{r_id}' responded with HTTP 200 but is unconfirmed/paid. Free-only enforcement skipped activation."

        attempt_item = FindWorkingModelCandidateResult(
            model_id=r_id,
            provider_name=p_key,
            model_family=fam,
            is_recommended=True,
            is_free=is_confirmed_free,
            status="passed" if passed else "failed",
            http_status=probe_res.http_status,
            latency_ms=probe_res.latency_ms,
            ttft_ms=probe_res.ttft_ms,
            diagnosis=diag,
        )
        attempts.append(attempt_item)

        if passed:
            # Save into DB provider_settings
            setting = db.query(ProviderSetting).filter(ProviderSetting.provider_key == p_key).first()
            if not setting:
                setting = ProviderSetting(
                    provider_key=p_key,
                    model_id=r_id,
                    family_override=fam,
                    enabled=True,
                    timeout=probe_res.median_ttft_ms or 25,
                    confirmed_free=True,
                    history=[],
                )
                db.add(setting)
            else:
                old_mid = setting.model_id
                if old_mid and old_mid != r_id:
                    hist = list(setting.history or [])
                    if old_mid not in hist:
                        hist.insert(0, old_mid)
                    setting.history = hist[:5]
                setting.model_id = r_id
                setting.family_override = fam
                setting.confirmed_free = True

            db.commit()
            return True, r_id, attempts, f"Successfully tested and activated recommended model '{r_id}'."

        await asyncio.sleep(0.5)

    return False, None, attempts, "None of the recommended models passed connection testing."


async def fix_all_providers(
    db: Session,
    user_settings: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Goes through every failed or empty voter, tries the recommended list in order,
    applies working models, and returns a comprehensive summary.
    """
    targets = ["gemini", "groq_1", "groq_2", "openrouter_1", "openrouter_2", "nvidia_1", "nvidia_2"]
    results: List[Dict[str, Any]] = []

    for p in targets:
        cfg = get_resolved_provider_config(p, db=db, user_settings=user_settings)
        if not cfg["enabled"]:
            continue

        # Test current model
        test_res = await verify_provider_connectivity(provider_name=p, db=db, user_settings=user_settings)
        if test_res.status == "success":
            results.append({
                "provider_key": p,
                "action": "already_working",
                "model_id": test_res.model_id,
                "message": f"Provider '{p}' already connected and working on '{test_res.model_id}'.",
            })
            continue

        # Try recommended models
        succ, applied_id, attempts, msg = await use_recommended_for_provider(
            provider_name=p,
            db=db,
            user_settings=user_settings,
        )

        if succ and applied_id:
            results.append({
                "provider_key": p,
                "action": "fixed",
                "old_model_id": test_res.model_id,
                "new_model_id": applied_id,
                "message": f"Switched to working recommended model '{applied_id}'.",
                "attempts": [a.model_dump(mode="json") for a in attempts],
            })
        else:
            results.append({
                "provider_key": p,
                "action": "failed",
                "old_model_id": test_res.model_id,
                "message": f"Could not fix provider '{p}': {msg}",
                "attempts": [a.model_dump(mode="json") for a in attempts],
            })

        await asyncio.sleep(0.5)

    fixed_count = sum(1 for r in results if r["action"] == "fixed")
    working_count = sum(1 for r in results if r["action"] == "already_working")
    failed_count = sum(1 for r in results if r["action"] == "failed")

    return {
        "summary": f"Fix all completed: {fixed_count} fixed, {working_count} already working, {failed_count} failed.",
        "fixed_count": fixed_count,
        "working_count": working_count,
        "failed_count": failed_count,
        "details": results,
    }


async def auto_switch_provider_model(
    provider_key: str,
    db: Session,
    reason: str = "Model returned 404 not found during deliberation",
) -> Optional[str]:
    """
    If auto-switch setting is enabled in DB, finds the next passing confirmed-free recommended model,
    activates it, records the change in ModelSwitchLog, and returns the new model ID.
    """
    from datetime import datetime, timezone
    from app.models.council import CouncilAppSetting, ModelSwitchLog

    # Check setting
    setting = db.query(CouncilAppSetting).filter(CouncilAppSetting.setting_key == "auto_switch_on_missing_model").first()
    is_enabled = bool(setting.setting_value) if setting is not None else True
    if not is_enabled:
        return None

    # Find current model ID
    p_key = provider_key.lower().strip()
    curr_setting = db.query(ProviderSetting).filter(ProviderSetting.provider_key == p_key).first()
    old_model = curr_setting.model_id if curr_setting else ""

    succ, applied_id, attempts, msg = await use_recommended_for_provider(
        provider_name=p_key,
        db=db,
    )

    if succ and applied_id and applied_id != old_model:
        # Record switch log
        log_entry = ModelSwitchLog(
            provider_key=p_key,
            old_model_id=old_model or "none",
            new_model_id=applied_id,
            reason=reason,
            reverted=False,
            switched_at=datetime.now(timezone.utc),
        )
        db.add(log_entry)
        db.commit()
        return applied_id

    return None
