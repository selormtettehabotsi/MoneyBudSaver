"""
Provider Adapters Factory and Registry.
Initializes and manages all active AI Council member plugins across distinct model families (Free-Only Lineup).
Supports database-first precedence, configurable timeouts, fallback model IDs, reasoning effort controls,
multi-voter slots (Groq 1 & 2, OpenRouter 1 & 2, NVIDIA 1 & 2, Custom 1 & 2), and dynamic family derivation.
"""
import os
from typing import List, Dict, Optional, Any
from sqlalchemy.orm import Session

from app.config import settings
from app.db.session import SessionLocal
from app.models.council import ProviderSetting
from app.services.council.base_adapter import BaseProviderAdapter, OpenAICompatibleAdapter
from app.services.council.gemini_adapter import GeminiAdapter
from app.services.council.ssrf_protection import validate_custom_endpoint_url


def derive_model_family(
    model_id: str,
    provider_name: str = "",
    env_override: Optional[str] = None,
) -> str:
    """
    Derives the model family label dynamically from model ID and provider context:
    - qwen -> Qwen
    - nvidia / nemotron -> NVIDIA Nemotron
    - deepseek -> DeepSeek
    - z-ai / glm / zhipu -> Zhipu GLM
    - moonshotai / kimi -> Moonshot Kimi
    - google/gemma / gemma -> Google Gemma
    - gemini -> Google Gemini
    - llama -> Meta Llama
    - openai / gpt -> OpenAI / GPT-OSS
    - phi -> Microsoft Phi
    - Respects environment / user override if present.
    """
    if env_override and env_override.strip():
        return env_override.strip()

    mid = (model_id or "").lower().strip()
    p_name = (provider_name or "").lower().strip()

    if "muse" in mid:
        return "Meta Muse"
    if "nemotron" in mid:
        return "NVIDIA Nemotron"
    if "qwen" in mid:
        return "Qwen"
    if "deepseek" in mid:
        return "DeepSeek"
    if "z-ai" in mid or "glm" in mid or "zhipu" in mid:
        return "Zhipu GLM"
    if "moonshotai" in mid or "moonshot" in mid or "kimi" in mid:
        return "Moonshot Kimi"
    if "google/gemma" in mid or "gemma" in mid:
        return "Google Gemma"
    if "gemini" in mid:
        return "Google Gemini"
    if "llama" in mid:
        return "Meta Llama"
    if "openai" in mid or "gpt" in mid:
        return "OpenAI / GPT-OSS"
    if "phi" in mid:
        return "Microsoft Phi"

    # Provider-based fallbacks
    if "gemini" in p_name:
        return "Google Gemini"
    if "groq" in p_name:
        return "OpenAI / GPT-OSS"
    if "openrouter" in p_name:
        return "NVIDIA Nemotron"
    if "nvidia_1" in p_name or "nvidia_kimi" in p_name:
        return "Moonshot Kimi"
    if "nvidia" in p_name:
        return "Zhipu GLM"
    if "ollama" in p_name:
        return "Self-Hosted Private"
    if "custom" in p_name:
        return "Custom OpenAI-Compatible"

    return model_id.split("/")[-1].capitalize() if model_id else "AI Council Member"


def get_resolved_provider_config(
    provider_key: str,
    db: Optional[Session] = None,
    user_settings: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Resolves provider configuration with 3-tier precedence:
    1. Database (provider_settings table)
    2. User runtime settings (if passed)
    3. Environment variables (settings.XXX)
    4. Code defaults
    """
    db_setting = None
    if db is not None:
        try:
            db_setting = db.query(ProviderSetting).filter(ProviderSetting.provider_key == provider_key).first()
        except Exception:
            db_setting = None
    else:
        try:
            with SessionLocal() as session:
                db_setting = session.query(ProviderSetting).filter(ProviderSetting.provider_key == provider_key).first()
        except Exception:
            db_setting = None

    custom_models = (user_settings or {}).get("custom_model_ids", {})
    custom_fallbacks = (user_settings or {}).get("custom_fallback_models", {})
    custom_families = (user_settings or {}).get("custom_model_families", {})
    providers_enabled = (user_settings or {}).get("providers_enabled", {})
    custom_timeouts = (user_settings or {}).get("custom_timeouts", {})

    # Code defaults & env mappings per key
    env_mid: Optional[str] = None
    env_fb: Optional[str] = None
    env_fam: Optional[str] = None
    code_default_mid = ""
    default_enabled = True
    default_timeout = settings.AI_PROVIDER_DEFAULT_TIMEOUT_SECONDS

    if provider_key == "gemini":
        env_mid = settings.GEMINI_MODEL_ID
        env_fb = settings.GEMINI_FALLBACK_MODEL_ID
        env_fam = settings.GEMINI_MODEL_FAMILY
        code_default_mid = "gemini-2.5-flash"
        default_enabled = True

    elif provider_key in ("groq_1", "groq"):
        env_mid = settings.GROQ_MODEL_ID
        env_fb = settings.GROQ_FALLBACK_MODEL_ID
        env_fam = settings.GROQ_MODEL_FAMILY
        code_default_mid = "openai/gpt-oss-120b"
        default_enabled = True

    elif provider_key == "groq_2":
        env_mid = getattr(settings, "GROQ_2_MODEL_ID", None)
        env_fb = getattr(settings, "GROQ_2_FALLBACK_MODEL_ID", None)
        env_fam = getattr(settings, "GROQ_2_MODEL_FAMILY", None)
        code_default_mid = "qwen-qwq-32b"
        default_enabled = True

    elif provider_key in ("openrouter_1", "openrouter"):
        env_mid = settings.OPENROUTER_MODEL_ID
        env_fb = settings.OPENROUTER_FALLBACK_MODEL_ID
        env_fam = settings.OPENROUTER_MODEL_FAMILY
        code_default_mid = "nvidia/llama-3.1-nemotron-70b-instruct:free"
        default_enabled = True

    elif provider_key == "openrouter_2":
        env_mid = getattr(settings, "OPENROUTER_2_MODEL_ID", None)
        env_fb = getattr(settings, "OPENROUTER_2_FALLBACK_MODEL_ID", None)
        env_fam = getattr(settings, "OPENROUTER_2_MODEL_FAMILY", None)
        code_default_mid = "google/gemma-2-9b-it:free"
        default_enabled = True

    elif provider_key in ("nvidia_1", "nvidia"):
        env_mid = settings.NVIDIA_MODEL_ID
        env_fb = settings.NVIDIA_FALLBACK_MODEL_ID
        env_fam = settings.NVIDIA_MODEL_FAMILY
        code_default_mid = "meta/muse-glimmer-30b"
        default_enabled = True
        default_timeout = settings.NVIDIA_PROVIDER_TIMEOUT_SECONDS

    elif provider_key in ("nvidia_2", "nvidia_kimi"):
        env_mid = settings.NVIDIA_KIMI_MODEL_ID
        env_fb = settings.NVIDIA_KIMI_FALLBACK_MODEL_ID
        env_fam = settings.NVIDIA_KIMI_MODEL_FAMILY
        code_default_mid = "moonshotai/kimi-k3"
        default_enabled = False  # Off by default as required
        default_timeout = settings.NVIDIA_PROVIDER_TIMEOUT_SECONDS

    elif provider_key in ("custom_1", "custom_2"):
        code_default_mid = ""
        default_enabled = False

    elif provider_key == "ollama":
        env_mid = settings.OLLAMA_MODEL_ID
        env_fb = settings.OLLAMA_FALLBACK_MODEL_ID
        env_fam = settings.OLLAMA_MODEL_FAMILY
        code_default_mid = "llama3.2"
        default_enabled = False

    # 1. Database value
    db_mid = db_setting.model_id if db_setting and db_setting.model_id else None
    db_fb = db_setting.fallback_model_id if db_setting and db_setting.fallback_model_id else None
    db_fam = db_setting.family_override if db_setting and db_setting.family_override else None
    db_enabled = db_setting.enabled if db_setting is not None else None
    db_timeout = db_setting.timeout if db_setting is not None else None
    db_confirmed = db_setting.confirmed_free if db_setting is not None else False
    db_history = db_setting.history if db_setting and db_setting.history else []
    db_display = db_setting.display_name if db_setting and db_setting.display_name else None
    db_base_url = db_setting.base_url if db_setting and db_setting.base_url else None
    db_env_key = db_setting.env_key_name if db_setting and db_setting.env_key_name else None
    db_exclude_slow = db_setting.exclude_slow_round2 if db_setting is not None else False

    # Resolution with precedence: DB -> user_settings -> Env -> Code Default
    resolved_mid = (
        db_mid
        or custom_models.get(provider_key)
        or env_mid
        or code_default_mid
    )
    resolved_fb = (
        db_fb
        or custom_fallbacks.get(provider_key)
        or env_fb
    )
    resolved_fam = (
        db_fam
        or custom_families.get(provider_key)
        or derive_model_family(resolved_mid, provider_key, env_fam)
    )
    resolved_enabled = (
        db_enabled
        if db_enabled is not None
        else providers_enabled.get(provider_key, default_enabled)
    )
    resolved_timeout = (
        db_timeout
        if db_timeout is not None
        else custom_timeouts.get(provider_key, default_timeout)
    )

    db_temperature = float(db_setting.temperature) if db_setting and db_setting.temperature is not None else 0.5
    db_top_p = float(db_setting.top_p) if db_setting and db_setting.top_p is not None else 0.95
    db_max_tokens = int(db_setting.max_tokens) if db_setting and db_setting.max_tokens is not None else 4096

    return {
        "provider_key": provider_key,
        "model_id": resolved_mid,
        "fallback_model_id": resolved_fb,
        "family": resolved_fam,
        "enabled": resolved_enabled,
        "timeout": resolved_timeout,
        "confirmed_free": db_confirmed,
        "history": db_history,
        "display_name": db_display,
        "base_url": db_base_url,
        "env_key_name": db_env_key,
        "exclude_slow_round2": db_exclude_slow,
        "temperature": db_temperature,
        "top_p": db_top_p,
        "max_tokens": db_max_tokens,
    }


def get_configured_providers(
    user_settings: Optional[Dict] = None,
    local_only_mode: bool = False,
    db: Optional[Session] = None,
) -> List[BaseProviderAdapter]:
    """
    Returns the list of active provider adapters for a deliberation request.
    Respects local_only_mode, database precedence, fallback models, and multi-voter slots.
    """
    custom_tokens = (user_settings or {}).get("custom_max_tokens", {})
    custom_reasoning = (user_settings or {}).get("custom_reasoning_efforts", {})
    custom_thinking = (user_settings or {}).get("custom_thinking_levels", {})

    # In local-only mode, use exclusively Ollama
    if local_only_mode:
        if settings.is_hosted:
            return []  # Ollama is strictly disabled in hosted mode
        ollama_cfg = get_resolved_provider_config("ollama", db=db, user_settings=user_settings)
        return [
            OpenAICompatibleAdapter(
                name="ollama",
                display_name=ollama_cfg.get("display_name") or "Ollama (Local Offline)",
                model_family=ollama_cfg["family"],
                model_id=ollama_cfg["model_id"],
                fallback_model_id=ollama_cfg["fallback_model_id"],
                base_url=f"{settings.OLLAMA_BASE_URL}/v1",
                is_local=True,
                timeout_seconds=ollama_cfg["timeout"],
                max_tokens=custom_tokens.get("ollama", 4096),
            )
        ]

    adapters: List[BaseProviderAdapter] = []

    # 1. Google Gemini
    gem_cfg = get_resolved_provider_config("gemini", db=db, user_settings=user_settings)
    if gem_cfg["enabled"] and settings.GEMINI_API_KEY and gem_cfg["model_id"]:
        adapters.append(
            GeminiAdapter(
                name="gemini",
                display_name=gem_cfg.get("display_name") or "Google Gemini",
                model_family=gem_cfg["family"],
                model_id=gem_cfg["model_id"],
                fallback_model_id=gem_cfg["fallback_model_id"],
                api_key=settings.GEMINI_API_KEY,
                thinking_level=custom_thinking.get("gemini", "low"),
                timeout_seconds=gem_cfg["timeout"],
                max_output_tokens=custom_tokens.get("gemini", 4096),
            )
        )

    # 2. Groq Voter 1 (GPT-OSS / primary)
    groq1_cfg = get_resolved_provider_config("groq_1", db=db, user_settings=user_settings)
    if groq1_cfg["enabled"] and settings.GROQ_API_KEY and groq1_cfg["model_id"]:
        adapters.append(
            OpenAICompatibleAdapter(
                name="groq_1",
                display_name=groq1_cfg.get("display_name") or "Groq GPT-OSS",
                model_family=groq1_cfg["family"],
                model_id=groq1_cfg["model_id"],
                fallback_model_id=groq1_cfg["fallback_model_id"],
                base_url="https://api.groq.com/openai/v1",
                api_key=settings.GROQ_API_KEY,
                timeout_seconds=groq1_cfg["timeout"],
                max_tokens=custom_tokens.get("groq_1", 4096),
                reasoning_effort=custom_reasoning.get("groq_1", "low"),
                shared_rate_limit_key="groq",
                stagger_interval_seconds=settings.SHARED_KEY_STAGGER_INTERVAL_SECONDS,
            )
        )

    # 3. Groq Voter 2 (Qwen / secondary)
    groq2_cfg = get_resolved_provider_config("groq_2", db=db, user_settings=user_settings)
    if groq2_cfg["enabled"] and settings.GROQ_API_KEY and groq2_cfg["model_id"]:
        adapters.append(
            OpenAICompatibleAdapter(
                name="groq_2",
                display_name=groq2_cfg.get("display_name") or "Groq Qwen",
                model_family=groq2_cfg["family"],
                model_id=groq2_cfg["model_id"],
                fallback_model_id=groq2_cfg["fallback_model_id"],
                base_url="https://api.groq.com/openai/v1",
                api_key=settings.GROQ_API_KEY,
                timeout_seconds=groq2_cfg["timeout"],
                max_tokens=custom_tokens.get("groq_2", 4096),
                reasoning_effort=custom_reasoning.get("groq_2", "low"),
                shared_rate_limit_key="groq",
                stagger_interval_seconds=settings.SHARED_KEY_STAGGER_INTERVAL_SECONDS,
            )
        )

    # 4. OpenRouter Voter 1 (Free non-Qwen)
    or1_cfg = get_resolved_provider_config("openrouter_1", db=db, user_settings=user_settings)
    if or1_cfg["enabled"] and settings.OPENROUTER_API_KEY and or1_cfg["model_id"]:
        adapters.append(
            OpenAICompatibleAdapter(
                name="openrouter_1",
                display_name=or1_cfg.get("display_name") or "OpenRouter Nemotron",
                model_family=or1_cfg["family"],
                model_id=or1_cfg["model_id"],
                fallback_model_id=or1_cfg["fallback_model_id"],
                base_url="https://openrouter.ai/api/v1",
                api_key=settings.OPENROUTER_API_KEY,
                timeout_seconds=or1_cfg["timeout"],
                max_tokens=custom_tokens.get("openrouter_1", 4096),
                reasoning_effort=custom_reasoning.get("openrouter_1", "low"),
                extra_headers={
                    "HTTP-Referer": "https://github.com/selormtettehabotsi/MoneyBudSaver",
                    "X-Title": "MoneyCouncil",
                },
                shared_rate_limit_key="openrouter",
                stagger_interval_seconds=settings.SHARED_KEY_STAGGER_INTERVAL_SECONDS,
            )
        )

    # 5. OpenRouter Voter 2 (Free secondary)
    or2_cfg = get_resolved_provider_config("openrouter_2", db=db, user_settings=user_settings)
    if or2_cfg["enabled"] and settings.OPENROUTER_API_KEY and or2_cfg["model_id"]:
        adapters.append(
            OpenAICompatibleAdapter(
                name="openrouter_2",
                display_name=or2_cfg.get("display_name") or "OpenRouter Gemma",
                model_family=or2_cfg["family"],
                model_id=or2_cfg["model_id"],
                fallback_model_id=or2_cfg["fallback_model_id"],
                base_url="https://openrouter.ai/api/v1",
                api_key=settings.OPENROUTER_API_KEY,
                timeout_seconds=or2_cfg["timeout"],
                max_tokens=custom_tokens.get("openrouter_2", 4096),
                reasoning_effort=custom_reasoning.get("openrouter_2", "low"),
                extra_headers={
                    "HTTP-Referer": "https://github.com/selormtettehabotsi/MoneyBudSaver",
                    "X-Title": "MoneyCouncil",
                },
                shared_rate_limit_key="openrouter",
                stagger_interval_seconds=settings.SHARED_KEY_STAGGER_INTERVAL_SECONDS,
            )
        )

    # 6. NVIDIA Voter 1 (Muse - shared key)
    nv1_cfg = get_resolved_provider_config("nvidia_1", db=db, user_settings=user_settings)
    if nv1_cfg["enabled"] and settings.NVIDIA_API_KEY and nv1_cfg["model_id"]:
        adapters.append(
            OpenAICompatibleAdapter(
                name="nvidia_1",
                display_name=nv1_cfg.get("display_name") or "NVIDIA Muse",
                model_family=nv1_cfg["family"],
                model_id=nv1_cfg["model_id"],
                fallback_model_id=nv1_cfg["fallback_model_id"],
                base_url="https://integrate.api.nvidia.com/v1",
                api_key=settings.NVIDIA_API_KEY,
                timeout_seconds=nv1_cfg["timeout"],
                max_tokens=custom_tokens.get("nvidia_1", 4096),
                reasoning_effort=custom_reasoning.get("nvidia_1", "low"),
                shared_rate_limit_key="nvidia",
                stagger_interval_seconds=settings.SHARED_KEY_STAGGER_INTERVAL_SECONDS,
            )
        )

    # 7. NVIDIA Voter 2 (Kimi - shared key, off by default)
    nv2_cfg = get_resolved_provider_config("nvidia_2", db=db, user_settings=user_settings)
    if nv2_cfg["enabled"] and settings.NVIDIA_API_KEY and nv2_cfg["model_id"]:
        adapters.append(
            OpenAICompatibleAdapter(
                name="nvidia_2",
                display_name=nv2_cfg.get("display_name") or "NVIDIA Kimi",
                model_family=nv2_cfg["family"],
                model_id=nv2_cfg["model_id"],
                fallback_model_id=nv2_cfg["fallback_model_id"],
                base_url="https://integrate.api.nvidia.com/v1",
                api_key=settings.NVIDIA_API_KEY,
                timeout_seconds=nv2_cfg["timeout"],
                max_tokens=custom_tokens.get("nvidia_2", 4096),
                reasoning_effort=custom_reasoning.get("nvidia_2", "low"),
                shared_rate_limit_key="nvidia",
                stagger_interval_seconds=settings.SHARED_KEY_STAGGER_INTERVAL_SECONDS,
            )
        )

    # 8. Custom Slot 1
    c1_cfg = get_resolved_provider_config("custom_1", db=db, user_settings=user_settings)
    if c1_cfg["enabled"] and c1_cfg["base_url"] and c1_cfg["model_id"]:
        is_val, _ = validate_custom_endpoint_url(c1_cfg["base_url"])
        if is_val:
            c1_key = os.environ.get(c1_cfg.get("env_key_name") or "", "")
            adapters.append(
                OpenAICompatibleAdapter(
                    name="custom_1",
                    display_name=c1_cfg.get("display_name") or "Custom Slot 1",
                    model_family=c1_cfg["family"],
                    model_id=c1_cfg["model_id"],
                    fallback_model_id=c1_cfg["fallback_model_id"],
                    base_url=c1_cfg["base_url"],
                    api_key=c1_key if c1_key else None,
                    timeout_seconds=c1_cfg["timeout"],
                    max_tokens=custom_tokens.get("custom_1", 4096),
                )
            )

    # 9. Custom Slot 2
    c2_cfg = get_resolved_provider_config("custom_2", db=db, user_settings=user_settings)
    if c2_cfg["enabled"] and c2_cfg["base_url"] and c2_cfg["model_id"]:
        is_val, _ = validate_custom_endpoint_url(c2_cfg["base_url"])
        if is_val:
            c2_key = os.environ.get(c2_cfg.get("env_key_name") or "", "")
            adapters.append(
                OpenAICompatibleAdapter(
                    name="custom_2",
                    display_name=c2_cfg.get("display_name") or "Custom Slot 2",
                    model_family=c2_cfg["family"],
                    model_id=c2_cfg["model_id"],
                    fallback_model_id=c2_cfg["fallback_model_id"],
                    base_url=c2_cfg["base_url"],
                    api_key=c2_key if c2_key else None,
                    timeout_seconds=c2_cfg["timeout"],
                    max_tokens=custom_tokens.get("custom_2", 4096),
                )
            )

    # 10. Ollama (if local mode and enabled)
    if not settings.is_hosted:
        ol_cfg = get_resolved_provider_config("ollama", db=db, user_settings=user_settings)
        if ol_cfg["enabled"] and ol_cfg["model_id"]:
            adapters.append(
                OpenAICompatibleAdapter(
                    name="ollama",
                    display_name=ol_cfg.get("display_name") or "Ollama (Local Offline)",
                    model_family=ol_cfg["family"],
                    model_id=ol_cfg["model_id"],
                    fallback_model_id=ol_cfg["fallback_model_id"],
                    base_url=f"{settings.OLLAMA_BASE_URL}/v1",
                    is_local=True,
                    timeout_seconds=ol_cfg["timeout"],
                    max_tokens=custom_tokens.get("ollama", 4096),
                )
            )

    return adapters
