"""
Unit and Integration Tests for CSV Import/Export & Complete JSON Database Backup/Restore.
"""
from datetime import date
from decimal import Decimal
import io
import json
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.category import Category
from app.models.transaction import Transaction
from app.models.budget import Budget
from app.models.savings_goal import SavingsGoal
from app.models.debt import Debt
from app.models.council import CouncilDecision


def test_csv_export_transactions_and_budgets(make_auth_client, db_session: Session):
    auth_client, user_data = make_auth_client("backup_user@example.com", "Password123!", "GHS")
    user_id = user_data["id"]

    # 1. Create test category, transaction, and budget
    cat = Category(user_id=user_id, name="Groceries", type="expense", icon_name="shopping-bag", color_hex="#10b981")
    db_session.add(cat)
    db_session.commit()
    db_session.refresh(cat)

    tx = Transaction(
        user_id=user_id,
        category_id=cat.id,
        amount=Decimal("245.50"),
        type="expense",
        date=date(2026, 10, 1),
        description="Weekly Grocery Shopping",
        is_recurring=False,
        tags=["food", "supermarket"],
    )
    budget = Budget(
        user_id=user_id,
        category_id=cat.id,
        month=10,
        year=2026,
        amount_limit=Decimal("1200.00"),
    )
    debt = Debt(
        user_id=user_id,
        name="Auto Loan",
        total_principal=Decimal("15000.00"),
        remaining_balance=Decimal("12500.00"),
        interest_rate=Decimal("12.500"),
        minimum_payment=Decimal("450.00"),
        due_day_of_month=5,
        start_date=date(2026, 1, 1),
    )
    db_session.add_all([tx, budget, debt])
    db_session.commit()

    # 2. Test CSV Export Endpoints
    tx_csv_resp = auth_client.get("/api/v1/data/export/csv/transactions")
    assert tx_csv_resp.status_code == 200
    assert "Date,Type,Category,Amount,Description" in tx_csv_resp.text
    assert "Weekly Grocery Shopping" in tx_csv_resp.text
    assert "245.50" in tx_csv_resp.text

    budget_csv_resp = auth_client.get("/api/v1/data/export/csv/budgets")
    assert budget_csv_resp.status_code == 200
    assert "Year,Month,Category,LimitAmount" in budget_csv_resp.text
    assert "1200.00" in budget_csv_resp.text

    debt_csv_resp = auth_client.get("/api/v1/data/export/csv/debts")
    assert debt_csv_resp.status_code == 200
    assert "Auto Loan" in debt_csv_resp.text
    assert "12500.00" in debt_csv_resp.text


def test_csv_import_transactions_with_flexible_headers_and_categories(make_auth_client, db_session: Session):
    auth_client, user_data = make_auth_client("import_user@example.com", "Password123!", "GHS")
    user_id = user_data["id"]

    # CSV with custom headers and currency signs
    csv_payload = """Transaction Date,Memo,Category Name,Value,Type
2026-10-02,Client Payment,Consulting,"GH₵ 3,500.00",Income
2026-10-03,Office Supplies,Stationery,120.50,Expense
2026-10-03,Office Supplies,Stationery,120.50,Expense
"""
    files = {"file": ("bank_statement.csv", io.BytesIO(csv_payload.encode("utf-8")), "text/csv")}
    data = {"create_categories": "true"}

    import_resp = auth_client.post("/api/v1/data/import/csv/transactions", files=files, data=data)
    assert import_resp.status_code == 200
    res = import_resp.json()
    assert res["success"] is True
    assert res["imported_count"] == 2  # 3rd row is identical duplicate and skipped
    assert res["skipped_duplicates"] == 1
    assert res["created_categories"] >= 1

    # Verify transactions in database
    txs = db_session.query(Transaction).filter(Transaction.user_id == user_id).all()
    assert len(txs) == 2
    income_tx = [t for t in txs if t.type == "income"][0]
    assert income_tx.amount == Decimal("3500.00")
    assert income_tx.description == "Client Payment"


def test_full_json_backup_and_restore(make_auth_client, db_session: Session):
    auth_client, user_data = make_auth_client("json_backup_user@example.com", "Password123!", "USD")
    user_id = user_data["id"]

    # 1. Create multi-table records
    cat = Category(user_id=user_id, name="Cloud Hosting", type="expense", icon_name="server", color_hex="#3b82f6")
    db_session.add(cat)
    db_session.commit()
    db_session.refresh(cat)

    goal = SavingsGoal(
        user_id=user_id,
        title="Emergency Reserve",
        target_amount=Decimal("10000.00"),
        current_amount=Decimal("4500.00"),
        target_date=date(2027, 6, 30),
    )
    decision = CouncilDecision(
        user_id=user_id,
        question="Should I buy a new MacBook Pro for GHS 18,000?",
        decision_type="purchase",
        candidate_amount=Decimal("18000.00"),
        user_verdict="accepted",
    )
    db_session.add_all([goal, decision])
    db_session.commit()

    # 2. Export full JSON backup
    export_resp = auth_client.get("/api/v1/data/backup/json")
    assert export_resp.status_code == 200
    backup_json = export_resp.json()
    assert backup_json["metadata"]["app"] == "MoneyCouncil"
    assert len(backup_json["categories"]) >= 1
    assert len(backup_json["savings_goals"]) == 1
    assert len(backup_json["council_decisions"]) == 1

    # 3. Modify user records in database
    db_session.query(SavingsGoal).filter(SavingsGoal.user_id == user_id).delete()
    db_session.commit()
    assert db_session.query(SavingsGoal).filter(SavingsGoal.user_id == user_id).count() == 0

    # 4. Restore from JSON backup with overwrite=True
    restore_resp = auth_client.post("/api/v1/data/restore/json?overwrite=true", json=backup_json)
    assert restore_resp.status_code == 200
    res = restore_resp.json()
    assert res["success"] is True
    assert res["restored_savings_goals"] == 1
    assert res["restored_council_decisions"] == 1

    # 5. Verify restored data
    restored_goal = db_session.query(SavingsGoal).filter(SavingsGoal.user_id == user_id).first()
    assert restored_goal is not None
    assert restored_goal.title == "Emergency Reserve"
    assert restored_goal.current_amount == Decimal("4500.00")
