"""
Render Keep-Alive Automation Service.

Keeps the MoneyCouncil web service awake on Render's free tier by periodically
sending an HTTP GET request to its public URL (/health) via Render's external proxy router.
This resets Render's 15-minute idle countdown before the service can sleep.
"""
import asyncio
import logging
import os
from typing import Optional
import httpx

from app.config import settings

logger = logging.getLogger("app.keep_alive")


def get_keep_alive_target_url() -> Optional[str]:
    """
    Resolves the external URL for keep-alive pings.
    Prioritizes explicit KEEP_ALIVE_URL, then Render's automatic RENDER_EXTERNAL_URL.
    """
    raw_url = (
        settings.KEEP_ALIVE_URL
        or settings.RENDER_EXTERNAL_URL
        or os.getenv("KEEP_ALIVE_URL")
        or os.getenv("RENDER_EXTERNAL_URL")
    )
    if not raw_url:
        return None

    cleaned = raw_url.strip().rstrip("/")
    if not cleaned:
        return None

    if not cleaned.endswith("/health"):
        cleaned = f"{cleaned}/health"

    return cleaned


async def ping_health_once(url: str, timeout: float = 30.0) -> bool:
    """
    Executes a single HTTP GET request to the target health URL.
    Returns True if response status code is 200, False otherwise.
    """
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            resp = await client.get(
                url,
                headers={"User-Agent": "MoneyCouncil-KeepAlive/1.0"}
            )
            if resp.status_code == 200:
                logger.info(f"Keep-alive ping succeeded: status=200 target={url}")
                return True
            else:
                logger.warning(f"Keep-alive ping received unexpected status={resp.status_code} target={url}")
                return False
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        logger.warning(f"Keep-alive ping failed target={url} error={exc}")
        return False


async def start_keep_alive_task(initial_delay: float = 30.0):
    """
    Background worker loop that runs for the lifetime of the application.
    Fires a keep-alive ping every settings.KEEP_ALIVE_INTERVAL_SECONDS (default 600s / 10m).
    """
    if not settings.KEEP_ALIVE_ENABLED:
        logger.info("Render keep-alive service disabled (KEEP_ALIVE_ENABLED=false).")
        return

    target_url = get_keep_alive_target_url()
    if not target_url:
        logger.info(
            "Render keep-alive service idle: no RENDER_EXTERNAL_URL or KEEP_ALIVE_URL configured. "
            "(Active automatically when deployed on Render or when KEEP_ALIVE_URL is set)."
        )
        return

    interval = max(60, settings.KEEP_ALIVE_INTERVAL_SECONDS)
    logger.info(
        f"Starting Render keep-alive auto-pinger: target={target_url}, interval={interval}s, initial_delay={initial_delay}s"
    )

    # Initial delay allowing server and network to become completely ready
    try:
        await asyncio.sleep(initial_delay)
    except asyncio.CancelledError:
        logger.info("Keep-alive task cancelled during initial delay.")
        return

    while True:
        try:
            await ping_health_once(target_url)
        except asyncio.CancelledError:
            logger.info("Keep-alive task cancelled.")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error in keep-alive loop: {exc}")

        try:
            await asyncio.sleep(interval)
        except asyncio.CancelledError:
            logger.info("Keep-alive task cancelled during interval sleep.")
            raise
