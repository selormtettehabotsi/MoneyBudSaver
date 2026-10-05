"""
Unit and Integration Tests for Smart Financial Suggestions & Weekly Reviews.
"""
from datetime import date, timedelta
from decimal import Decimal
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.services.suggestions import compute_financial_health_score, generate_audit_suggestions
from app.models.user import User
from app.models.category import Category
from app.models.budget import Budget
from app.models.transaction import Transaction
from app.models.debt import Debt
from app.models.savings_goal import SavingsGoal


def test_health_score_excellent_finances():
    result = compute_financial_health_score(
        monthly_income=Decimal("10000.00"),
        monthly_expenses=Decimal("4000.00"),
        monthly_debt_service=Decimal("500.00"),
        liquid_savings=Decimal("30000.00"),  # 7.5 months runway
        budgets_exceeded=0,
        total_budgets=5,
    )
    score = result["total_score"]
    assert score >= 90
    assert result["pillars"]["savings_rate"]["score"] == 25
    assert result["pillars"]["runway"]["score"] == 25
    assert result["pillars"]["debt_burden"]["score"] == 25
    assert result["pillars"]["budget_adherence"]["score"] == 25


def test_health_score_distressed_finances():
    result = compute_financial_health_score(
        monthly_income=Decimal("3000.00"),
        monthly_expenses=Decimal("3500.00"),  # negative cashflow
        monthly_debt_service=Decimal("1600.00"),  # >50% DTI
        liquid_savings=Decimal("200.00"),  # < 0.1 months runway
        budgets_exceeded=3,
        total_budgets=4,
    )
    score = result["total_score"]
    assert score <= 20
    assert result["pillars"]["savings_rate"]["score"] == 0
    assert result["pillars"]["runway"]["score"] == 0
    assert result["pillars"]["debt_burden"]["score"] == 0


def test_audit_suggestions_triggers_overspending_and_debt_alerts(make_auth_client, db_session: Session):
    # 1. Register test user via make_auth_client
    auth_client, user_data = make_auth_client("audit_user@example.com", "SecurePassword123!", "GHS")
    user_id = user_data["id"]

    # 2. Add an expense category & budget
    cat = Category(user_id=user_id, name="Fine Dining", type="expense", icon_name="utensils", color_hex="#f43f5e")
    db_session.add(cat)
    db_session.commit()
    db_session.refresh(cat)

    budget = Budget(
        user_id=user_id,
        category_id=cat.id,
        amount_limit=Decimal("500.00"),
        month=date.today().month,
        year=date.today().year,
    )
    db_session.add(budget)

    # 3. Add an overspending transaction (650 > 500)
    tx = Transaction(
        user_id=user_id,
        category_id=cat.id,
        amount=Decimal("650.00"),
        type="expense",
        date=date.today(),
        description="Luxury Dinner",
    )
    db_session.add(tx)

    # 4. Add a high-interest debt
    debt = Debt(
        user_id=user_id,
        name="Credit Card Loan",
        total_principal=Decimal("4000.00"),
        remaining_balance=Decimal("3800.00"),
        interest_rate=Decimal("28.5"),
        minimum_payment=Decimal("150.00"),
        due_day_of_month=15,
        start_date=date.today(),
    )
    db_session.add(debt)
    db_session.commit()

    # 5. Call GET /api/v1/suggestions/weekly
    review_resp = auth_client.get("/api/v1/suggestions/weekly")
    assert review_resp.status_code == 200
    data = review_resp.json()
    assert "health_score" in data
    assert len(data["suggestions"]) > 0

    # Verify overspending was detected
    overspending_found = any(s["category"] == "overspending" and "Fine Dining" in s["title"] for s in data["suggestions"])
    assert overspending_found is True

    # Verify high interest debt alert was generated
    debt_alert_found = any(s["category"] == "debt_alert" and "Credit Card Loan" in s["title"] for s in data["suggestions"])
    assert debt_alert_found is True

    # 6. Call POST /api/v1/suggestions/generate
    gen_resp = auth_client.post("/api/v1/suggestions/generate")
    assert gen_resp.status_code == 200
    assert gen_resp.json()["health_score"] == data["health_score"]

    # 7. Check history endpoint
    hist_resp = auth_client.get("/api/v1/suggestions/history")
    assert hist_resp.status_code == 200
    assert len(hist_resp.json()) >= 1
