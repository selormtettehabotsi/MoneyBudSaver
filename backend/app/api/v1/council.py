"""
AI Council API Endpoints for deliberation requests, background job polling,
provider connection testing, provider status, history, and user final say.
"""
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status, BackgroundTasks, Request
from sqlalchemy.orm import Session

from app.config import settings
from app.core.limiter import limiter
from app.core.dependencies import get_db, get_current_user, verify_csrf
from app.models.user import User
from app.models.council import CouncilDecision
from app.schemas.council import (
    AskCouncilRequest,
    CouncilDecisionOut,
    CouncilJobStatus,
    TestConnectionRequest,
    TestConnectionResponse,
    UserDecisionSubmit,
    ProviderStatusItem,
)
from app.services.council.engine import (
    create_deliberation_job,
    create_retry_job,
    cancel_deliberation_job,
    get_deliberation_job_status,
    execute_council_deliberation,
    retry_failed_providers_for_decision,
)
from app.services.council.health_manager import (
    is_circuit_breaker_active,
    reset_circuit_breaker,
)
from app.services.council.connection_tester import verify_provider_connectivity
from app.services.financial_math import calculate_user_financial_snapshot
from app.services.privacy import scrub_pii_from_text, build_anonymized_council_context

router = APIRouter(prefix="/council", tags=["AI Council"])


@router.get("/providers", response_model=List[ProviderStatusItem])
async def list_council_providers(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Returns the configuration status and model family details for all AI Council providers."""
    from datetime import date
    from app.models.council import ProviderQuota
    
    is_hosted = settings.is_hosted
    user_settings = current_user.settings or {}
    custom_models = user_settings.get("custom_model_ids", {})

    # Fetch today's quotas from DB
    today = date.today()
    quotas_db = db.query(ProviderQuota).filter(ProviderQuota.date == today).all()
    quota_map = {q.provider_name: q.request_count for q in quotas_db}

    # Provider definitions with daily limits
    defs = [
        {
            "name": "gemini",
            "display_name": "Google Gemini",
            "model_family": "Google Gemini Family",
            "model_id": custom_models.get("gemini", settings.GEMINI_MODEL_ID),
            "has_key": bool(settings.GEMINI_API_KEY),
            "is_local": False,
            "daily_quota_limit": 1500,
            "shares_key_with": None,
        },
        {
            "name": "groq",
            "display_name": "Groq GPT-OSS",
            "model_family": "OpenAI / GPT-OSS Family",
            "model_id": custom_models.get("groq", settings.GROQ_MODEL_ID),
            "has_key": bool(settings.GROQ_API_KEY),
            "is_local": False,
            "daily_quota_limit": 14400,
            "shares_key_with": None,
        },
        {
            "name": "mistral",
            "display_name": "Mistral AI",
            "model_family": "Mistral Family",
            "model_id": custom_models.get("mistral", settings.MISTRAL_MODEL_ID),
            "has_key": bool(settings.MISTRAL_API_KEY),
            "is_local": False,
            "daily_quota_limit": 1000,
            "shares_key_with": None,
        },
        {
            "name": "openrouter",
            "display_name": "OpenRouter Qwen",
            "model_family": "Qwen Family",
            "model_id": custom_models.get("openrouter", settings.OPENROUTER_MODEL_ID),
            "has_key": bool(settings.OPENROUTER_API_KEY),
            "is_local": False,
            "daily_quota_limit": 200,
            "shares_key_with": None,
        },
        {
            "name": "nvidia",
            "display_name": "NVIDIA NIM (GLM)",
            "model_family": "Zhipu GLM",
            "model_id": custom_models.get("nvidia", settings.NVIDIA_MODEL_ID),
            "has_key": bool(settings.NVIDIA_API_KEY),
            "is_local": False,
            "daily_quota_limit": 1000,
            "shares_key_with": "NVIDIA NIM Key",
        },
        {
            "name": "nvidia_kimi",
            "display_name": "NVIDIA NIM (Kimi)",
            "model_family": "Moonshot Kimi",
            "model_id": custom_models.get("nvidia_kimi", settings.NVIDIA_KIMI_MODEL_ID or ""),
            "has_key": bool(settings.NVIDIA_API_KEY),
            "is_local": False,
            "daily_quota_limit": 1000,
            "shares_key_with": "NVIDIA NIM Key",
        },
        {
            "name": "cerebras",
            "display_name": "Cerebras Llama (Paid/Trial)",
            "model_family": "Meta Llama Family",
            "model_id": custom_models.get("cerebras", settings.CEREBRAS_MODEL_ID),
            "has_key": bool(settings.CEREBRAS_API_KEY),
            "is_local": False,
            "daily_quota_limit": 1000,
            "shares_key_with": None,
        },
        {
            "name": "ollama",
            "display_name": "Ollama (Local Offline)",
            "model_family": "Self-Hosted Private",
            "model_id": custom_models.get("ollama", settings.OLLAMA_MODEL_ID),
            "has_key": True,
            "is_local": True,
            "daily_quota_limit": None,
            "shares_key_with": None,
        },
    ]

    providers_info = []
    for d in defs:
        req_count = quota_map.get(d["name"], 0)
        has_key = d["has_key"]
        has_model = bool(d["model_id"] and d["model_id"].strip())
        is_local = d["is_local"]

        if is_local and is_hosted:
            status_val = "disabled_in_hosted"
            is_configured = False
        elif not has_key:
            status_val = "missing_key"
            is_configured = False
        elif not has_model:
            status_val = "missing_model_id"
            is_configured = False
        else:
            status_val = "ready"
            is_configured = True

        limit = d["daily_quota_limit"]
        is_near_limit = bool(limit and req_count >= (limit * 0.8))

        cb_tripped, cb_reason, cb_secs = is_circuit_breaker_active(db, d["name"])
        if cb_tripped:
            status_val = "circuit_breaker_tripped"

        providers_info.append(
            ProviderStatusItem(
                name=d["name"],
                display_name=d["display_name"],
                model_family=d["model_family"],
                model_id=d["model_id"],
                is_configured=is_configured,
                is_local=is_local,
                daily_request_count=req_count,
                daily_quota_limit=limit,
                is_near_limit=is_near_limit,
                shares_key_with=d["shares_key_with"],
                status=status_val,
                circuit_breaker_tripped=cb_tripped,
                circuit_breaker_reason=cb_reason,
                circuit_breaker_resets_in_seconds=cb_secs,
            )
        )

    return providers_info


@router.post("/test-connection", response_model=TestConnectionResponse, dependencies=[Depends(verify_csrf)])
@limiter.limit("20/minute")
async def test_council_provider_connection(
    request: Request,
    payload: TestConnectionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Tests a configured AI Council provider connection:
    - Sends a tiny fixed prompt without financial data
    - Measures roundtrip latency in ms
    - Verifies HTTP status and diagnoses errors (invalid key, model not found, rate limited, timeout, bad JSON)
    - Queries the provider's /models catalog and verifies if model_id is found, offering close matches if not.
    - Rate limited to 20 tests/minute.
    - Requires Authentication & CSRF. Never returns or logs API keys.
    """
    res = await verify_provider_connectivity(
        provider_name=payload.provider_name,
        model_id=payload.model_id,
        user_settings=current_user.settings or {},
        db=db,
    )
    return res


@router.post("/preview")
async def preview_council_prompt(
    request: AskCouncilRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Generates and returns the exact server-scrubbed prompt that will be sent to the AIs.
    Demonstrates zero PII leakage and pre-computed deterministic financial ratios.
    """
    user_settings = current_user.settings or {}
    max_dti = float(user_settings.get("max_dti_ratio", settings.DEFAULT_MAX_DTI_RATIO))
    min_runway = float(user_settings.get("min_runway_months", settings.DEFAULT_MIN_RUNWAY_MONTHS))

    snapshot = calculate_user_financial_snapshot(
        db=db,
        user_id=current_user.id,
        candidate_amount=request.candidate_amount,
        decision_type=request.decision_type,
        max_dti_threshold=max_dti,
        min_runway_threshold=min_runway,
    )

    sanitized_question = scrub_pii_from_text(request.question)
    anonymized_context = build_anonymized_council_context(snapshot, current_user.currency)

    prompt = (
        f"{anonymized_context}\n\n"
        f"USER DECISION / INQUIRY:\n\"{sanitized_question}\"\n"
        f"DECISION TYPE: {request.decision_type.upper()}\n"
    )
    if request.candidate_amount:
        prompt += f"PROPOSED AMOUNT: {current_user.currency} {float(request.candidate_amount):,.2f}\n\n"
    prompt += "Please independently evaluate this decision and return your strict JSON vote."

    return {
        "sanitized_question": sanitized_question,
        "anonymized_prompt": prompt,
        "financial_snapshot": snapshot,
    }


@router.post("/ask", response_model=CouncilJobStatus, dependencies=[Depends(verify_csrf)])
@limiter.limit("5/minute")
async def ask_council(
    request: Request,
    payload: AskCouncilRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Submits a financial question for multi-AI Council deliberation as a background job.
    Returns immediately with a job ID and initial status for frontend polling and persistence.
    """
    job = create_deliberation_job(db=db, user=current_user, request=payload, background_tasks=background_tasks)
    return job


@router.get("/jobs/{job_id}", response_model=CouncilJobStatus)
async def get_council_job(
    job_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Retrieves the real-time progress or completed decision of a Council deliberation job.
    Supports persistent retrieval if mobile device slept or browser tab was closed.
    """
    status_info = get_deliberation_job_status(db=db, user_id=current_user.id, job_id=job_id)
    if not status_info:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Council deliberation job not found.")
    return status_info


@router.get("/history", response_model=List[CouncilDecisionOut])
async def list_council_history(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieves previous council deliberations and recorded decisions for current user."""
    decisions = (
        db.query(CouncilDecision)
        .filter(CouncilDecision.user_id == current_user.id)
        .order_by(CouncilDecision.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return decisions


@router.get("/decision/{decision_id}", response_model=CouncilDecisionOut)
async def get_council_decision(
    decision_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get single council deliberation details with user isolation."""
    decision = (
        db.query(CouncilDecision)
        .filter(CouncilDecision.id == decision_id, CouncilDecision.user_id == current_user.id)
        .first()
    )
    if not decision:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Council decision not found.")
    return decision


@router.post("/decide/{decision_id}", response_model=CouncilDecisionOut, dependencies=[Depends(verify_csrf)])
async def record_user_decision(
    decision_id: str,
    payload: UserDecisionSubmit,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Record the user's final say: Accept, Reject, or Modify the Council's verdict.
    """
    decision = (
        db.query(CouncilDecision)
        .filter(CouncilDecision.id == decision_id, CouncilDecision.user_id == current_user.id)
        .first()
    )
    if not decision:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Council decision not found.")

    decision.user_verdict = payload.user_verdict
    decision.user_modifications = payload.user_modifications
    decision.decided_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(decision)
    return decision


@router.post("/decision/{decision_id}/retry-failed", response_model=CouncilJobStatus, dependencies=[Depends(verify_csrf)])
@limiter.limit("5/minute")
async def retry_failed_council_providers(
    request: Request,
    decision_id: str,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Re-queries only the failed, timed-out, or unavailable AI providers for an existing deliberation
    as an asynchronous background job.
    Enforces 1 active job per user, ownership check (404), rate limit, records quota usage,
    and returns CouncilJobStatus for client polling.
    """
    job_status = create_retry_job(
        db=db,
        user=current_user,
        decision_id=decision_id,
        background_tasks=background_tasks,
    )
    return job_status


@router.post("/jobs/{job_id}/cancel", response_model=CouncilJobStatus, dependencies=[Depends(verify_csrf)])
async def cancel_council_deliberation_job(
    job_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Cancels an active or pending council deliberation job and frees the user's active job slot.
    Requires authentication, CSRF, and user ownership check.
    """
    return cancel_deliberation_job(db=db, user_id=current_user.id, job_id=job_id)


@router.post("/providers/{provider_name}/reset-circuit-breaker", dependencies=[Depends(verify_csrf)])
async def reset_provider_circuit_breaker(
    provider_name: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Manually resets a tripped circuit breaker for a provider ('Retry now' action).
    Requires authentication and CSRF.
    """
    reset_circuit_breaker(db, provider_name)
    return {
        "status": "ok",
        "provider_name": provider_name,
        "message": f"Circuit breaker for provider '{provider_name}' has been reset.",
    }

