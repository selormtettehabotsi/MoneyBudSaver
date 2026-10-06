"""
Provider Adapters Factory and Registry.
Initializes and manages all active AI Council member plugins across distinct model families.
Supports configurable timeouts, fallback model IDs, reasoning effort controls, and dynamic family derivation.
"""
from typing import List, Dict, Optional
from app.config import settings
from app.services.council.base_adapter import BaseProviderAdapter, OpenAICompatibleAdapter
from app.services.council.gemini_adapter import GeminiAdapter


def derive_model_family(
    model_id: str,
    provider_name: str = "",
    env_override: Optional[str] = None,
) -> str:
    """
    Derives the model family label dynamically from model ID and provider context:
    - qwen -> Qwen
    - nvidia/nemotron -> NVIDIA Nemotron
    - deepseek -> DeepSeek
    - z-ai / glm -> Zhipu GLM
    - moonshotai / kimi -> Moonshot Kimi
    - google/gemma -> Google Gemma
    - gemini -> Google Gemini
    - mistral / mixtral -> Mistral AI
    - llama -> Meta Llama
    - openai / gpt -> OpenAI
    - Respects environment / user override if present.
    """
    if env_override and env_override.strip():
        return env_override.strip()

    mid = (model_id or "").lower().strip()
    p_name = (provider_name or "").lower().strip()

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
    if any(m in mid for m in ("mistral", "mixtral", "codestral", "ministral")):
        return "Mistral AI"
    if "llama" in mid:
        return "Meta Llama"
    if "openai" in mid or "gpt" in mid:
        return "OpenAI"
    if "claude" in mid or "anthropic" in mid:
        return "Anthropic Claude"
    if "phi" in mid:
        return "Microsoft Phi"

    # Provider-based fallbacks
    if "gemini" in p_name:
        return "Google Gemini"
    if "groq" in p_name:
        return "OpenAI / GPT-OSS"
    if "mistral" in p_name:
        return "Mistral AI"
    if "openrouter" in p_name:
        return "Qwen"
    if "nvidia_kimi" in p_name:
        return "Moonshot Kimi"
    if "nvidia" in p_name:
        return "Zhipu GLM"
    if "cerebras" in p_name:
        return "Meta Llama"
    if "ollama" in p_name:
        return "Self-Hosted Private"

    return model_id.split("/")[-1].capitalize() if model_id else "AI Council Member"


def get_configured_providers(
    user_settings: Optional[Dict] = None,
    local_only_mode: bool = False
) -> List[BaseProviderAdapter]:
    """
    Returns the list of active provider adapters for a deliberation request.
    Respects local_only_mode, hosted environment restrictions, fallback models, and dynamic families.
    """
    custom_models = (user_settings or {}).get("custom_model_ids", {})
    custom_fallbacks = (user_settings or {}).get("custom_fallback_models", {})
    custom_families = (user_settings or {}).get("custom_model_families", {})
    providers_enabled = (user_settings or {}).get("providers_enabled", {})
    custom_tokens = (user_settings or {}).get("custom_max_tokens", {})
    custom_reasoning = (user_settings or {}).get("custom_reasoning_efforts", {})
    custom_thinking = (user_settings or {}).get("custom_thinking_levels", {})
    custom_timeouts = (user_settings or {}).get("custom_timeouts", {})

    default_timeout = settings.AI_PROVIDER_DEFAULT_TIMEOUT_SECONDS
    nvidia_timeout = custom_timeouts.get("nvidia", settings.NVIDIA_PROVIDER_TIMEOUT_SECONDS)

    # In local-only mode, use exclusively Ollama
    if local_only_mode:
        if settings.is_hosted:
            return []  # Ollama is strictly disabled in hosted mode
        ollama_mid = custom_models.get("ollama", settings.OLLAMA_MODEL_ID)
        ollama_fb = custom_fallbacks.get("ollama", settings.OLLAMA_FALLBACK_MODEL_ID)
        ollama_fam = custom_families.get("ollama") or derive_model_family(
            ollama_mid, "ollama", settings.OLLAMA_MODEL_FAMILY
        )
        return [
            OpenAICompatibleAdapter(
                name="ollama",
                display_name="Ollama (Local Offline)",
                model_family=ollama_fam,
                model_id=ollama_mid,
                fallback_model_id=ollama_fb,
                base_url=f"{settings.OLLAMA_BASE_URL}/v1",
                is_local=True,
                timeout_seconds=custom_timeouts.get("ollama", default_timeout),
                max_tokens=custom_tokens.get("ollama", 4096),
            )
        ]

    adapters: List[BaseProviderAdapter] = []

    # 1. Google Gemini Family
    if providers_enabled.get("gemini", True) and settings.GEMINI_API_KEY:
        gemini_mid = custom_models.get("gemini", settings.GEMINI_MODEL_ID)
        gemini_fb = custom_fallbacks.get("gemini", settings.GEMINI_FALLBACK_MODEL_ID)
        gemini_fam = custom_families.get("gemini") or derive_model_family(
            gemini_mid, "gemini", settings.GEMINI_MODEL_FAMILY
        )
        adapters.append(
            GeminiAdapter(
                name="gemini",
                display_name="Google Gemini",
                model_family=gemini_fam,
                model_id=gemini_mid,
                fallback_model_id=gemini_fb,
                api_key=settings.GEMINI_API_KEY,
                thinking_level=custom_thinking.get("gemini", "low"),
                timeout_seconds=custom_timeouts.get("gemini", default_timeout),
                max_output_tokens=custom_tokens.get("gemini", 4096),
            )
        )

    # 2. OpenAI / GPT-OSS Family via Groq
    if providers_enabled.get("groq", True) and settings.GROQ_API_KEY:
        groq_mid = custom_models.get("groq", settings.GROQ_MODEL_ID)
        groq_fb = custom_fallbacks.get("groq", settings.GROQ_FALLBACK_MODEL_ID)
        groq_fam = custom_families.get("groq") or derive_model_family(
            groq_mid, "groq", settings.GROQ_MODEL_FAMILY
        )
        adapters.append(
            OpenAICompatibleAdapter(
                name="groq",
                display_name="Groq GPT-OSS",
                model_family=groq_fam,
                model_id=groq_mid,
                fallback_model_id=groq_fb,
                base_url="https://api.groq.com/openai/v1",
                api_key=settings.GROQ_API_KEY,
                timeout_seconds=custom_timeouts.get("groq", default_timeout),
                max_tokens=custom_tokens.get("groq", 4096),
                reasoning_effort=custom_reasoning.get("groq", "low"),
            )
        )

    # 3. Meta Llama Family via Cerebras (Optional: Paid or Trial Only, Off by Default)
    if providers_enabled.get("cerebras", False) and settings.CEREBRAS_API_KEY:
        cerebras_mid = custom_models.get("cerebras", settings.CEREBRAS_MODEL_ID)
        cerebras_fb = custom_fallbacks.get("cerebras", settings.CEREBRAS_FALLBACK_MODEL_ID)
        cerebras_fam = custom_families.get("cerebras") or derive_model_family(
            cerebras_mid, "cerebras", settings.CEREBRAS_MODEL_FAMILY
        )
        adapters.append(
            OpenAICompatibleAdapter(
                name="cerebras",
                display_name="Cerebras Llama",
                model_family=cerebras_fam,
                model_id=cerebras_mid,
                fallback_model_id=cerebras_fb,
                base_url="https://api.cerebras.ai/v1",
                api_key=settings.CEREBRAS_API_KEY,
                timeout_seconds=custom_timeouts.get("cerebras", default_timeout),
                max_tokens=custom_tokens.get("cerebras", 4096),
            )
        )

    # 4. Mistral Family via Mistral AI
    if providers_enabled.get("mistral", True) and settings.MISTRAL_API_KEY:
        mistral_mid = custom_models.get("mistral", settings.MISTRAL_MODEL_ID)
        mistral_fb = custom_fallbacks.get("mistral", settings.MISTRAL_FALLBACK_MODEL_ID)
        mistral_fam = custom_families.get("mistral") or derive_model_family(
            mistral_mid, "mistral", settings.MISTRAL_MODEL_FAMILY
        )
        adapters.append(
            OpenAICompatibleAdapter(
                name="mistral",
                display_name="Mistral AI",
                model_family=mistral_fam,
                model_id=mistral_mid,
                fallback_model_id=mistral_fb,
                base_url="https://api.mistral.ai/v1",
                api_key=settings.MISTRAL_API_KEY,
                timeout_seconds=custom_timeouts.get("mistral", default_timeout),
                max_tokens=custom_tokens.get("mistral", 4096),
            )
        )

    # 5. Qwen Family via OpenRouter Free Tier
    if providers_enabled.get("openrouter", True) and settings.OPENROUTER_API_KEY:
        openrouter_mid = custom_models.get("openrouter", settings.OPENROUTER_MODEL_ID)
        openrouter_fb = custom_fallbacks.get("openrouter", settings.OPENROUTER_FALLBACK_MODEL_ID)
        openrouter_fam = custom_families.get("openrouter") or derive_model_family(
            openrouter_mid, "openrouter", settings.OPENROUTER_MODEL_FAMILY
        )
        adapters.append(
            OpenAICompatibleAdapter(
                name="openrouter",
                display_name="OpenRouter Qwen",
                model_family=openrouter_fam,
                model_id=openrouter_mid,
                fallback_model_id=openrouter_fb,
                base_url="https://openrouter.ai/api/v1",
                api_key=settings.OPENROUTER_API_KEY,
                timeout_seconds=custom_timeouts.get("openrouter", default_timeout),
                max_tokens=custom_tokens.get("openrouter", 4096),
                reasoning_effort=custom_reasoning.get("openrouter", "low"),
                extra_headers={
                    "HTTP-Referer": "https://github.com/selormtettehabotsi/MoneyBudSaver",
                    "X-Title": "MoneyCouncil",
                },
            )
        )

    # 6. Zhipu GLM Family via NVIDIA NIM
    if providers_enabled.get("nvidia", True) and settings.NVIDIA_API_KEY:
        nvidia_mid = custom_models.get("nvidia", settings.NVIDIA_MODEL_ID)
        nvidia_fb = custom_fallbacks.get("nvidia", settings.NVIDIA_FALLBACK_MODEL_ID)
        nvidia_fam = custom_families.get("nvidia") or derive_model_family(
            nvidia_mid, "nvidia", settings.NVIDIA_MODEL_FAMILY
        )
        adapters.append(
            OpenAICompatibleAdapter(
                name="nvidia",
                display_name="NVIDIA GLM",
                model_family=nvidia_fam,
                model_id=nvidia_mid,
                fallback_model_id=nvidia_fb,
                base_url="https://integrate.api.nvidia.com/v1",
                api_key=settings.NVIDIA_API_KEY,
                timeout_seconds=nvidia_timeout,
                max_tokens=custom_tokens.get("nvidia", 4096),
                reasoning_effort=custom_reasoning.get("nvidia", "low"),
                shared_rate_limit_key="nvidia",
                stagger_interval_seconds=settings.SHARED_KEY_STAGGER_INTERVAL_SECONDS,
            )
        )

    # 7. Optional Moonshot Kimi Family via NVIDIA NIM (shares NVIDIA_API_KEY)
    if (
        providers_enabled.get("nvidia_kimi", True)
        and settings.NVIDIA_API_KEY
        and settings.NVIDIA_KIMI_MODEL_ID
    ):
        kimi_mid = custom_models.get("nvidia_kimi", settings.NVIDIA_KIMI_MODEL_ID)
        kimi_fb = custom_fallbacks.get("nvidia_kimi", settings.NVIDIA_KIMI_FALLBACK_MODEL_ID)
        kimi_fam = custom_families.get("nvidia_kimi") or derive_model_family(
            kimi_mid, "nvidia_kimi", settings.NVIDIA_KIMI_MODEL_FAMILY
        )
        adapters.append(
            OpenAICompatibleAdapter(
                name="nvidia_kimi",
                display_name="Kimi (NVIDIA)",
                model_family=kimi_fam,
                model_id=kimi_mid,
                fallback_model_id=kimi_fb,
                base_url="https://integrate.api.nvidia.com/v1",
                api_key=settings.NVIDIA_API_KEY,
                timeout_seconds=nvidia_timeout,
                max_tokens=custom_tokens.get("nvidia_kimi", 4096),
                reasoning_effort=custom_reasoning.get("nvidia_kimi", "low"),
                shared_rate_limit_key="nvidia",
                stagger_interval_seconds=settings.SHARED_KEY_STAGGER_INTERVAL_SECONDS,
            )
        )

    # 8. Optional Local Ollama (only if local deployment)
    if not settings.is_hosted and providers_enabled.get("ollama", False):
        ollama_mid = custom_models.get("ollama", settings.OLLAMA_MODEL_ID)
        ollama_fb = custom_fallbacks.get("ollama", settings.OLLAMA_FALLBACK_MODEL_ID)
        ollama_fam = custom_families.get("ollama") or derive_model_family(
            ollama_mid, "ollama", settings.OLLAMA_MODEL_FAMILY
        )
        adapters.append(
            OpenAICompatibleAdapter(
                name="ollama",
                display_name="Ollama (Local Offline)",
                model_family=ollama_fam,
                model_id=ollama_mid,
                fallback_model_id=ollama_fb,
                base_url=f"{settings.OLLAMA_BASE_URL}/v1",
                is_local=True,
                timeout_seconds=custom_timeouts.get("ollama", default_timeout),
                max_tokens=custom_tokens.get("ollama", 4096),
            )
        )

    return adapters

