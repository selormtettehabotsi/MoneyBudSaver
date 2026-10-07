"""
Database initialization and default seeding helpers.
"""
from datetime import datetime, timezone
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session
from app.db.session import engine, Base
from app.db.base import *  # ensure all models are registered
from app.models.category import Category
from app.models.council import CouncilJob
from app.constants import DEFAULT_CATEGORIES


def run_schema_migrations(target_engine=None):
    """
    Safely and idempotently applies missing schema migrations to existing database tables.
    Runs on both SQLite and PostgreSQL without altering or deleting existing data.
    """
    db_engine = target_engine or engine
    inspector = inspect(db_engine)
    table_names = inspector.get_table_names()

    if "transactions" in table_names:
        columns = [c["name"] for c in inspector.get_columns("transactions")]
        if "client_id" not in columns:
            with db_engine.begin() as conn:
                if db_engine.dialect.name == "sqlite":
                    conn.execute(text("ALTER TABLE transactions ADD COLUMN client_id VARCHAR(36)"))
                else:
                    conn.execute(text("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS client_id VARCHAR(36)"))
                
                # Create index on client_id
                try:
                    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_transactions_client_id ON transactions (client_id)"))
                except Exception:
                    pass

    if "council_decisions" in table_names:
        cols = [c["name"] for c in inspector.get_columns("council_decisions")]
        if "status" not in cols:
            with db_engine.begin() as conn:
                if db_engine.dialect.name == "sqlite":
                    conn.execute(text("ALTER TABLE council_decisions ADD COLUMN status VARCHAR(20) DEFAULT 'completed'"))
                else:
                    conn.execute(text("ALTER TABLE council_decisions ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'completed'"))

    if "users" in table_names:
        user_cols = [c["name"] for c in inspector.get_columns("users")]
        if "token_version" not in user_cols:
            with db_engine.begin() as conn:
                if db_engine.dialect.name == "sqlite":
                    conn.execute(text("ALTER TABLE users ADD COLUMN token_version INTEGER DEFAULT 1"))
                else:
                    conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER DEFAULT 1"))

    if "provider_circuit_breakers" in table_names:
        cb_cols = [c["name"] for c in inspector.get_columns("provider_circuit_breakers")]
        with db_engine.begin() as conn:
            if "ttft_samples" not in cb_cols:
                if db_engine.dialect.name == "sqlite":
                    conn.execute(text("ALTER TABLE provider_circuit_breakers ADD COLUMN ttft_samples JSON DEFAULT '[]'"))
                else:
                    conn.execute(text("ALTER TABLE provider_circuit_breakers ADD COLUMN IF NOT EXISTS ttft_samples JSON DEFAULT '[]'"))
            if "median_ttft_ms" not in cb_cols:
                if db_engine.dialect.name == "sqlite":
                    conn.execute(text("ALTER TABLE provider_circuit_breakers ADD COLUMN median_ttft_ms INTEGER"))
                else:
                    conn.execute(text("ALTER TABLE provider_circuit_breakers ADD COLUMN IF NOT EXISTS median_ttft_ms INTEGER"))

    if "provider_settings" in table_names:
        ps_cols = [c["name"] for c in inspector.get_columns("provider_settings")]
        with db_engine.begin() as conn:
            if "temperature" not in ps_cols:
                if db_engine.dialect.name == "sqlite":
                    conn.execute(text("ALTER TABLE provider_settings ADD COLUMN temperature NUMERIC(4,2) DEFAULT 0.5"))
                else:
                    conn.execute(text("ALTER TABLE provider_settings ADD COLUMN IF NOT EXISTS temperature NUMERIC(4,2) DEFAULT 0.5"))
            if "top_p" not in ps_cols:
                if db_engine.dialect.name == "sqlite":
                    conn.execute(text("ALTER TABLE provider_settings ADD COLUMN top_p NUMERIC(4,2) DEFAULT 0.95"))
                else:
                    conn.execute(text("ALTER TABLE provider_settings ADD COLUMN IF NOT EXISTS top_p NUMERIC(4,2) DEFAULT 0.95"))
            if "max_tokens" not in ps_cols:
                if db_engine.dialect.name == "sqlite":
                    conn.execute(text("ALTER TABLE provider_settings ADD COLUMN max_tokens INTEGER DEFAULT 4096"))
                else:
                    conn.execute(text("ALTER TABLE provider_settings ADD COLUMN IF NOT EXISTS max_tokens INTEGER DEFAULT 4096"))

    # Ensure all tables exist
    Base.metadata.create_all(bind=db_engine)

    # Idempotently clean up removed providers (Mistral, Cerebras, Anthropic, Claude)
    obsolete_providers = ("mistral", "cerebras", "anthropic", "claude")
    with db_engine.begin() as conn:
        for p in obsolete_providers:
            try:
                conn.execute(text("DELETE FROM provider_circuit_breakers WHERE LOWER(provider_name) = :p"), {"p": p})
            except Exception:
                pass
            try:
                conn.execute(text("DELETE FROM provider_quotas WHERE LOWER(provider_name) = :p"), {"p": p})
            except Exception:
                pass
            try:
                conn.execute(text("DELETE FROM provider_param_fallbacks WHERE LOWER(provider_name) = :p"), {"p": p})
            except Exception:
                pass
            try:
                conn.execute(text("DELETE FROM provider_settings WHERE LOWER(provider_key) = :p"), {"p": p})
            except Exception:
                pass
            try:
                conn.execute(text("DELETE FROM recommended_models WHERE LOWER(provider_name) = :p"), {"p": p})
            except Exception:
                pass
            try:
                conn.execute(text("DELETE FROM free_tier_models WHERE LOWER(provider_name) = :p"), {"p": p})
            except Exception:
                pass


def seed_council_defaults(target_engine=None):
    """
    Seeds initial free tier allowlist, recommended models, provider settings, and global council settings into the database.
    Idempotent: will not overwrite existing customized provider settings or recommended lists.
    """
    import os
    import json
    from sqlalchemy import func
    from sqlalchemy.orm import Session as OrmSession
    from app.models.council import (
        ProviderSetting,
        RecommendedModel,
        FreeTierAllowlist,
        CouncilAppSetting,
        ProviderCircuitBreaker,
        ProviderQuota,
        ProviderParamFallback,
    )

    data_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")

    # If already an active ORM Session
    if isinstance(target_engine, OrmSession):
        session = target_engine
        should_close = False
    else:
        db_engine = target_engine or engine
        session = OrmSession(db_engine)
        should_close = True

    try:
        # Idempotently clean up removed providers (Mistral, Cerebras, Anthropic, Claude)
        obsolete_providers = ("mistral", "cerebras", "anthropic", "claude")
        for p in obsolete_providers:
            try:
                session.query(ProviderSetting).filter(func.lower(ProviderSetting.provider_key) == p).delete()
            except Exception:
                pass
            try:
                session.query(ProviderCircuitBreaker).filter(func.lower(ProviderCircuitBreaker.provider_name) == p).delete()
            except Exception:
                pass
            try:
                session.query(ProviderQuota).filter(func.lower(ProviderQuota.provider_name) == p).delete()
            except Exception:
                pass
            try:
                session.query(ProviderParamFallback).filter(func.lower(ProviderParamFallback.provider_name) == p).delete()
            except Exception:
                pass
            try:
                session.query(RecommendedModel).filter(func.lower(RecommendedModel.provider_name) == p).delete()
            except Exception:
                pass
        # Idempotently migrate old slot keys (nvidia, nvidia_kimi, groq, openrouter) to new keys
        # and merge duplicate circuit breaker records without losing settings
        slot_mapping = {
            "nvidia": "nvidia_1",
            "nvidia_glm": "nvidia_1",
            "nvidia_kimi": "nvidia_2",
            "kimi": "nvidia_2",
            "groq": "groq_1",
            "openrouter": "openrouter_1",
        }

        # 1. ProviderSetting migration
        for old_k, new_k in slot_mapping.items():
            old_setting = session.query(ProviderSetting).filter(func.lower(ProviderSetting.provider_key) == old_k).first()
            if old_setting:
                new_setting = session.query(ProviderSetting).filter(func.lower(ProviderSetting.provider_key) == new_k).first()
                if not new_setting:
                    old_setting.provider_key = new_k
                else:
                    if old_setting.api_key and not new_setting.api_key:
                        new_setting.api_key = old_setting.api_key
                    if old_setting.model_id:
                        new_setting.model_id = old_setting.model_id
                    if old_setting.family_override:
                        new_setting.family_override = old_setting.family_override
                    if old_setting.enabled is not None:
                        new_setting.enabled = old_setting.enabled
                    if old_setting.timeout:
                        new_setting.timeout = old_setting.timeout
                    if old_setting.history:
                        new_setting.history = old_setting.history
                    if old_setting.confirmed_free is not None:
                        new_setting.confirmed_free = old_setting.confirmed_free
                    session.delete(old_setting)

        # 2. ProviderCircuitBreaker migration (Merge duplicates into single slot record)
        for old_k, new_k in slot_mapping.items():
            old_cb = session.query(ProviderCircuitBreaker).filter(func.lower(ProviderCircuitBreaker.provider_name) == old_k).first()
            if old_cb:
                new_cb = session.query(ProviderCircuitBreaker).filter(func.lower(ProviderCircuitBreaker.provider_name) == new_k).first()
                if not new_cb:
                    old_cb.provider_name = new_k
                else:
                    new_cb.consecutive_failures = max(new_cb.consecutive_failures or 0, old_cb.consecutive_failures or 0)
                    if old_cb.is_tripped:
                        new_cb.is_tripped = True
                        new_cb.tripped_until = old_cb.tripped_until
                        new_cb.last_failure_reason = old_cb.last_failure_reason
                    if old_cb.last_test_result and not new_cb.last_test_result:
                        new_cb.last_test_result = old_cb.last_test_result
                    if old_cb.median_ttft_ms and not new_cb.median_ttft_ms:
                        new_cb.median_ttft_ms = old_cb.median_ttft_ms
                    session.delete(old_cb)

        # 3. ProviderQuota migration
        for old_k, new_k in slot_mapping.items():
            old_q = session.query(ProviderQuota).filter(func.lower(ProviderQuota.provider_name) == old_k).first()
            if old_q:
                new_q = session.query(ProviderQuota).filter(func.lower(ProviderQuota.provider_name) == new_k).first()
                if not new_q:
                    old_q.provider_name = new_k
                else:
                    session.delete(old_q)

        # 4. ProviderParamFallback migration
        for old_k, new_k in slot_mapping.items():
            old_fallbacks = session.query(ProviderParamFallback).filter(func.lower(ProviderParamFallback.provider_name) == old_k).all()
            for of in old_fallbacks:
                exists = session.query(ProviderParamFallback).filter(
                    func.lower(ProviderParamFallback.provider_name) == new_k,
                    ProviderParamFallback.model_id == of.model_id,
                ).first()
                if not exists:
                    of.provider_name = new_k
                else:
                    session.delete(of)

        session.flush()

        # 1. Seed Free Tier Allowlist
        allowlist_file = os.path.join(data_dir, "free_tier_models.json")
        allowlist_data = {}
        if os.path.exists(allowlist_file):
            try:
                with open(allowlist_file, "r", encoding="utf-8") as f:
                    allowlist_data = json.load(f)
            except Exception:
                pass
        
        for p_name, models in allowlist_data.items():
            for m_id in models:
                exists = session.query(FreeTierAllowlist).filter(
                    FreeTierAllowlist.provider_name == p_name,
                    FreeTierAllowlist.model_id == m_id,
                ).first()
                if not exists:
                    session.add(FreeTierAllowlist(provider_name=p_name, model_id=m_id))

        # 2. Seed Recommended Models
        rec_file = os.path.join(data_dir, "recommended_models.json")
        rec_data = {}
        if os.path.exists(rec_file):
            try:
                with open(rec_file, "r", encoding="utf-8") as f:
                    rec_data = json.load(f)
            except Exception:
                pass

        for p_name, models in rec_data.items():
            for idx, m_id in enumerate(models):
                exists = session.query(RecommendedModel).filter(
                    RecommendedModel.provider_name == p_name,
                    RecommendedModel.model_id == m_id,
                ).first()
                if not exists:
                    session.add(RecommendedModel(provider_name=p_name, model_id=m_id, sort_order=idx))

        # 3. Seed Provider Settings defaults if empty
        default_providers = [
            {"key": "gemini", "model": "gemini-2.5-flash", "family": "Google Gemini", "enabled": True, "timeout": 25, "confirmed": True, "display": "Google Gemini"},
            {"key": "groq_1", "model": "openai/gpt-oss-120b", "family": "OpenAI / GPT-OSS", "enabled": True, "timeout": 25, "confirmed": True, "display": "Groq GPT-OSS"},
            {"key": "groq_2", "model": "qwen-qwq-32b", "family": "Qwen", "enabled": True, "timeout": 25, "confirmed": True, "display": "Groq Qwen"},
            {"key": "openrouter_1", "model": "nvidia/llama-3.1-nemotron-70b-instruct:free", "family": "NVIDIA Nemotron", "enabled": True, "timeout": 25, "confirmed": True, "display": "OpenRouter Nemotron"},
            {"key": "openrouter_2", "model": "google/gemma-2-9b-it:free", "family": "Google Gemma", "enabled": True, "timeout": 25, "confirmed": True, "display": "OpenRouter Gemma"},
            {"key": "nvidia_1", "model": "meta/muse-glimmer-30b", "family": "Meta Muse", "enabled": True, "timeout": 100, "confirmed": True, "display": "NVIDIA Muse"},
            {"key": "nvidia_2", "model": "moonshotai/kimi-k3", "family": "Moonshot Kimi", "enabled": False, "timeout": 100, "confirmed": True, "display": "NVIDIA Kimi"},
            {"key": "custom_1", "model": "", "family": "Custom", "enabled": False, "timeout": 25, "confirmed": False, "display": "Custom OpenAI Slot 1"},
            {"key": "custom_2", "model": "", "family": "Custom", "enabled": False, "timeout": 25, "confirmed": False, "display": "Custom OpenAI Slot 2"},
            {"key": "ollama", "model": "llama3.2", "family": "Self-Hosted Private", "enabled": False, "timeout": 25, "confirmed": True, "display": "Ollama (Local Offline)"},
        ]

        for dp in default_providers:
            existing = session.query(ProviderSetting).filter(ProviderSetting.provider_key == dp["key"]).first()
            if not existing:
                session.add(
                    ProviderSetting(
                        provider_key=dp["key"],
                        model_id=dp["model"],
                        family_override=dp["family"],
                        enabled=dp["enabled"],
                        timeout=dp["timeout"],
                        temperature=0.5,
                        top_p=0.95,
                        max_tokens=4096,
                        confirmed_free=dp["confirmed"],
                        display_name=dp["display"],
                        history=[],
                    )
                )

        # 4. Seed global Council app setting: auto-switch
        auto_switch_setting = session.query(CouncilAppSetting).filter(CouncilAppSetting.setting_key == "auto_switch_on_missing_model").first()
        if not auto_switch_setting:
            session.add(CouncilAppSetting(setting_key="auto_switch_on_missing_model", setting_value=True))

        session.commit()
    finally:
        if should_close:
            session.close()


def recover_stale_council_jobs(target_engine=None):
    """
    On server startup, marks any Council jobs left in 'running' or 'pending' state
    as failed so users do not get stuck on dead in-flight tasks after a restart.
    """
    db_engine = target_engine or engine
    try:
        with Session(db_engine) as session:
            stale_jobs = session.query(CouncilJob).filter(
                CouncilJob.status.in_(["pending", "running"])
            ).all()
            for job in stale_jobs:
                job.status = "failed"
                job.error = "Server restarted during deliberation. Please submit your inquiry again."
                job.updated_at = datetime.now(timezone.utc)
            session.commit()
    except Exception:
        pass


def init_db(target_engine=None):
    """Create all database tables, apply pending schema migrations, seed council data, and recover stale jobs."""
    db_engine = target_engine or engine
    Base.metadata.create_all(bind=db_engine)
    run_schema_migrations(db_engine)
    seed_council_defaults(db_engine)
    recover_stale_council_jobs(db_engine)


def seed_default_categories(db: Session, user_id: str):
    """Seed initial income and expense categories for a newly registered user."""
    for item in DEFAULT_CATEGORIES:
        category = Category(
            user_id=user_id,
            name=item["name"],
            type=item["type"],
            icon_name=item["icon_name"],
            color_hex=item["color_hex"],
            is_default=True,
        )
        db.add(category)
    db.commit()
