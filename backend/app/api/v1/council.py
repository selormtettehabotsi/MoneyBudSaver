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
            "display_name": "Groq Llama",
            "model_family": "Meta Llama Family",
            "model_id": custom_models.get("groq", settings.GROQ_MODEL_ID),
            "is_configured": bool(settings.GROQ_API_KEY),
            "is_local": False,
            "daily_request_count": 0,
            "status": "ready" if settings.GROQ_API_KEY else "missing_key",
        },
        {
            "name": "cerebras",
            "display_name": "Cerebras Llama",
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
            "display_name": "OpenRouter DeepSeek/Qwen",
            "model_family": "DeepSeek / Qwen Family",
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


@router.post("/ask", response_model=CouncilDecisionOut, dependencies=[Depends(verify_csrf)])
async def ask_council(
    request: AskCouncilRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Submits a financial question for multi-AI Council deliberation.
    Runs deterministic pre-calculation, anonymization, Round 1 (and optional Round 2 debate),
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
