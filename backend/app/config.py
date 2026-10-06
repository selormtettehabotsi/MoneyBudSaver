"""
MoneyCouncil Configuration Module
Reads from environment variables and .env file.
Fails fast if production secrets are insecure or missing.
"""
import os
from typing import List, Optional, Union
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator


class Settings(BaseSettings):
    # App & Security
    APP_NAME: str = "MoneyCouncil"
    ENVIRONMENT: str = "development"
    SECRET_KEY: str = "insecure_dev_secret_key_please_change_in_production_992837482"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 30  # 30 days session
    INVITE_CODE: Optional[str] = None
    DEPLOYMENT_MODE: str = "local"  # "local" allows Ollama; "hosted" disables local-only Ollama mode
    COOKIE_SECURE: bool = False  # Auto-enforced True when is_hosted or ENVIRONMENT=production
    COOKIE_SAMESITE: str = "lax"
    AUTH_COOKIE_NAME: str = "mc_session"
    CSRF_COOKIE_NAME: str = "mc_csrf"
    
    # CORS
    CORS_ORIGINS: Union[List[str], str] = ["http://localhost:5173", "http://localhost:8000", "http://127.0.0.1:5173", "http://127.0.0.1:8000"]

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v):
        if isinstance(v, str):
            if v.startswith("[") and v.endswith("]"):
                import json
                try:
                    parsed = json.loads(v)
                    if isinstance(parsed, list):
                        return [str(o) for o in parsed if str(o) != "*"]
                except Exception:
                    pass
            origins = [i.strip() for i in v.split(",") if i.strip()]
            return [o for o in origins if o != "*"]
        if isinstance(v, list):
            return [str(o) for o in v if str(o) != "*"]
        return v

    # Database
    DATABASE_URL: str = "sqlite:///./moneycouncil.db"

    # Cron Endpoint Secret (for weekly review webhook)
    CRON_SECRET: str = "dev_cron_secret_123_change_in_production"

    # AI Provider Engine Configuration
    AI_PROVIDER_TIMEOUT_SECONDS: int = 25
    AI_PROVIDER_DEFAULT_TIMEOUT_SECONDS: int = 25
    NVIDIA_PROVIDER_TIMEOUT_SECONDS: int = 90
    COUNCIL_JOB_TIMEOUT_SECONDS: int = 300  # 5 minutes max lifetime (longer than 2 debate rounds * 90s)
    COUNCIL_MIN_QUORUM_VOTES: int = 3
    SHARED_KEY_STAGGER_INTERVAL_SECONDS: float = 1.5

    # Financial Guardrail Defaults (Single Source of Truth)
    DEFAULT_MAX_DTI_RATIO: float = 40.0
    DEFAULT_MIN_RUNWAY_MONTHS: float = 3.0
    DEFAULT_CURRENCY: str = "GHS"

    # Provider API Keys & Model IDs (at least 5 different model families)
    GEMINI_API_KEY: Optional[str] = None
    GEMINI_MODEL_ID: str = "gemini-3.8-flash"
    GEMINI_FALLBACK_MODEL_ID: Optional[str] = None
    GEMINI_MODEL_FAMILY: Optional[str] = None

    GROQ_API_KEY: Optional[str] = None
    GROQ_MODEL_ID: str = "openai/gpt-oss-120b"
    GROQ_FALLBACK_MODEL_ID: Optional[str] = None
    GROQ_MODEL_FAMILY: Optional[str] = None

    MISTRAL_API_KEY: Optional[str] = None
    MISTRAL_MODEL_ID: str = "mistral-small-latest"
    MISTRAL_FALLBACK_MODEL_ID: Optional[str] = None
    MISTRAL_MODEL_FAMILY: Optional[str] = None

    OPENROUTER_API_KEY: Optional[str] = None
    OPENROUTER_MODEL_ID: str = "qwen/qwen3.8-27b:free"
    OPENROUTER_FALLBACK_MODEL_ID: Optional[str] = None
    OPENROUTER_MODEL_FAMILY: Optional[str] = None

    NVIDIA_API_KEY: Optional[str] = None
    NVIDIA_MODEL_ID: str = "z-ai/glm-5.3-flash"
    NVIDIA_FALLBACK_MODEL_ID: Optional[str] = None
    NVIDIA_MODEL_FAMILY: Optional[str] = None

    NVIDIA_KIMI_MODEL_ID: Optional[str] = "moonshotai/kimi-k3"
    NVIDIA_KIMI_FALLBACK_MODEL_ID: Optional[str] = None
    NVIDIA_KIMI_MODEL_FAMILY: Optional[str] = None

    CEREBRAS_API_KEY: Optional[str] = None
    CEREBRAS_MODEL_ID: str = "llama3.3-70b"
    CEREBRAS_FALLBACK_MODEL_ID: Optional[str] = None
    CEREBRAS_MODEL_FAMILY: Optional[str] = None

    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL_ID: str = "llama3.2"
    OLLAMA_FALLBACK_MODEL_ID: Optional[str] = None
    OLLAMA_MODEL_FAMILY: Optional[str] = None

    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=True
    )

    @property
    def is_hosted(self) -> bool:
        return self.DEPLOYMENT_MODE.lower() == "hosted"

    @property
    def effective_cookie_secure(self) -> bool:
        """Enforces Secure cookie on HTTPS, hosted deployment, or production."""
        return self.COOKIE_SECURE or self.is_hosted or (self.ENVIRONMENT.lower() == "production")

    def validate_production_readiness(self):
        """Fails fast on startup if production environment lacks secure secrets."""
        if self.ENVIRONMENT.lower() == "production":
            insecure_placeholders = [
                "insecure_dev_secret",
                "change_this",
                "your-secret-key",
                "secret_key_please_change",
                "dev_cron_secret",
                "dev_internal_cron_secret",
                "placeholder",
            ]
            if not self.SECRET_KEY or len(self.SECRET_KEY) < 32 or any(p in self.SECRET_KEY.lower() for p in insecure_placeholders):
                raise ValueError("FATAL: In production, SECRET_KEY must be a cryptographically secure random string >= 32 chars without placeholders.")
            if not self.CRON_SECRET or len(self.CRON_SECRET) < 32 or any(p in self.CRON_SECRET.lower() for p in insecure_placeholders):
                raise ValueError("FATAL: In production, CRON_SECRET must be set to a secure unique secret >= 32 chars without placeholders.")


settings = Settings()
settings.validate_production_readiness()
