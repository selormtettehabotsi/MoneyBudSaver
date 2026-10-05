"""
Unit and integration tests for Auth, Security, Keep-Alive, and Rate Limiting.
"""
import pytest
from app.config import settings
from app.models.category import Category
from tests.conftest import TestingSessionLocal


def test_health_check(client):
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "MoneyCouncil" in data["app"]


def test_security_headers_present(client):
    response = client.get("/health")
    assert "Content-Security-Policy" in response.headers
    assert "frame-ancestors 'none'" in response.headers["Content-Security-Policy"]
    assert response.headers["X-Frame-Options"] == "DENY"
    assert response.headers["X-Content-Type-Options"] == "nosniff"


def test_first_user_registration_and_login(client):
    # 1. Register initial user (allowed without invite code)
    reg_response = client.post(
        "/api/v1/auth/register",
        json={"email": "owner@example.com", "password": "SecurePassword123!", "currency": "GHS"},
    )
    assert reg_response.status_code == 201
    user_data = reg_response.json()
    assert user_data["email"] == "owner@example.com"
    assert user_data["currency"] == "GHS"
    assert "mc_session" in reg_response.cookies
    assert "mc_csrf" in reg_response.cookies
    user_id = user_data["id"]

    # Verify that default categories were automatically seeded for this user
    db = TestingSessionLocal()
    categories = db.query(Category).filter(Category.user_id == user_id).all()
    assert len(categories) > 0
    income_cats = [c for c in categories if c.type == "income"]
    expense_cats = [c for c in categories if c.type == "expense"]
    assert len(income_cats) >= 4
    assert len(expense_cats) >= 8
    db.close()

    # 2. Subsequent registration without valid invite code must fail with 403
    second_reg = client.post(
        "/api/v1/auth/register",
        json={"email": "second@example.com", "password": "AnotherPassword123!"},
    )
    assert second_reg.status_code == 403

    # Subsequent registration WITH valid invite code succeeds with 201
    valid_second = client.post(
        "/api/v1/auth/register",
        json={"email": "second@example.com", "password": "AnotherPassword123!", "invite_code": "test_invite_123"},
    )
    assert valid_second.status_code == 201

    # 3. Test Login with wrong password
    bad_login = client.post(
        "/api/v1/auth/login",
        json={"email": "owner@example.com", "password": "WrongPassword!"},
    )
    assert bad_login.status_code == 401

    # 4. Test Login with correct credentials
    login_res = client.post(
        "/api/v1/auth/login",
        json={"email": "owner@example.com", "password": "SecurePassword123!"},
    )
    assert login_res.status_code == 200
    assert "mc_session" in login_res.cookies
    csrf_token = login_res.cookies.get("mc_csrf")
    assert csrf_token is not None

    # 5. Get Current User profile
    client.cookies.set("mc_session", login_res.cookies.get("mc_session"))
    client.cookies.set("mc_csrf", csrf_token)

    me_res = client.get("/api/v1/auth/me")
    assert me_res.status_code == 200
    assert me_res.json()["email"] == "owner@example.com"

    # 6. Mutation request with CSRF token succeeds
    settings_res = client.put(
        "/api/v1/auth/settings",
        json={"currency": "USD", "settings": {"max_dti_ratio": 35.0}},
        headers={"X-CSRF-Token": csrf_token},
    )
    assert settings_res.status_code == 200
    assert settings_res.json()["currency"] == "USD"
    assert settings_res.json()["settings"]["max_dti_ratio"] == 35.0

    # 7. Mutation request WITHOUT CSRF token fails with 403
    fail_settings = client.put(
        "/api/v1/auth/settings",
        json={"currency": "EUR"},
    )
    assert fail_settings.status_code == 403

    # 8. Password > 72 bytes rejected
    long_pwd = "A" * 75
    long_reg = client.post(
        "/api/v1/auth/login",
        json={"email": "owner@example.com", "password": long_pwd},
    )
    assert long_reg.status_code == 422  # Unprocessable Entity validation error


def test_internal_cron_security(client):
    # Call without secret fails
    res_no_secret = client.post("/internal/weekly-review")
    assert res_no_secret.status_code == 403

    # Call with correct secret succeeds
    res_with_secret = client.post(
        "/internal/weekly-review",
        headers={"X-Internal-Secret": settings.INTERNAL_CRON_SECRET},
    )
    assert res_with_secret.status_code == 200
    assert res_with_secret.json()["status"] == "success"
