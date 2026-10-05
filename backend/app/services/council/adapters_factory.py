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
            )
        )

    # 2. Meta Llama Family via Groq
    if providers_enabled.get("groq", True) and settings.GROQ_API_KEY:
        adapters.append(
            OpenAICompatibleAdapter(
                name="groq",
                display_name="Groq Llama",
                model_family="Meta Llama Family",
                model_id=custom_models.get("groq", settings.GROQ_MODEL_ID),
                base_url="https://api.groq.com/openai/v1",
                api_key=settings.GROQ_API_KEY,
            )
        )

    # 3. Meta Llama Family via Cerebras (High-throughput Wafer Scale)
    if providers_enabled.get("cerebras", True) and settings.CEREBRAS_API_KEY:
        adapters.append(
            OpenAICompatibleAdapter(
                name="cerebras",
                display_name="Cerebras Llama",
                model_family="Meta Llama Family",
                model_id=custom_models.get("cerebras", settings.CEREBRAS_MODEL_ID),
                base_url="https://api.cerebras.ai/v1",
                api_key=settings.CEREBRAS_API_KEY,
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
            )
        )

    # 5. DeepSeek / Qwen Family via OpenRouter Free Tier
    if providers_enabled.get("openrouter", True) and settings.OPENROUTER_API_KEY:
        adapters.append(
            OpenAICompatibleAdapter(
                name="openrouter",
                display_name="OpenRouter DeepSeek/Qwen",
                model_family="DeepSeek / Qwen Family",
                model_id=custom_models.get("openrouter", settings.OPENROUTER_MODEL_ID),
                base_url="https://openrouter.ai/api/v1",
                api_key=settings.OPENROUTER_API_KEY,
                extra_headers={
                    "HTTP-Referer": "https://github.com/selormtettehabotsi/MoneyBudSaver",
                    "X-Title": "MoneyCouncil",
                },
            )
        )

    # 6. Optional Local Ollama (only if local deployment)
    if not settings.is_hosted and providers_enabled.get("ollama", False):
        adapters.append(
            OpenAICompatibleAdapter(
                name="ollama",
                display_name="Ollama (Local Offline)",
                model_family="Self-Hosted Private",
                model_id=custom_models.get("ollama", settings.OLLAMA_MODEL_ID),
                base_url=f"{settings.OLLAMA_BASE_URL}/v1",
                is_local=True,
            )
        )

    return adapters
