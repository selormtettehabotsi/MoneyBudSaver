"""
Comprehensive Regression Tests for Analytics, Insufficient Data States (0 txs, 3-day history, 20-day history),
Council Snapshots, Weekly Cron, and Global Safe Error Handling.
"""
from datetime import date, timedelta
from decimal import Decimal
import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.category import Category
from app.models.transaction import Transaction
from app.models.budget import Budget
from app.models.debt import Debt
from app.models.savings_goal import SavingsGoal
from app.models.council import CouncilDecision
from app.models.user import User

from app.schemas.analytics import (
    DashboardAnalyticsOut,
    RunwayAnalyticsOut,
    CashflowAnalyticsOut,
)
from app.schemas.budget import BudgetOut
from app.schemas.savings_goal import SavingsGoalOut
from app.schemas.debt import DebtOut
from app.schemas.suggestion import WeeklyReviewResult, SuggestionLogOut
from app.schemas.council import ProviderStatusItem, CouncilDecisionOut

from app.services.financial_math import calculate_user_financial_snapshot
from app.services.privacy import build_anonymized_council_context
from app.config import settings


def _seed_account_state_a(auth_client, user_data, db_session: Session):
    """State (a): Brand new user with zero transactions."""
    # User is freshly registered, default categories exist, 0 transactions
    return user_data["id"]


def _seed_account_state_b(auth_client, user_data, db_session: Session):
    """State (b): A few transactions over about 3 days (income + expenses)."""
    user_id = user_data["id"]
    today = date.today()

    # Query or create categories
    income_cat = db_session.query(Category).filter(Category.user_id == user_id, Category.type == "income").first()
    expense_cat = db_session.query(Category).filter(Category.user_id == user_id, Category.type == "expense").first()

    # Add 3 transactions across 3 days
    tx1 = Transaction(
        user_id=user_id,
        category_id=income_cat.id if income_cat else None,
        amount=Decimal("3000.00"),
        type="income",
        date=today - timedelta(days=2),
        description="Salary Advance",
    )
    tx2 = Transaction(
        user_id=user_id,
        category_id=expense_cat.id if expense_cat else None,
        amount=Decimal("150.00"),
        type="expense",
        date=today - timedelta(days=1),
        description="Groceries",
    )
    tx3 = Transaction(
        user_id=user_id,
        category_id=expense_cat.id if expense_cat else None,
        amount=Decimal("75.00"),
        type="expense",
        date=today,
        description="Transport",
    )
    db_session.add_all([tx1, tx2, tx3])

    # Add a savings goal and debt
    goal = SavingsGoal(
        user_id=user_id,
        title="Emergency Starter",
        target_amount=Decimal("5000.00"),
        current_amount=Decimal("1000.00"),
    )
    debt = Debt(
        user_id=user_id,
        name="Credit Card",
        total_principal=Decimal("2000.00"),
        remaining_balance=Decimal("1500.00"),
        interest_rate=Decimal("18.00"),
        minimum_payment=Decimal("100.00"),
        due_day_of_month=15,
        start_date=today - timedelta(days=30),
    )
    db_session.add_all([goal, debt])
    db_session.commit()
    return user_id


def _seed_account_state_c(auth_client, user_data, db_session: Session):
    """State (c): 20 or more days of spending history."""
    user_id = user_data["id"]
    today = date.today()

    income_cat = db_session.query(Category).filter(Category.user_id == user_id, Category.type == "income").first()
    expense_cat = db_session.query(Category).filter(Category.user_id == user_id, Category.type == "expense").first()

    # Add transactions spanning 25 days
    tx1 = Transaction(
        user_id=user_id,
        category_id=income_cat.id if income_cat else None,
        amount=Decimal("5000.00"),
        type="income",
        date=today - timedelta(days=25),
        description="Monthly Salary",
    )
    tx2 = Transaction(
        user_id=user_id,
        category_id=expense_cat.id if expense_cat else None,
        amount=Decimal("450.00"),
        type="expense",
        date=today - timedelta(days=20),
        description="Supermarket",
    )
    tx3 = Transaction(
        user_id=user_id,
        category_id=expense_cat.id if expense_cat else None,
        amount=Decimal("200.00"),
        type="expense",
        date=today - timedelta(days=10),
        description="Utilities",
    )
    tx4 = Transaction(
        user_id=user_id,
        category_id=expense_cat.id if expense_cat else None,
        amount=Decimal("120.00"),
        type="expense",
        date=today,
        description="Dining Out",
    )
    db_session.add_all([tx1, tx2, tx3, tx4])

    goal = SavingsGoal(
        user_id=user_id,
        title="Emergency Buffer",
        target_amount=Decimal("10000.00"),
        current_amount=Decimal("4000.00"),
    )
    db_session.add(goal)
    db_session.commit()
    return user_id


@pytest.mark.parametrize("state_key", ["state_a", "state_b", "state_c"])
def test_every_authenticated_get_endpoint_under_all_states(make_auth_client, db_session: Session, state_key: str):
    """
    Calls EVERY authenticated GET endpoint across all 3 account states:
    (a) brand new / 0 transactions, (b) 3-day history, (c) 20+ day history.
    Asserts 200 HTTP status and Pydantic schema validation.
    """
    unique_email = f"user_{state_key}_{uuid.uuid4().hex[:6]}@example.com"
    client, user_data = make_auth_client(unique_email, "SecurePassword123!", "USD")

    if state_key == "state_a":
        _seed_account_state_a(client, user_data, db_session)
    elif state_key == "state_b":
        _seed_account_state_b(client, user_data, db_session)
    elif state_key == "state_c":
        _seed_account_state_c(client, user_data, db_session)

    # 1. GET /api/v1/analytics/dashboard
    resp_dash = client.get("/api/v1/analytics/dashboard")
    assert resp_dash.status_code == 200
    dash_data = resp_dash.json()
    validated_dash = DashboardAnalyticsOut.model_validate(dash_data)
    assert validated_dash.currency == "USD"

    if state_key in ("state_a", "state_b"):
        assert validated_dash.runway_months is None
        assert validated_dash.has_sufficient_data is False
        assert validated_dash.runway_display == "Not enough data"
        assert validated_dash.data_notice == "Add at least 2 weeks of spending for reliable advice."
    else:
        assert validated_dash.has_sufficient_data is True
        assert validated_dash.runway_months is not None
        assert "months" in validated_dash.runway_display

    # 2. GET /api/v1/analytics/runway
    resp_runway = client.get("/api/v1/analytics/runway")
    assert resp_runway.status_code == 200
    validated_runway = RunwayAnalyticsOut.model_validate(resp_runway.json())
    if state_key in ("state_a", "state_b"):
        assert validated_runway.runway_months is None
        assert validated_runway.has_sufficient_data is False
        assert validated_runway.runway_display == "Not enough data"
    else:
        assert validated_runway.has_sufficient_data is True
        assert validated_runway.runway_months is not None

    # 3. GET /api/v1/analytics/cashflow
    resp_cashflow = client.get("/api/v1/analytics/cashflow")
    assert resp_cashflow.status_code == 200
    validated_cashflow = CashflowAnalyticsOut.model_validate(resp_cashflow.json())
    assert len(validated_cashflow.monthly_trend) == 6

    # 4. GET /api/v1/budgets
    resp_budgets = client.get("/api/v1/budgets")
    assert resp_budgets.status_code == 200
    assert isinstance(resp_budgets.json(), list)
    from app.schemas.budget import BudgetProgressOut
    for b in resp_budgets.json():
        BudgetProgressOut.model_validate(b)

    # 5. GET /api/v1/savings-goals
    resp_goals = client.get("/api/v1/savings-goals")
    assert resp_goals.status_code == 200
    assert isinstance(resp_goals.json(), list)
    for g in resp_goals.json():
        SavingsGoalOut.model_validate(g)

    # 6. GET /api/v1/debts
    resp_debts = client.get("/api/v1/debts")
    assert resp_debts.status_code == 200
    assert isinstance(resp_debts.json(), list)
    for d in resp_debts.json():
        DebtOut.model_validate(d)

    # 7. GET /api/v1/suggestions/weekly
    resp_weekly = client.get("/api/v1/suggestions/weekly")
    assert resp_weekly.status_code == 200
    validated_weekly = WeeklyReviewResult.model_validate(resp_weekly.json())
    assert validated_weekly.health_score >= 0
    if state_key in ("state_a", "state_b"):
        assert validated_weekly.metrics_summary.get("has_sufficient_data") is False
        assert validated_weekly.metrics_summary.get("runway_months") is None

    # 8. GET /api/v1/suggestions/history
    resp_history = client.get("/api/v1/suggestions/history")
    assert resp_history.status_code == 200
    assert isinstance(resp_history.json(), list)
    for h in resp_history.json():
        SuggestionLogOut.model_validate(h)

    # 9. GET /api/v1/council/providers
    resp_providers = client.get("/api/v1/council/providers")
    assert resp_providers.status_code == 200
    assert isinstance(resp_providers.json(), list)
    for p in resp_providers.json():
        ProviderStatusItem.model_validate(p)

    # 10. GET /api/v1/council/history
    resp_council_hist = client.get("/api/v1/council/history")
    assert resp_council_hist.status_code == 200
    assert isinstance(resp_council_hist.json(), list)
    for c in resp_council_hist.json():
        CouncilDecisionOut.model_validate(c)

    # 11. GET /api/v1/data/backup/json
    resp_backup = client.get("/api/v1/data/backup/json")
    assert resp_backup.status_code == 200
    backup_data = resp_backup.json()
    assert backup_data["metadata"]["app"] == "MoneyCouncil"
    assert "transactions" in backup_data

    # 12. GET /api/v1/data/export/csv/transactions
    resp_csv_txs = client.get("/api/v1/data/export/csv/transactions")
    assert resp_csv_txs.status_code == 200
    assert "Date,Type,Category,Amount" in resp_csv_txs.text

    # 13. GET /api/v1/data/export/csv/budgets
    resp_csv_budgets = client.get("/api/v1/data/export/csv/budgets")
    assert resp_csv_budgets.status_code == 200
    assert "Year,Month,Category,LimitAmount" in resp_csv_budgets.text

    # 14. GET /api/v1/data/export/csv/debts
    resp_csv_debts = client.get("/api/v1/data/export/csv/debts")
    assert resp_csv_debts.status_code == 200
    assert "Name,TotalPrincipal,RemainingBalance" in resp_csv_debts.text


def test_weekly_review_cron_and_council_snapshot_in_states_a_and_b(make_auth_client, db_session: Session):
    """
    Tests that POST /cron/weekly-review and council snapshot / prompt building
    execute without crashing for brand new (a) and limited history (b) accounts.
    """
    # Create user state (a)
    client_a, user_a = make_auth_client("cron_user_a@example.com", "Password123!", "USD")
    _seed_account_state_a(client_a, user_a, db_session)

    # Create user state (b)
    client_b, user_b = make_auth_client("cron_user_b@example.com", "Password123!", "EUR")
    _seed_account_state_b(client_b, user_b, db_session)

    # Trigger Weekly Review Cron Endpoint
    cron_secret = settings.CRON_SECRET or "dev-cron-secret"
    resp_cron = client_a.post("/cron/weekly-review", headers={"X-Cron-Secret": cron_secret})
    assert resp_cron.status_code == 200
    assert resp_cron.json()["status"] == "success"

    # Test Council Snapshot & Context Generation for state (a)
    snapshot_a = calculate_user_financial_snapshot(db_session, user_a["id"])
    assert snapshot_a["has_sufficient_data"] is False
    assert snapshot_a["current_runway_months"] is None
    context_a = build_anonymized_council_context(snapshot_a, "USD")
    assert "INSUFFICIENT_HISTORY" in context_a
    assert "confidence rating at a maximum of 40%" in context_a

    # Test Council Snapshot & Context Generation for state (b)
    snapshot_b = calculate_user_financial_snapshot(db_session, user_b["id"])
    assert snapshot_b["has_sufficient_data"] is False
    assert snapshot_b["current_runway_months"] is None
    context_b = build_anonymized_council_context(snapshot_b, "EUR")
    assert "INSUFFICIENT_HISTORY" in context_b
    assert "confidence rating at a maximum of 40%" in context_b


def test_global_500_exception_handler_and_secret_redaction(make_auth_client, monkeypatch):
    """
    Asserts that an unhandled server error returns status 500 with
    {'detail': 'Internal error', 'request_id': '<uuid>'} without leaking
    tracebacks, sensitive tokens, or internal details to the caller.
    """
    from main import app
    from starlette.testclient import TestClient as SafeTestClient

    safe_client = SafeTestClient(app, raise_server_exceptions=False)
    _, user_data = make_auth_client("err_user@example.com", "Password123!", "USD")

    # Intentionally trigger an unhandled Exception in an endpoint service
    def buggy_snapshot(*args, **kwargs):
        # Simulate an unexpected bug that contains a sensitive secret in memory
        secret_key = "gsk_1234567890abcdef1234567890abcdef"
        raise RuntimeError(f"Unexpected crash while using provider key {secret_key}")

    monkeypatch.setattr("app.api.v1.analytics.calculate_user_financial_snapshot", buggy_snapshot)

    # Login with safe_client to set cookie
    login_resp = safe_client.post(
        "/api/v1/auth/login",
        json={"email": "err_user@example.com", "password": "Password123!"}
    )
    assert login_resp.status_code == 200

    resp = safe_client.get("/api/v1/analytics/dashboard")
    assert resp.status_code == 500
    data = resp.json()
    assert data["detail"] == "Internal error"
    assert "request_id" in data
    assert len(data["request_id"]) >= 32
    # Ensure no secret or internal exception string is leaked in the response JSON
    assert "gsk_" not in resp.text
    assert "RuntimeError" not in resp.text
    assert "traceback" not in resp.text
