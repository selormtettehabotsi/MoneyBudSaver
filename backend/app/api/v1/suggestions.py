"""
API Endpoints for Smart Financial Suggestions and Weekly Reviews.
"""
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_db, get_current_user, verify_csrf
from app.models.user import User
from app.models.suggestion import SuggestionLog
from app.schemas.suggestion import WeeklyReviewResult, SuggestionLogOut
from app.services.suggestions import generate_audit_suggestions, record_weekly_review

router = APIRouter(prefix="/suggestions", tags=["Smart Suggestions & Weekly Reviews"])


@router.get("/weekly", response_model=WeeklyReviewResult)
async def get_latest_weekly_review(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Returns the deterministic financial audit and suggestions for the current week.
    Generates dynamic audit results based on current financial state.
    """
    return generate_audit_suggestions(db, current_user)


@router.post("/generate", response_model=WeeklyReviewResult, dependencies=[Depends(verify_csrf)])
async def trigger_manual_review_generation(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Forces an immediate re-audit of the user's finances and saves/updates the SuggestionLog record.
    """
    log = record_weekly_review(db, current_user)
    findings = log.findings or {}
    return WeeklyReviewResult(
        week_start_date=log.week_start_date,
        generated_at=log.created_at,
        health_score=findings.get("health_score", 50),
        suggestions=findings.get("suggestions", []),
        metrics_summary=findings.get("metrics_summary", {}),
    )


@router.get("/history", response_model=List[SuggestionLogOut])
async def get_suggestion_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Returns past weekly suggestion logs for the authenticated user, ordered newest first.
    """
    logs = (
        db.query(SuggestionLog)
        .filter(SuggestionLog.user_id == current_user.id)
        .order_by(SuggestionLog.week_start_date.desc())
        .limit(12)
        .all()
    )
    return logs
