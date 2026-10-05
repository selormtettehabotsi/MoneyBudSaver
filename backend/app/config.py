"""
MoneyCouncil Configuration Module
Reads from environment variables and .env file.
Fails fast if production secrets are insecure or missing.
"""
import os
from typing import List, Optional
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
    CORS_ORIGINS: List[str] = ["http://localhost:5173", "http://localhost:8000", "http://127.0.0.1:5173", "http://127.0.0.1:8000"]

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v):
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",") if i.strip()]
        return v

    # Database
    DATABASE_URL: str = "sqlite:///./moneycouncil.db"

    # Internal Cron Endpoint Secret
    INTERNAL_CRON_SECRET: str = "dev_internal_cron_secret_123"

    # AI Provider Engine Configuration
    AI_PROVIDER_TIMEOUT_SECONDS: int = 25

    # Financial Guardrail Defaults
    DEFAULT_MAX_DTI_RATIO: float = 40.0
    DEFAULT_MIN_RUNWAY_MONTHS: float = 3.0
    DEFAULT_CURRENCY: str = "GHS"

    # Provider API Keys & Model IDs (at least 4 different model families)
    GEMINI_API_KEY: Optional[str] = None
    GEMINI_MODEL_ID: str = "gemini-2.5-flash"

    GROQ_API_KEY: Optional[str] = None
    GROQ_MODEL_ID: str = "llama-3.3-70b-versatile"

    CEREBRAS_API_KEY: Optional[str] = None
    CEREBRAS_MODEL_ID: str = "llama3.3-70b"

    MISTRAL_API_KEY: Optional[str] = None
    MISTRAL_MODEL_ID: str = "mistral-small-latest"

    OPENROUTER_API_KEY: Optional[str] = None
    OPENROUTER_MODEL_ID: str = "deepseek/deepseek-chat"

    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL_ID: str = "llama3.2"

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
            if "insecure_dev_secret" in self.SECRET_KEY or len(self.SECRET_KEY) < 32:
                raise ValueError("FATAL: In production, SECRET_KEY must be a cryptographically secure random string >= 32 chars.")
            if self.INTERNAL_CRON_SECRET == "dev_internal_cron_secret_123":
                raise ValueError("FATAL: In production, INTERNAL_CRON_SECRET must be set to a secure unique secret.")


settings = Settings()
settings.validate_production_readiness()
