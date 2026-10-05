"""
Lightweight health endpoint for keep-alive ping monitors (UptimeRobot, cron-job.org)
and container health checks (Fly.io, Render).
Performs NO database queries to guarantee instantaneous response and zero DB load.
"""
import sys
from datetime import datetime, timezone
from fastapi import APIRouter, Request, Response
from app.config import settings
from app.core.limiter import limiter, get_client_ip

router = APIRouter(tags=["Health"])


@router.api_route("/health", methods=["GET", "HEAD"])
@limiter.exempt
async def health_check(request: Request, response: Response):
    """
    Responds to GET and HEAD with instant status.
    Exempt from rate limiting and CSRF.
    Logs method, timestamp, and user-agent to stdout for proof in host logs.
    """
    timestamp = datetime.now(timezone.utc).isoformat()
    client_ip = get_client_ip(request)
    ua = request.headers.get("user-agent", "unknown")
    
    # Safe logging to stdout (no personal data or secrets)
    sys.stdout.write(f"[{timestamp}] HEALTH_CHECK method={request.method} ip={client_ip} ua={ua}\n")
    sys.stdout.flush()

    if request.method == "HEAD":
        return Response(status_code=200)

    return {
        "status": "ok",
        "app": settings.APP_NAME,
        "mode": settings.DEPLOYMENT_MODE,
        "version": "1.0.0"
    }
