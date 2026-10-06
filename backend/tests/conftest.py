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


@pytest.fixture(autouse=True)
def init_test_db():
    """Create all tables before each test and drop after."""
    Base.metadata.create_all(bind=test_engine)
    yield
    Base.metadata.drop_all(bind=test_engine)


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
