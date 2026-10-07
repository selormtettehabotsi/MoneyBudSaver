"""
Shared Pytest Fixtures and Test Isolation Setup.
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from main import app
from app.db.session import Base
from app.core.dependencies import get_db
from app.config import settings

# Set test invite code so secondary test users can register freely
settings.INVITE_CODE = "test_invite_123"

# Static in-memory engine shared across threads for test session
TEST_DATABASE_URL = "sqlite:///:memory:"

test_engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db

# Ensure background tasks in council engine use the test database
from app.services.council import engine as council_engine
council_engine.SessionLocal = TestingSessionLocal


class FakeClock:
    """
    Virtual Clock fixture that records all requested sleep delays and returns instantly,
    while advancing virtual time.
    """
    def __init__(self, initial_time: float = 1000.0):
        self._current_time: float = initial_time
        self.delays: list[float] = []
        self.async_delays: list[float] = []
        self.time_delays: list[float] = []

    def now(self) -> float:
        return self._current_time

    def time(self) -> float:
        return self._current_time

    def monotonic(self) -> float:
        return self._current_time

    def advance(self, seconds: float) -> None:
        self._current_time += float(seconds)

    def clear(self) -> None:
        self.delays.clear()
        self.async_delays.clear()
        self.time_delays.clear()

    async def async_sleep(self, delay=0, *args, **kwargs):
        d = float(delay) if delay is not None else 0.0
        self.delays.append(d)
        self.async_delays.append(d)
        self._current_time += d
        import asyncio as _asyncio
        # Yield to event loop for concurrency without wall clock delay
        await _orig_async_sleep(0)

    def time_sleep(self, delay=0, *args, **kwargs):
        d = float(delay) if delay is not None else 0.0
        self.delays.append(d)
        self.time_delays.append(d)
        self._current_time += d
        return None


import asyncio as _asyncio
import time as _time
_orig_async_sleep = _asyncio.sleep
_orig_time_sleep = _time.sleep

_global_fake_clock = FakeClock()


@pytest.fixture
def fake_clock():
    """Provides access to the virtual fake clock and its recorded delays."""
    _global_fake_clock.clear()
    return _global_fake_clock


@pytest.fixture(autouse=True)
def mock_all_sleeps_and_pacing(monkeypatch):
    """Mocks all sleeps and time functions with FakeClock for instant execution."""
    _global_fake_clock.clear()

    monkeypatch.setattr(_asyncio, "sleep", _global_fake_clock.async_sleep)
    monkeypatch.setattr(_time, "sleep", _global_fake_clock.time_sleep)
    monkeypatch.setattr(_asyncio.BaseEventLoop, "time", lambda self: _global_fake_clock.now())
    monkeypatch.setattr("app.services.council.base_adapter.asyncio.sleep", _global_fake_clock.async_sleep)
    monkeypatch.setattr("app.services.council.gemini_adapter.asyncio.sleep", _global_fake_clock.async_sleep)
    monkeypatch.setattr("app.services.council.connection_tester.asyncio.sleep", _global_fake_clock.async_sleep)
    monkeypatch.setattr("app.services.council.engine.asyncio.sleep", _global_fake_clock.async_sleep)

    # Test-only bcrypt optimization (rounds=4)
    import bcrypt as _bcrypt
    _orig_gensalt = _bcrypt.gensalt

    def _fast_gensalt(rounds=4, prefix=b"2b"):
        return _orig_gensalt(rounds=4, prefix=prefix)

    monkeypatch.setattr(_bcrypt, "gensalt", _fast_gensalt)
    monkeypatch.setattr("app.core.security.bcrypt.gensalt", _fast_gensalt)


@pytest.fixture(scope="session", autouse=True)
def create_test_schema():
    """Create all database tables once for the test session."""
    Base.metadata.create_all(bind=test_engine)
    yield
    Base.metadata.drop_all(bind=test_engine)


@pytest.fixture(autouse=True)
def clean_test_db():
    """Clear all data between tests while keeping schema intact."""
    yield
    with test_engine.connect() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(table.delete())
        conn.commit()


@pytest.fixture
def client():
    """Unauthenticated test client."""
    return TestClient(app)


@pytest.fixture
def db_session():
    """Direct database session fixture for test setup."""
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def make_auth_client():
    """Factory fixture to create an authenticated TestClient for a given email."""
    def _create(
        email: str = "user@example.com",
        password: str = "SecurePass123!",
        currency: str = "GHS",
        invite_code: str = "test_invite_123",
    ):
        client = TestClient(app)
        reg = client.post(
            "/api/v1/auth/register",
            json={"email": email, "password": password, "currency": currency, "invite_code": invite_code},
        )
        if reg.status_code == 201:
            csrf = reg.cookies.get("mc_csrf")
            session = reg.cookies.get("mc_session")
            client.cookies.set("mc_session", session)
            client.cookies.set("mc_csrf", csrf)
            if csrf:
                client.headers.update({"X-CSRF-Token": csrf})
            return client, reg.json()
        
        # If already registered, login
        login = client.post("/api/v1/auth/login", json={"email": email, "password": password})
        assert login.status_code == 200, f"Login failed: {login.text}"
        csrf = login.cookies.get("mc_csrf")
        session = login.cookies.get("mc_session")
        client.cookies.set("mc_session", session)
        client.cookies.set("mc_csrf", csrf)
        if csrf:
            client.headers.update({"X-CSRF-Token": csrf})
        return client, login.json()

    return _create
