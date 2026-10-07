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
    display_name: Optional[str] = None
    model_id: str
    model_family: str
    model_used: Optional[str] = None
    is_fallback: bool = False
    status: Literal["success", "failed", "timeout", "rate_limited", "skipped", "unavailable", "missing_key", "not_configured", "invalid_key", "model_not_found", "bad_json"]
    verdict: Optional[Literal["approve", "reject", "approve_with_conditions"]] = None
    confidence: Optional[int] = Field(None, ge=0, le=100)
    reasoning: Optional[str] = None
    risks: List[str] = Field(default_factory=list)
    conditions: List[str] = Field(default_factory=list)
    suggested_amount: Optional[Decimal] = None
    round_number: int = 1
    latency_ms: Optional[int] = None
    error_message: Optional[str] = None


class CouncilTally(BaseModel):
    weighted_score: float  # Range: -1.0 (strict reject) to +1.0 (strict approve)
    final_verdict: Literal["approve", "approve_with_conditions", "reject", "split_decision", "no_quorum"]
    consensus_summary: str
    key_agreements: List[str]
    key_disagreements: List[str]
    is_tie: bool
    total_votes_counted: int
    total_votes_skipped: int
    min_quorum_required: int = 3
    has_quorum: bool = True
    diversity_warning: Optional[str] = None
    active_families_count: Optional[int] = None
    active_families: List[str] = Field(default_factory=list)


class GuardrailBreachInfo(BaseModel):
    breached: bool
    violations: List[str]
    pre_decision_dti: float
    post_decision_dti: Optional[float] = None
    current_runway_months: Optional[float] = None
    post_decision_runway_months: Optional[float] = None
    max_dti_threshold: float
    min_runway_threshold: float
    has_sufficient_data: bool = True
    runway_display: str = "Not enough data"
    data_notice: Optional[str] = None


class CouncilDecisionOut(BaseModel):
    id: str
    user_id: str
    question: str
    decision_type: str
    candidate_amount: Optional[Decimal]
    enable_debate: bool
    local_only_mode: bool
    status: str = "completed"
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


class CouncilJobStatus(BaseModel):
    job_id: str
    status: Literal["pending", "running", "completed", "failed", "cancelled"]
    current_round: int
    total_rounds: int
    providers_progress: Dict[str, str] = Field(default_factory=dict)
    decision: Optional[CouncilDecisionOut] = None
    error: Optional[str] = None


class TestConnectionRequest(BaseModel):
    __test__ = False
    provider_name: str
    model_id: Optional[str] = None


class TestConnectionResponse(BaseModel):
    __test__ = False
    provider_name: str
    model_id: str
    http_status: Optional[int] = None
    latency_ms: int
    status: Literal["success", "invalid_key", "model_not_found", "rate_limited", "timeout", "ttft_timeout", "bad_json", "error", "skipped"]
    diagnosis: str
    catalog_ok: Optional[bool] = None
    chat_status: Optional[str] = None
    ttft_ms: Optional[int] = None
    median_ttft_ms: Optional[int] = None
    retry_after_seconds: Optional[int] = None
    is_free: Optional[bool] = None
    free_models: List[str] = Field(default_factory=list)
    available_models_label: Optional[str] = None
    alternative_models: List[str] = Field(default_factory=list)
    privacy_hint: Optional[str] = None
    model_found_in_list: Optional[bool] = None
    available_models_count: int = 0
    close_matches: List[str] = Field(default_factory=list)


class UserDecisionSubmit(BaseModel):
    user_verdict: Literal["accepted", "rejected", "modified"]
    user_modifications: Optional[str] = None


class ProviderStatusItem(BaseModel):
    name: str
    display_name: str
    model_family: str
    model_id: str
    fallback_model_id: Optional[str] = None
    is_configured: bool
    is_local: bool
    has_key: bool = True
    daily_request_count: int = 0
    daily_quota_limit: Optional[int] = None
    is_near_limit: bool = False
    shares_key_with: Optional[str] = None
    status: Literal["ready", "missing_key", "missing_model_id", "disabled_in_hosted", "rate_limited", "circuit_breaker_tripped", "working", "failed", "untested", "slow", "skipped"]
    circuit_breaker_tripped: bool = False
    circuit_breaker_reason: Optional[str] = None
    circuit_breaker_resets_in_seconds: Optional[int] = None
    median_ttft_ms: Optional[int] = None
    is_slow: bool = False
    enabled_in_council: bool = True
    confirmed_free: bool = False
    history: List[str] = Field(default_factory=list)
    base_url: Optional[str] = None
    env_key_name: Optional[str] = None
    exclude_slow_round2: bool = False
    temperature: float = 0.5
    top_p: float = 0.95
    max_tokens: int = 4096


class UpdateProviderModelRequest(BaseModel):
    model_id: str = Field(..., description="Target model ID to validate, test, and activate")
    fallback_model_id: Optional[str] = None
    family_override: Optional[str] = None
    enabled: Optional[bool] = None
    timeout: Optional[int] = None
    confirmed_free: Optional[bool] = False
    display_name: Optional[str] = None
    base_url: Optional[str] = None
    env_key_name: Optional[str] = None
    exclude_slow_round2: Optional[bool] = None
    temperature: Optional[float] = None
    top_p: Optional[float] = None
    max_tokens: Optional[int] = None
    force_skip_test: bool = False


class ProviderSettingOut(BaseModel):
    provider_key: str
    model_id: Optional[str] = None
    fallback_model_id: Optional[str] = None
    family_override: Optional[str] = None
    enabled: bool = True
    timeout: int = 25
    temperature: float = 0.5
    top_p: float = 0.95
    max_tokens: int = 4096
    confirmed_free: bool = False
    history: List[str] = Field(default_factory=list)
    display_name: Optional[str] = None
    base_url: Optional[str] = None
    env_key_name: Optional[str] = None
    exclude_slow_round2: bool = False
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class ProviderModelHistoryRevertRequest(BaseModel):
    model_id: str


class RecommendedModelItem(BaseModel):
    provider_name: str
    model_id: str
    pattern: Optional[str] = None
    resolved_model_id: Optional[str] = None
    status: Optional[str] = "matched"  # 'matched' or 'no match in catalog'
    sort_order: int = 0
    last_test_badge: Optional[Literal["passed", "failed", "untested"]] = "untested"
    median_ttft_ms: Optional[int] = None
    in_live_catalog: bool = True
    is_free: bool = True



class UpdateRecommendedListRequest(BaseModel):
    models: List[str]


class FindWorkingModelCandidateResult(BaseModel):
    model_id: str
    provider_name: str
    model_family: str
    is_recommended: bool = False
    is_free: bool = True
    status: Literal["passed", "failed", "timeout", "rate_limited", "untested"]
    http_status: Optional[int] = None
    latency_ms: int = 0
    ttft_ms: Optional[int] = None
    diagnosis: str = ""


class FindWorkingModelsResponse(BaseModel):
    provider_name: str
    tested_candidates: List[FindWorkingModelCandidateResult] = Field(default_factory=list)
    message: str


class UseRecommendedResponse(BaseModel):
    provider_name: str
    applied_model_id: Optional[str] = None
    attempts: List[FindWorkingModelCandidateResult] = Field(default_factory=list)
    success: bool
    message: str


class FixAllProviderResult(BaseModel):
    provider_key: str
    action: Literal["fixed", "already_working", "failed"]
    model_id: Optional[str] = None
    old_model_id: Optional[str] = None
    new_model_id: Optional[str] = None
    message: str
    attempts: List[FindWorkingModelCandidateResult] = Field(default_factory=list)


class FixAllResponse(BaseModel):
    summary: str
    fixed_count: int
    working_count: int
    failed_count: int
    details: List[FixAllProviderResult] = Field(default_factory=list)


class ModelSwitchLogOut(BaseModel):
    id: str
    provider_key: str
    old_model_id: str
    new_model_id: str
    reason: str
    reverted: bool
    switched_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AutoSwitchSettingUpdate(BaseModel):
    enabled: bool


class CouncilAppSettingOut(BaseModel):
    setting_key: str
    setting_value: Any
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


