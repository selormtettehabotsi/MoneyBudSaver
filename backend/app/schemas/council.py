"""
Pydantic schemas for AI Council deliberations, votes, quotas, and verdicts.
"""
from datetime import datetime
from decimal import Decimal
from typing import Optional, List, Dict, Any, Literal
from pydantic import BaseModel, Field, ConfigDict


class AskCouncilRequest(BaseModel):
    question: str = Field(..., min_length=5, max_length=1000, description="Financial decision or question to deliberate")
    decision_type: Literal["general", "borrow", "purchase", "investment", "budget_cut"] = "general"
    candidate_amount: Optional[Decimal] = Field(None, ge=0, decimal_places=2, description="Proposed loan or purchase amount")
    enable_debate: bool = Field(False, description="Enable Round 2 council debate where AIs see peer summaries and revote")
    local_only_mode: bool = Field(False, description="Use local Ollama model exclusively for strict offline privacy")


class IndividualVote(BaseModel):
    provider_name: str
    model_id: str
    model_family: str
    status: Literal["success", "failed", "timeout", "rate_limited", "skipped", "unavailable"]
    verdict: Optional[Literal["approve", "reject", "approve_with_conditions"]] = None
    confidence: Optional[int] = Field(None, ge=0, le=100)
    reasoning: Optional[str] = None
    risks: List[str] = Field(default_factory=list)
    conditions: List[str] = Field(default_factory=list)
    suggested_amount: Optional[Decimal] = None
    round_number: int = 1
    error_message: Optional[str] = None


class CouncilTally(BaseModel):
    weighted_score: float  # Range: -1.0 (strict reject) to +1.0 (strict approve)
    final_verdict: Literal["approve", "approve_with_conditions", "reject", "split_decision"]
    consensus_summary: str
    key_agreements: List[str]
    key_disagreements: List[str]
    is_tie: bool
    total_votes_counted: int
    total_votes_skipped: int


class GuardrailBreachInfo(BaseModel):
    breached: bool
    violations: List[str]
    pre_decision_dti: float
    post_decision_dti: Optional[float]
    current_runway_months: float
    post_decision_runway_months: Optional[float]
    max_dti_threshold: float
    min_runway_threshold: float


class CouncilDecisionOut(BaseModel):
    id: str
    user_id: str
    question: str
    decision_type: str
    candidate_amount: Optional[Decimal]
    enable_debate: bool
    local_only_mode: bool
    financial_snapshot: Dict[str, Any]
    round1_votes: Dict[str, Any]
    round2_votes: Optional[Dict[str, Any]]
    final_tally: Dict[str, Any]
    guardrail_breach: Optional[Dict[str, Any]]
    user_verdict: Optional[Literal["accepted", "rejected", "modified"]]
    user_modifications: Optional[str]
    decided_at: Optional[datetime]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UserDecisionSubmit(BaseModel):
    user_verdict: Literal["accepted", "rejected", "modified"]
    user_modifications: Optional[str] = None


class ProviderStatusItem(BaseModel):
    name: str
    display_name: str
    model_family: str
    model_id: str
    is_configured: bool
    is_local: bool
    daily_request_count: int
    status: Literal["ready", "missing_key", "disabled_in_hosted", "rate_limited"]
