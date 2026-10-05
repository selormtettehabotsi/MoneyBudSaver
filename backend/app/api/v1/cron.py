"""
Protected Cron Endpoints for Scheduled Tasks (e.g. Automated Weekly Financial Review).
Triggered weekly by cron services like cron-job.org via POST with X-Cron-Secret header.
"""
from datetime import datetime, timezone
import secrets
from fastapi import APIRouter, Depends, HTTPException, Header, Query, status
from sqlalchemy.orm import Session

from app.config import settings
from app.core.dependencies import get_db
from app.models.user import User
from app.services.suggestions import record_weekly_review

router = APIRouter(prefix="/cron", tags=["Scheduled Tasks"])


def verify_cron_secret(
    x_cron_secret: str = Header(None, alias="X-Cron-Secret"),
    secret: str = Query(None)
):
    """Verifies that request comes from authorized cron scheduler using constant-time comparison."""
    provided = x_cron_secret or secret
    if not provided or not settings.CRON_SECRET or not secrets.compare_digest(provided, settings.CRON_SECRET):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Invalid cron secret header (X-Cron-Secret)."
        )
    return True


@router.post("/weekly-review", dependencies=[Depends(verify_cron_secret)])
async def trigger_weekly_review(db: Session = Depends(get_db)):
    """
    Weekly review endpoint invoked by external scheduler (e.g. cron-job.org).
    Executes automated financial health audit for all active users.
    """
    active_users = db.query(User).filter(User.is_active == True).all()
    processed_count = 0
    for u in active_users:
        try:
            record_weekly_review(db, u)
            processed_count += 1
        except Exception:
            pass

    return {
        "status": "success",
        "message": f"Weekly review processed for {processed_count} active user(s).",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
