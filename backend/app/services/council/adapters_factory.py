"""
Provider Adapters Factory and Registry.
Initializes and manages all active AI Council member plugins across 4+ distinct model families.
"""
from typing import List, Dict, Optional
from app.config import settings
from app.services.council.base_adapter import BaseProviderAdapter, OpenAICompatibleAdapter
from app.services.council.gemini_adapter import GeminiAdapter


def get_configured_providers(
    user_settings: Optional[Dict] = None,
    local_only_mode: bool = False
) -> List[BaseProviderAdapter]:
    """
    Returns the list of active provider adapters for a deliberation request.
    Respects local_only_mode and hosted environment restrictions.
    """
    custom_models = (user_settings or {}).get("custom_model_ids", {})
    providers_enabled = (user_settings or {}).get("providers_enabled", {})
    custom_tokens = (user_settings or {}).get("custom_max_tokens", {})
    custom_reasoning = (user_settings or {}).get("custom_reasoning_efforts", {})
    custom_thinking = (user_settings or {}).get("custom_thinking_levels", {})

    # In local-only mode, use exclusively Ollama
    if local_only_mode:
        if settings.is_hosted:
            return []  # Ollama is strictly disabled in hosted mode
        return [
            OpenAICompatibleAdapter(
                name="ollama",
                display_name="Ollama (Local Offline)",
                model_family="Self-Hosted Private",
                model_id=custom_models.get("ollama", settings.OLLAMA_MODEL_ID),
                base_url=f"{settings.OLLAMA_BASE_URL}/v1",
                is_local=True,
                max_tokens=custom_tokens.get("ollama", 4096),
            )
        ]

    adapters: List[BaseProviderAdapter] = []

    # 1. Google Gemini Family
    if providers_enabled.get("gemini", True) and settings.GEMINI_API_KEY:
        adapters.append(
            GeminiAdapter(
                name="gemini",
                display_name="Google Gemini",
                model_family="Google Gemini Family",
                model_id=custom_models.get("gemini", settings.GEMINI_MODEL_ID),
                api_key=settings.GEMINI_API_KEY,
                thinking_level=custom_thinking.get("gemini", "low"),
                max_output_tokens=custom_tokens.get("gemini", 4096),
            )
        )

    # 2. OpenAI / GPT-OSS Family via Groq
    if providers_enabled.get("groq", True) and settings.GROQ_API_KEY:
        adapters.append(
            OpenAICompatibleAdapter(
                name="groq",
                display_name="Groq GPT-OSS",
                model_family="OpenAI / GPT-OSS Family",
                model_id=custom_models.get("groq", settings.GROQ_MODEL_ID),
                base_url="https://api.groq.com/openai/v1",
                api_key=settings.GROQ_API_KEY,
                max_tokens=custom_tokens.get("groq", 4096),
                reasoning_effort=custom_reasoning.get("groq", "low"),
            )
        )

    # 3. Meta Llama Family via Cerebras (Optional: Paid or Trial Only, Off by Default)
    if providers_enabled.get("cerebras", False) and settings.CEREBRAS_API_KEY:
        adapters.append(
            OpenAICompatibleAdapter(
                name="cerebras",
                display_name="Cerebras Llama (Paid/Trial)",
                model_family="Meta Llama Family",
                model_id=custom_models.get("cerebras", settings.CEREBRAS_MODEL_ID),
                base_url="https://api.cerebras.ai/v1",
                api_key=settings.CEREBRAS_API_KEY,
                max_tokens=custom_tokens.get("cerebras", 4096),
            )
        )

    # 4. Mistral Family via Mistral AI
    if providers_enabled.get("mistral", True) and settings.MISTRAL_API_KEY:
        adapters.append(
            OpenAICompatibleAdapter(
                name="mistral",
                display_name="Mistral AI",
                model_family="Mistral Family",
                model_id=custom_models.get("mistral", settings.MISTRAL_MODEL_ID),
                base_url="https://api.mistral.ai/v1",
                api_key=settings.MISTRAL_API_KEY,
                max_tokens=custom_tokens.get("mistral", 4096),
            )
        )

    # 5. Qwen Family via OpenRouter Free Tier
    if providers_enabled.get("openrouter", True) and settings.OPENROUTER_API_KEY:
        adapters.append(
            OpenAICompatibleAdapter(
                name="openrouter",
                display_name="OpenRouter Qwen",
                model_family="Qwen Family",
                model_id=custom_models.get("openrouter", settings.OPENROUTER_MODEL_ID),
                base_url="https://openrouter.ai/api/v1",
                api_key=settings.OPENROUTER_API_KEY,
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
        adapters.append(
            OpenAICompatibleAdapter(
                name="nvidia",
                display_name="NVIDIA NIM (GLM)",
                model_family="Zhipu GLM",
                model_id=custom_models.get("nvidia", settings.NVIDIA_MODEL_ID),
                base_url="https://integrate.api.nvidia.com/v1",
                api_key=settings.NVIDIA_API_KEY,
                max_tokens=custom_tokens.get("nvidia", 4096),
                shared_rate_limit_key="nvidia",
            )
        )

    # 7. Optional Moonshot Kimi Family via NVIDIA NIM (shares NVIDIA_API_KEY)
    if (
        providers_enabled.get("nvidia_kimi", True)
        and settings.NVIDIA_API_KEY
        and settings.NVIDIA_KIMI_MODEL_ID
    ):
        adapters.append(
            OpenAICompatibleAdapter(
                name="nvidia_kimi",
                display_name="NVIDIA NIM (Kimi)",
                model_family="Moonshot Kimi",
                model_id=custom_models.get("nvidia_kimi", settings.NVIDIA_KIMI_MODEL_ID),
                base_url="https://integrate.api.nvidia.com/v1",
                api_key=settings.NVIDIA_API_KEY,
                max_tokens=custom_tokens.get("nvidia_kimi", 4096),
                shared_rate_limit_key="nvidia",
            )
        )

    # 8. Optional Local Ollama (only if local deployment)
    if not settings.is_hosted and providers_enabled.get("ollama", False):
        adapters.append(
            OpenAICompatibleAdapter(
                name="ollama",
                display_name="Ollama (Local Offline)",
                model_family="Self-Hosted Private",
                model_id=custom_models.get("ollama", settings.OLLAMA_MODEL_ID),
                base_url=f"{settings.OLLAMA_BASE_URL}/v1",
                is_local=True,
                max_tokens=custom_tokens.get("ollama", 4096),
            )
        )

    return adapters
