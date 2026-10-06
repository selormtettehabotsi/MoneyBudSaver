"""
Service for testing AI Council provider connections, verifying credentials,
measuring latency with fixed non-financial test prompts, and querying model catalogs.
"""
import asyncio
import difflib
import time
from typing import Optional, Dict, Any, List, Tuple
import httpx

from app.config import settings
from app.core.security import redact_sensitive_info
from app.schemas.council import TestConnectionResponse
from app.services.council.gemini_adapter import get_gemini_thinking_config
from app.services.council.json_repair import extract_and_repair_json

TEST_PING_PROMPT = "Ping! Respond strictly with the following JSON object and nothing else: {\"status\": \"ok\", \"ping\": \"pong\"}"
TEST_SYSTEM_INSTRUCTION = "You are an automated JSON connectivity test agent. Output strictly valid JSON."


async def _fetch_models_gemini(api_key: str) -> List[str]:
    """Fetch model IDs from Google Gemini API via x-goog-api-key header."""
    url = "https://generativelanguage.googleapis.com/v1beta/models"
    headers = {"x-goog-api-key": api_key}
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(url, headers=headers)
        if res.status_code != 200:
            return []
        data = res.json()
        models = []
        for m in data.get("models", []):
            name = m.get("name", "")
            clean_name = name.replace("models/", "")
            if clean_name:
                models.append(clean_name)
        return models


async def _fetch_models_openai_compatible(base_url: str, api_key: Optional[str] = None) -> List[str]:
    """Fetch model IDs from OpenAI-compatible /models endpoint."""
    url = f"{base_url.rstrip('/')}/models"
    headers = {}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(url, headers=headers)
        if res.status_code != 200:
            return []
        data = res.json()
        items = data.get("data") or data.get("models") or []
        model_ids = []
        for item in items:
            if isinstance(item, dict):
                mid = item.get("id") or item.get("name") or item.get("model")
                if mid:
                    model_ids.append(mid)
            elif isinstance(item, str):
                model_ids.append(item)
        return model_ids


async def _fetch_models_ollama(base_url: str) -> List[str]:
    """Fetch model IDs from Ollama."""
    url = f"{base_url.rstrip('/')}/api/tags"
    async with httpx.AsyncClient(timeout=5) as client:
        res = await client.get(url)
        if res.status_code != 200:
            return []
        data = res.json()
        models = []
        for m in data.get("models", []):
            name = m.get("name", "")
            if name:
                models.append(name)
                tagless = name.split(":")[0]
                if tagless not in models:
                    models.append(tagless)
        return models


async def verify_provider_connectivity(
    provider_name: str,
    model_id: Optional[str] = None,
    user_settings: Optional[Dict[str, Any]] = None,
) -> TestConnectionResponse:
    """
    Tests a single provider's connection:
    1. Sends a tiny fixed test prompt (no financial or user data).
    2. Measures latency and diagnoses issues (invalid key, model not found, rate limited, timeout, bad JSON).
    3. Calls provider's list-models catalog endpoint and checks if model_id is present, offering close matches.
    4. NEVER logs or returns API keys.
    """
    custom_models = (user_settings or {}).get("custom_model_ids", {})
    provider_name_lower = provider_name.lower().strip()

    # Resolve provider config
    api_key: Optional[str] = None
    resolved_model_id: str = (model_id or "").strip()
    base_url: Optional[str] = None
    is_gemini = False
    is_ollama = False

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
            model_found_in_list=None,
            available_models_count=0,
            close_matches=[],
        )

    # Fetch catalog
    async def fetch_catalog() -> List[str]:
        try:
            if is_gemini:
                return await _fetch_models_gemini(api_key)
            elif is_ollama:
                return await _fetch_models_ollama(base_url)
            elif base_url:
                return await _fetch_models_openai_compatible(base_url, api_key)
            return []
        except Exception:
            return []

    # Execute Test Ping Prompt
    start_time = time.perf_counter()
    http_status: Optional[int] = None
    diagnosis = "Connection verified successfully."
    test_status = "success"

    try:
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
            thinking_cfg = get_gemini_thinking_config(resolved_model_id)
            if thinking_cfg:
                gen_cfg["thinkingConfig"] = thinking_cfg

            payload = {
                "system_instruction": {"parts": [{"text": TEST_SYSTEM_INSTRUCTION}]},
                "contents": [{"role": "user", "parts": [{"text": TEST_PING_PROMPT}]}],
                "generationConfig": gen_cfg,
            }
            async with httpx.AsyncClient(timeout=15) as client:
                res = await client.post(url, headers=headers, json=payload)
                http_status = res.status_code

                # Auto-retry without thinking parameter on 400
                if res.status_code == 400 and "thinkingConfig" in gen_cfg:
                    err_txt = res.text.lower()
                    if "thinking" in err_txt or "thinkingconfig" in err_txt or "thinkingbudget" in err_txt:
                        retry_gen_cfg = dict(gen_cfg)
                        retry_gen_cfg.pop("thinkingConfig", None)
                        retry_payload = dict(payload)
                        retry_payload["generationConfig"] = retry_gen_cfg
                        res = await client.post(url, headers=headers, json=retry_payload)
                        http_status = res.status_code
                        if res.status_code == 200:
                            diagnosis = "Connection verified (thinking parameter disabled after 400 rejection)."

                if res.status_code in (401, 403):
                    test_status = "invalid_key"
                    diagnosis = "Invalid API Key: Provider rejected authentication (HTTP 401/403)."
                elif res.status_code == 404:
                    test_status = "model_not_found"
                    diagnosis = f"Model ID '{resolved_model_id}' not found on Google Gemini (HTTP 404)."
                elif res.status_code == 429:
                    test_status = "rate_limited"
                    diagnosis = "Gemini rate limit reached (HTTP 429)."
                elif res.status_code != 200:
                    test_status = "error"
                    clean_err = redact_sensitive_info(res.text[:100])
                    diagnosis = f"Gemini returned HTTP {res.status_code}: {clean_err}"
                else:
                    data = res.json()
                    candidates = data.get("candidates", [])
                    raw_text = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "") if candidates else ""
                    parsed = extract_and_repair_json(raw_text)
                    if not parsed or parsed.get("status") != "ok":
                        test_status = "bad_json"
                        diagnosis = "Model returned non-JSON or invalid test response."

        else:
            endpoint = f"{base_url.rstrip('/')}/chat/completions" if not is_ollama else f"{base_url.rstrip('/')}/v1/chat/completions"
            headers = {"Content-Type": "application/json"}
            if api_key:
                headers["Authorization"] = f"Bearer {api_key}"
            if "openrouter" in provider_name_lower:
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
            async with httpx.AsyncClient(timeout=15) as client:
                res = await client.post(endpoint, json=payload, headers=headers)
                http_status = res.status_code

                if res.status_code in (401, 403):
                    test_status = "invalid_key"
                    diagnosis = f"Invalid API Key: Provider rejected authentication (HTTP {res.status_code})."
                elif res.status_code == 404:
                    test_status = "model_not_found"
                    diagnosis = f"Model ID '{resolved_model_id}' not found by provider (HTTP 404)."
                elif res.status_code == 429:
                    test_status = "rate_limited"
                    diagnosis = "Provider rate limit reached (HTTP 429)."
                elif res.status_code != 200:
                    test_status = "error"
                    clean_err = redact_sensitive_info(res.text[:100])
                    diagnosis = f"Provider returned HTTP {res.status_code}: {clean_err}"
                else:
                    data = res.json()
                    content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
                    parsed = extract_and_repair_json(content)
                    if not parsed or (parsed.get("status") != "ok" and parsed.get("ping") != "pong"):
                        test_status = "bad_json"
                        diagnosis = "Model returned unparsable or malformed JSON test response."

    except httpx.TimeoutException:
        test_status = "timeout"
        diagnosis = "Connection timed out after 15 seconds."
    except Exception as e:
        test_status = "error"
        clean_msg = redact_sensitive_info(str(e))
        diagnosis = f"Connection error: {clean_msg}"

    latency_ms = int((time.perf_counter() - start_time) * 1000)

    # Fetch catalog
    available_models = await fetch_catalog()
    model_found_in_list: Optional[bool] = None
    close_matches: List[str] = []

    if available_models:
        clean_target = resolved_model_id.lower().strip()
        models_lower_map = {m.lower().strip(): m for m in available_models}

        if clean_target in models_lower_map:
            model_found_in_list = True
        else:
            model_found_in_list = False
            close_matches = difflib.get_close_matches(
                resolved_model_id,
                available_models,
                n=4,
                cutoff=0.25,
            )

    return TestConnectionResponse(
        provider_name=provider_name,
        model_id=resolved_model_id,
        http_status=http_status,
        latency_ms=latency_ms,
        status=test_status,
        diagnosis=diagnosis,
        model_found_in_list=model_found_in_list,
        available_models_count=len(available_models),
        close_matches=close_matches,
    )
