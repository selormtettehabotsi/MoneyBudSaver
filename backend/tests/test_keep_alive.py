"""
Tests for the Render Keep-Alive Automation Service.
"""
import asyncio
from unittest.mock import AsyncMock, patch
import pytest

from app.config import settings
from app.services.keep_alive import (
    get_keep_alive_target_url,
    ping_health_once,
    start_keep_alive_task,
)


def test_get_keep_alive_target_url_formats_cleanly(monkeypatch):
    monkeypatch.setattr(settings, "KEEP_ALIVE_URL", "https://moneycouncil.onrender.com/")
    monkeypatch.setattr(settings, "RENDER_EXTERNAL_URL", None)
    assert get_keep_alive_target_url() == "https://moneycouncil.onrender.com/health"

    # Already has /health
    monkeypatch.setattr(settings, "KEEP_ALIVE_URL", "https://moneycouncil.onrender.com/health")
    assert get_keep_alive_target_url() == "https://moneycouncil.onrender.com/health"

    # Empty
    monkeypatch.setattr(settings, "KEEP_ALIVE_URL", None)
    monkeypatch.setattr(settings, "RENDER_EXTERNAL_URL", None)
    monkeypatch.delenv("KEEP_ALIVE_URL", raising=False)
    monkeypatch.delenv("RENDER_EXTERNAL_URL", raising=False)
    monkeypatch.delenv("RENDER_EXTERNAL_HOSTNAME", raising=False)
    assert get_keep_alive_target_url() is None

    # Missing http:// or https:// protocol (e.g. moneycouncil.onrender.com)
    monkeypatch.setattr(settings, "KEEP_ALIVE_URL", "moneycouncil.onrender.com")
    assert get_keep_alive_target_url() == "https://moneycouncil.onrender.com/health"

    # Wildcard placeholder (e.g. *.onrender.com)
    monkeypatch.setattr(settings, "KEEP_ALIVE_URL", "*.onrender.com")
    assert get_keep_alive_target_url() == "https://moneycouncil-7zcr.onrender.com/health"

    # When KEEP_ALIVE_URL is a wildcard placeholder but RENDER_EXTERNAL_URL is valid
    monkeypatch.setattr(settings, "KEEP_ALIVE_URL", "*.onrender.com")
    monkeypatch.setattr(settings, "RENDER_EXTERNAL_URL", "https://moneycouncil-7zcr.onrender.com")
    assert get_keep_alive_target_url() == "https://moneycouncil-7zcr.onrender.com/health"


@pytest.mark.asyncio
async def test_ping_health_once_success():
    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value.status_code = 200
        success = await ping_health_once("https://example.onrender.com/health")
        assert success is True


@pytest.mark.asyncio
async def test_ping_health_once_handles_failure():
    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value.status_code = 503
        success = await ping_health_once("https://example.onrender.com/health")
        assert success is False

    with patch("httpx.AsyncClient.get", side_effect=Exception("Connection refused")):
        success = await ping_health_once("https://example.onrender.com/health")
        assert success is False


@pytest.mark.asyncio
async def test_start_keep_alive_task_disabled(monkeypatch):
    monkeypatch.setattr(settings, "KEEP_ALIVE_ENABLED", False)
    # Should exit immediately without error
    await start_keep_alive_task(initial_delay=0.01)


@pytest.mark.asyncio
async def test_start_keep_alive_task_no_url(monkeypatch):
    monkeypatch.setattr(settings, "KEEP_ALIVE_ENABLED", True)
    monkeypatch.setattr(settings, "KEEP_ALIVE_URL", None)
    monkeypatch.setattr(settings, "RENDER_EXTERNAL_URL", None)
    monkeypatch.delenv("KEEP_ALIVE_URL", raising=False)
    monkeypatch.delenv("RENDER_EXTERNAL_URL", raising=False)
    # Should exit immediately without error
    await start_keep_alive_task(initial_delay=0.01)


@pytest.mark.asyncio
async def test_start_keep_alive_task_runs_and_cancels(monkeypatch):
    monkeypatch.setattr(settings, "KEEP_ALIVE_ENABLED", True)
    monkeypatch.setattr(settings, "KEEP_ALIVE_URL", "https://test.onrender.com")
    monkeypatch.setattr(settings, "KEEP_ALIVE_INTERVAL_SECONDS", 1)

    ping_mock = AsyncMock(return_value=True)
    with patch("app.services.keep_alive.ping_health_once", ping_mock):
        task = asyncio.create_task(start_keep_alive_task(initial_delay=0.0))
        for _ in range(50):
            if ping_mock.await_count >= 1:
                break
            await asyncio.sleep(0.02)
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        assert ping_mock.await_count >= 1
