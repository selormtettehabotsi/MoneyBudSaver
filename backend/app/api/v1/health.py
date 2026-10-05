"""
Lightweight health endpoint for UptimeRobot, cron-job.org, and cold-start wakeups.
Performs no database queries to ensure instantaneous response.
"""
from fastapi import APIRouter
from app.config import settings

router = APIRouter(tags=["Health"])


@router.get("/health")
async def health_check():
    """Returns instant ok status for keep-alive ping monitors."""
    return {
        "status": "ok",
        "app": settings.APP_NAME,
        "mode": settings.DEPLOYMENT_MODE,
        "version": "1.0.0"
    }
