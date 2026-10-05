"""
Unit and integration tests for Auth, Security, Keep-Alive, and Rate Limiting.
"""
import pytest
from app.config import Settings, settings
from app.models.category import Category
from tests.conftest import TestingSessionLocal


def test_health_check_get_and_head(client, capsys):
    # Test GET
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "MoneyCouncil" in data["app"]

    # Test HEAD
    head_response = client.head("/health")
    assert head_response.status_code == 200


def test_security_headers_present(client):
    response = client.get("/health")
    csp = response.headers["Content-Security-Policy"]
    assert "frame-ancestors 'none'" in csp
    assert "worker-src 'self'" in csp
    assert "manifest-src 'self'" in csp
    assert response.headers["X-Frame-Options"] == "DENY"
    assert response.headers["X-Content-Type-Options"] == "nosniff"

    # API endpoints must enforce no-store
    api_response = client.get("/api/v1/auth/me")
    assert "no-store" in api_response.headers.get("Cache-Control", "")


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

    # Subsequent registration with empty string invite code must fail with 403
    empty_code_reg = client.post(
        "/api/v1/auth/register",
        json={"email": "third@example.com", "password": "AnotherPassword123!", "invite_code": ""},
    )
    assert empty_code_reg.status_code == 403

    # Subsequent registration with whitespace invite code must fail with 403
    whitespace_reg = client.post(
        "/api/v1/auth/register",
        json={"email": "fourth@example.com", "password": "AnotherPassword123!", "invite_code": "   "},
    )
    assert whitespace_reg.status_code == 403

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


def test_unconfigured_invite_code_blocks_registration(client):
    # Register first user
    client.post(
        "/api/v1/auth/register",
        json={"email": "first@example.com", "password": "SecurePassword123!"},
    )
    original_invite = settings.INVITE_CODE
    try:
        # If INVITE_CODE is blank/empty, no second user can register
        settings.INVITE_CODE = ""
        res = client.post(
            "/api/v1/auth/register",
            json={"email": "blocked@example.com", "password": "SecurePassword123!", "invite_code": ""},
        )
        assert res.status_code == 403
    finally:
        settings.INVITE_CODE = original_invite


def test_cron_weekly_review_security(client):
    # Call without secret fails
    res_no_secret = client.post("/cron/weekly-review")
    assert res_no_secret.status_code == 403

    # Call with wrong secret fails
    res_bad_secret = client.post(
        "/cron/weekly-review",
        headers={"X-Cron-Secret": "wrong_cron_secret"},
    )
    assert res_bad_secret.status_code == 403

    # Call with correct secret succeeds
    res_with_secret = client.post(
        "/cron/weekly-review",
        headers={"X-Cron-Secret": settings.CRON_SECRET},
    )
    assert res_with_secret.status_code == 200
    assert res_with_secret.json()["status"] == "success"


def test_production_config_validation():
    # In production, weak or short SECRET_KEY must raise ValueError
    with pytest.raises(ValueError, match="SECRET_KEY"):
        cfg = Settings(
            ENVIRONMENT="production",
            SECRET_KEY="short",
            CRON_SECRET="f9a8e7d6c5b4a39281701234567890abcdef1234567890abcdef1234567890ab",
        )
        cfg.validate_production_readiness()

    # In production, placeholder SECRET_KEY must raise ValueError
    with pytest.raises(ValueError, match="SECRET_KEY"):
        cfg = Settings(
            ENVIRONMENT="production",
            SECRET_KEY="insecure_dev_secret_key_please_change_in_production_992837482",
            CRON_SECRET="f9a8e7d6c5b4a39281701234567890abcdef1234567890abcdef1234567890ab",
        )
        cfg.validate_production_readiness()

    # In production, placeholder CRON_SECRET must raise ValueError
    with pytest.raises(ValueError, match="CRON_SECRET"):
        cfg = Settings(
            ENVIRONMENT="production",
            SECRET_KEY="f9a8e7d6c5b4a39281701234567890abcdef1234567890abcdef1234567890ab",
            CRON_SECRET="dev_cron_secret_123_change_in_production",
        )
        cfg.validate_production_readiness()
