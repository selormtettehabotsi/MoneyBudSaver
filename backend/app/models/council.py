import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Boolean, DateTime, Date, Integer, Numeric, Text, JSON, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from app.db.session import Base


class CouncilDecision(Base):
    __tablename__ = "council_decisions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    question = Column(Text, nullable=False)
    decision_type = Column(String(50), default="general", nullable=False)
    candidate_amount = Column(Numeric(14, 2), nullable=True)
    enable_debate = Column(Boolean, default=False, nullable=False)
    local_only_mode = Column(Boolean, default=False, nullable=False)
    status = Column(String(20), default="completed", nullable=False)  # 'pending', 'running', 'completed', 'failed'

    # Anonymized Facts computed by deterministic engine
    financial_snapshot = Column(JSON, default=dict, nullable=False)

    # Deliberations and votes
    round1_votes = Column(JSON, default=dict, nullable=False)
    round2_votes = Column(JSON, nullable=True)
    final_tally = Column(JSON, default=dict, nullable=False)

    # Hard guardrail violation status (if triggered)
    guardrail_breach = Column(JSON, nullable=True)

    # User's final choice
    user_verdict = Column(String(20), nullable=True)  # 'accepted', 'rejected', 'modified'
    user_modifications = Column(Text, nullable=True)
    decided_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    # Relationships
    user = relationship("User", back_populates="council_decisions")


class ProviderQuota(Base):
    __tablename__ = "provider_quotas"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    provider_name = Column(String(50), nullable=False)
    date = Column(Date, nullable=False)
    request_count = Column(Integer, default=0, nullable=False)
    error_count = Column(Integer, default=0, nullable=False)
    last_called_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        UniqueConstraint("provider_name", "date", name="uq_provider_date"),
    )


class CouncilJob(Base):
    __tablename__ = "council_jobs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(String(20), default="pending", nullable=False)  # 'pending', 'running', 'completed', 'failed'
    current_round = Column(Integer, default=1, nullable=False)
    total_rounds = Column(Integer, default=1, nullable=False)
    providers_progress = Column(JSON, default=dict, nullable=False)
    error = Column(Text, nullable=True)
    decision_id = Column(String(36), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    # Relationships
    user = relationship("User", back_populates="council_jobs")


class CouncilCache(Base):
    __tablename__ = "council_cache"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    query_hash = Column(String(64), unique=True, index=True, nullable=False)
    response_payload = Column(JSON, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)


class ProviderCircuitBreaker(Base):
    __tablename__ = "provider_circuit_breakers"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    provider_name = Column(String(50), unique=True, index=True, nullable=False)
    consecutive_failures = Column(Integer, default=0, nullable=False)
    last_failure_reason = Column(Text, nullable=True)
    last_failure_at = Column(DateTime(timezone=True), nullable=True)
    is_tripped = Column(Boolean, default=False, nullable=False)
    tripped_until = Column(DateTime(timezone=True), nullable=True)
    last_test_result = Column(JSON, nullable=True)
    ttft_samples = Column(JSON, default=list, nullable=True)
    median_ttft_ms = Column(Integer, nullable=True)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)


class ProviderParamFallback(Base):
    __tablename__ = "provider_param_fallbacks"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    provider_name = Column(String(50), nullable=False, index=True)
    model_id = Column(String(150), nullable=False, index=True)
    thinking_supported = Column(Boolean, default=False, nullable=False)
    last_checked_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    __table_args__ = (
        UniqueConstraint("provider_name", "model_id", name="uq_provider_model_param_fallback"),
    )


class ProviderSetting(Base):
    __tablename__ = "provider_settings"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    provider_key = Column(String(50), unique=True, index=True, nullable=False)
    model_id = Column(String(150), nullable=True)
    fallback_model_id = Column(String(150), nullable=True)
    family_override = Column(String(50), nullable=True)
    enabled = Column(Boolean, default=True, nullable=False)
    timeout = Column(Integer, default=25, nullable=False)
    temperature = Column(Numeric(4, 2), default=0.5, nullable=False)
    top_p = Column(Numeric(4, 2), default=0.95, nullable=False)
    max_tokens = Column(Integer, default=4096, nullable=False)
    confirmed_free = Column(Boolean, default=False, nullable=False)
    history = Column(JSON, default=list, nullable=False)  # List of previous model IDs (up to 5)
    display_name = Column(String(100), nullable=True)
    base_url = Column(String(255), nullable=True)
    env_key_name = Column(String(100), nullable=True)  # NAME of env var only, never the key itself
    exclude_slow_round2 = Column(Boolean, default=False, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)


class RecommendedModel(Base):
    __tablename__ = "recommended_models"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    provider_name = Column(String(50), index=True, nullable=False)
    model_id = Column(String(150), nullable=False)
    sort_order = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    __table_args__ = (
        UniqueConstraint("provider_name", "model_id", name="uq_recommended_provider_model"),
    )


class FreeTierAllowlist(Base):
    __tablename__ = "free_tier_models"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    provider_name = Column(String(50), index=True, nullable=False)
    model_id = Column(String(150), nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    __table_args__ = (
        UniqueConstraint("provider_name", "model_id", name="uq_free_tier_provider_model"),
    )


class ModelSwitchLog(Base):
    __tablename__ = "model_switch_logs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    provider_key = Column(String(50), index=True, nullable=False)
    old_model_id = Column(String(150), nullable=False)
    new_model_id = Column(String(150), nullable=False)
    reason = Column(Text, nullable=False)
    reverted = Column(Boolean, default=False, nullable=False)
    switched_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)


class CouncilAppSetting(Base):
    __tablename__ = "council_app_settings"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    setting_key = Column(String(50), unique=True, index=True, nullable=False)
    setting_value = Column(JSON, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

