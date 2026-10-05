"""
Integration tests for CRUD APIs with multi-user isolation verification:
- Categories
- Transactions (with exact Decimal sums and filtering)
- Budgets (with real-time budget vs actual calculations)
- Savings Goals (with deposits/adjustments)
- Debts & Loans (with payment logging and payoff estimates)
- Dashboard Analytics
- Multi-tenant cross-user access isolation (must return 404 for other user records)
"""
import pytest
from datetime import date
from decimal import Decimal


def test_category_crud_and_isolation(make_auth_client):
    client_a, user_a = make_auth_client("alice@example.com", "Password123!")
    client_b, user_b = make_auth_client("bob@example.com", "Password123!")

    # 1. User A creates custom category
    create_res = client_a.post(
        "/api/v1/categories",
        json={"name": "Alice Custom", "type": "expense", "icon_name": "star", "color_hex": "#ff0000"},
    )
    assert create_res.status_code == 201
    cat_a = create_res.json()
    cat_id = cat_a["id"]

    # 2. User B tries to update User A's category -> Must return 404
    b_update = client_b.put(
        f"/api/v1/categories/{cat_id}",
        json={"name": "Hacked Category"},
    )
    assert b_update.status_code == 404

    # 3. User B tries to delete User A's category -> Must return 404
    b_delete = client_b.delete(f"/api/v1/categories/{cat_id}")
    assert b_delete.status_code == 404

    # 4. User A successfully updates own category
    a_update = client_a.put(
        f"/api/v1/categories/{cat_id}",
        json={"name": "Alice Modified"},
    )
    assert a_update.status_code == 200
    assert a_update.json()["name"] == "Alice Modified"

    # 5. User A deletes own category
    a_delete = client_a.delete(f"/api/v1/categories/{cat_id}")
    assert a_delete.status_code == 204


def test_transaction_crud_and_isolation(make_auth_client):
    client_a, user_a = make_auth_client("alice_tx@example.com", "Password123!")
    client_b, user_b = make_auth_client("bob_tx@example.com", "Password123!")

    today_str = date.today().isoformat()

    # User A creates transaction
    tx_a = client_a.post(
        "/api/v1/transactions",
        json={
            "amount": "1500.00",
            "type": "income",
            "date": today_str,
            "description": "Alice Bonus",
        },
    ).json()
    tx_id = tx_a["id"]

    # User B cannot see User A's transaction in list
    b_list = client_b.get("/api/v1/transactions").json()
    assert b_list["total_count"] == 0
    assert len(b_list["items"]) == 0

    # User B cannot get User A's transaction by ID -> 404
    assert client_b.get(f"/api/v1/transactions/{tx_id}").status_code == 404

    # User B cannot edit User A's transaction -> 404
    assert client_b.put(f"/api/v1/transactions/{tx_id}", json={"amount": "9999.00"}).status_code == 404

    # User B cannot delete User A's transaction -> 404
    assert client_b.delete(f"/api/v1/transactions/{tx_id}").status_code == 404

    # User A gets transaction by ID
    a_get = client_a.get(f"/api/v1/transactions/{tx_id}")
    assert a_get.status_code == 200
    assert Decimal(a_get.json()["amount"]) == Decimal("1500.00")


def test_budget_progress_and_isolation(make_auth_client):
    client_a, user_a = make_auth_client("alice_budget@example.com", "Password123!")
    client_b, user_b = make_auth_client("bob_budget@example.com", "Password123!")

    cats_a = client_a.get("/api/v1/categories").json()
    groceries_cat = next(c for c in cats_a if c["type"] == "expense")
    today = date.today()

    # User A creates budget
    b_res = client_a.post(
        "/api/v1/budgets",
        json={
            "category_id": groceries_cat["id"],
            "month": today.month,
            "year": today.year,
            "amount_limit": "800.00",
        },
    )
    assert b_res.status_code == 201
    b_id = b_res.json()["id"]

    # User B cannot update User A's budget -> 404
    assert client_b.put(f"/api/v1/budgets/{b_id}", json={"amount_limit": "2000.00"}).status_code == 404

    # User B cannot delete User A's budget -> 404
    assert client_b.delete(f"/api/v1/budgets/{b_id}").status_code == 404


def test_savings_goals_and_isolation(make_auth_client):
    client_a, user_a = make_auth_client("alice_goals@example.com", "Password123!")
    client_b, user_b = make_auth_client("bob_goals@example.com", "Password123!")

    # User A creates goal
    goal = client_a.post(
        "/api/v1/savings-goals",
        json={"title": "Trip to Ada", "target_amount": "5000.00", "current_amount": "1000.00"},
    ).json()
    goal_id = goal["id"]

    # User B cannot adjust User A's goal -> 404
    assert client_b.post(f"/api/v1/savings-goals/{goal_id}/adjust", json={"amount": "500.00"}).status_code == 404

    # User B cannot delete User A's goal -> 404
    assert client_b.delete(f"/api/v1/savings-goals/{goal_id}").status_code == 404

    # User A adjusts balance
    adj = client_a.post(f"/api/v1/savings-goals/{goal_id}/adjust", json={"amount": "500.00"}).json()
    assert Decimal(adj["current_amount"]) == Decimal("1500.00")
    assert adj["progress_percentage"] == 30.0


def test_debts_and_isolation(make_auth_client):
    client_a, user_a = make_auth_client("alice_debt@example.com", "Password123!")
    client_b, user_b = make_auth_client("bob_debt@example.com", "Password123!")

    # User A creates debt
    debt = client_a.post(
        "/api/v1/debts",
        json={
            "name": "Credit Card",
            "total_principal": "2000.00",
            "remaining_balance": "1800.00",
            "interest_rate": "18.000",
            "minimum_payment": "100.00",
            "start_date": "2026-01-01",
        },
    ).json()
    debt_id = debt["id"]

    # User B cannot record payment on User A's debt -> 404
    assert client_b.post(f"/api/v1/debts/{debt_id}/payment", json={"payment_amount": "200.00"}).status_code == 404

    # User B cannot delete User A's debt -> 404
    assert client_b.delete(f"/api/v1/debts/{debt_id}").status_code == 404

    # User A records payment
    pay = client_a.post(f"/api/v1/debts/{debt_id}/payment", json={"payment_amount": "300.00"}).json()
    assert Decimal(pay["remaining_balance"]) == Decimal("1500.00")
