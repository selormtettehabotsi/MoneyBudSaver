"""
AI Council API Endpoints for deliberation requests, provider status, history, and user final say.
"""
from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.config import settings
from app.core.limiter import limiter
from app.core.dependencies import get_db, get_current_user, verify_csrf
from app.models.user import User
from app.models.council import CouncilDecision
from app.schemas.council import (
    AskCouncilRequest,
    CouncilDecisionOut,
    UserDecisionSubmit,
    ProviderStatusItem,
)
from app.services.council.engine import execute_council_deliberation
from app.services.council.adapters_factory import get_configured_providers
from app.services.financial_math import calculate_user_financial_snapshot
from app.services.privacy import scrub_pii_from_text, build_anonymized_council_context

router = APIRouter(prefix="/council", tags=["AI Council"])


@router.get("/providers", response_model=List[ProviderStatusItem])
async def list_council_providers(current_user: User = Depends(get_current_user)):
    """Returns the configuration status and model family details for all AI Council providers."""
    is_hosted = settings.is_hosted
    user_settings = current_user.settings or {}
    custom_models = user_settings.get("custom_model_ids", {})

    providers_info = [
        {
            "name": "gemini",
            "display_name": "Google Gemini",
            "model_family": "Google Gemini Family",
            "model_id": custom_models.get("gemini", settings.GEMINI_MODEL_ID),
            "is_configured": bool(settings.GEMINI_API_KEY),
            "is_local": False,
            "daily_request_count": 0,
            "status": "ready" if settings.GEMINI_API_KEY else "missing_key",
        },
        {
            "name": "groq",
            "display_name": "Groq GPT-OSS",
            "model_family": "OpenAI / GPT-OSS Family",
            "model_id": custom_models.get("groq", settings.GROQ_MODEL_ID),
            "is_configured": bool(settings.GROQ_API_KEY),
            "is_local": False,
            "daily_request_count": 0,
            "status": "ready" if settings.GROQ_API_KEY else "missing_key",
        },
        {
            "name": "cerebras",
            "display_name": "Cerebras Llama (Paid/Trial)",
            "model_family": "Meta Llama Family",
            "model_id": custom_models.get("cerebras", settings.CEREBRAS_MODEL_ID),
            "is_configured": bool(settings.CEREBRAS_API_KEY),
            "is_local": False,
            "daily_request_count": 0,
            "status": "ready" if settings.CEREBRAS_API_KEY else "missing_key",
        },
        {
            "name": "mistral",
            "display_name": "Mistral AI",
            "model_family": "Mistral Family",
            "model_id": custom_models.get("mistral", settings.MISTRAL_MODEL_ID),
            "is_configured": bool(settings.MISTRAL_API_KEY),
            "is_local": False,
            "daily_request_count": 0,
            "status": "ready" if settings.MISTRAL_API_KEY else "missing_key",
        },
        {
            "name": "openrouter",
            "display_name": "OpenRouter Qwen",
            "model_family": "Qwen Family",
            "model_id": custom_models.get("openrouter", settings.OPENROUTER_MODEL_ID),
            "is_configured": bool(settings.OPENROUTER_API_KEY),
            "is_local": False,
            "daily_request_count": 0,
            "status": "ready" if settings.OPENROUTER_API_KEY else "missing_key",
        },
        {
            "name": "ollama",
            "display_name": "Ollama (Local Offline)",
            "model_family": "Self-Hosted Private",
            "model_id": custom_models.get("ollama", settings.OLLAMA_MODEL_ID),
            "is_configured": not is_hosted,
            "is_local": True,
            "daily_request_count": 0,
            "status": "disabled_in_hosted" if is_hosted else "ready",
        },
    ]

    return [ProviderStatusItem(**p) for p in providers_info]


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


@router.post("/ask", response_model=CouncilDecisionOut, dependencies=[Depends(verify_csrf)])
async def ask_council(
    request: AskCouncilRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Submits a financial question for multi-AI Council deliberation.
    Runs deterministic pre-calculation, server-side PII scrubbing, Round 1 (and optional Round 2 debate),
    confidence-weighted tallying, and dissent synthesis.
    """
    decision = await execute_council_deliberation(db=db, user=current_user, request=request)
    return decision


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
