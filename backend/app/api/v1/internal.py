"""
Internal Protected Endpoints for Scheduled Keep-Alive and Periodic Tasks.
Can be triggered by UptimeRobot or cron-job.org weekly webhook.
"""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Header, Query, status
from sqlalchemy.orm import Session

from app.config import settings
from app.core.dependencies import get_db
from app.models.user import User
from app.services.suggestions import record_weekly_review

router = APIRouter(prefix="/internal", tags=["Internal Tasks"])


def verify_cron_secret(
    x_internal_secret: str = Header(None, alias="X-Internal-Secret"),
    secret: str = Query(None)
):
    """Verifies that request comes from authorized monitor or keep-alive cron."""
    provided = x_internal_secret or secret
    if not provided or provided != settings.INTERNAL_CRON_SECRET:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Invalid internal task secret."
        )
    return True


@router.post("/weekly-review", dependencies=[Depends(verify_cron_secret)])
async def trigger_internal_weekly_review(db: Session = Depends(get_db)):
    """
    Periodic endpoint invoked weekly by external monitor (UptimeRobot/cron-job.org).
    Executes automated audit for all active users without requiring host-level crons.
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
