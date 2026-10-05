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


class CouncilCache(Base):
    __tablename__ = "council_cache"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    query_hash = Column(String(64), unique=True, index=True, nullable=False)
    response_payload = Column(JSON, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
