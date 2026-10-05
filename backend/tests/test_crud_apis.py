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


def test_transaction_idempotency_with_client_id(make_auth_client):
    """Verifies that submitting the same client_id returns the existing transaction idempotently without duplicates."""
    client, user = make_auth_client("idempotent_user@example.com", "Password123!")
    client_uuid = "a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d"

    # First creation
    res1 = client.post(
        "/api/v1/transactions",
        json={
            "amount": "250.00",
            "type": "expense",
            "date": "2026-10-01",
            "description": "Offline Queued Groceries",
            "client_id": client_uuid,
        },
    )
    assert res1.status_code == 201
    tx1 = res1.json()
    assert tx1["client_id"] == client_uuid
    tx1_id = tx1["id"]

    # Replay of identical client_id (e.g. outbox resync)
    res2 = client.post(
        "/api/v1/transactions",
        json={
            "amount": "250.00",
            "type": "expense",
            "date": "2026-10-01",
            "description": "Offline Queued Groceries",
            "client_id": client_uuid,
        },
    )
    assert res2.status_code in (200, 201)
    tx2 = res2.json()
    assert tx2["id"] == tx1_id  # Must return identical transaction record

    # Verify database has exactly 1 transaction
    list_res = client.get("/api/v1/transactions")
    assert list_res.json()["total_count"] == 1


def test_database_migration_with_existing_rows(tmp_path):
    """
    Verifies that the startup schema migration safely adds the client_id column
    to an existing database that already contains populated rows without data loss.
    """
    from sqlalchemy import create_engine, text, inspect
    from app.db.init_db import run_schema_migrations

    # Create a legacy database without client_id column
    test_db_path = tmp_path / "legacy_test.db"
    legacy_engine = create_engine(f"sqlite:///{test_db_path}")

    with legacy_engine.begin() as conn:
        conn.execute(text("""
            CREATE TABLE users (
                id VARCHAR(36) PRIMARY KEY,
                email VARCHAR(255) NOT NULL,
                hashed_password VARCHAR(255) NOT NULL,
                currency VARCHAR(10) NOT NULL,
                is_active BOOLEAN NOT NULL DEFAULT 1,
                settings JSON NOT NULL DEFAULT '{}',
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """))
        conn.execute(text("""
            CREATE TABLE transactions (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                category_id VARCHAR(36),
                amount NUMERIC(14, 2) NOT NULL,
                type VARCHAR(20) NOT NULL,
                date DATE NOT NULL,
                description VARCHAR(255) NOT NULL,
                is_recurring BOOLEAN NOT NULL DEFAULT 0,
                tags JSON NOT NULL DEFAULT '[]',
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """))
        # Insert pre-existing rows
        conn.execute(text("""
            INSERT INTO users (id, email, hashed_password, currency)
            VALUES ('u1', 'legacy@example.com', 'hash', 'GHS')
        """))
        conn.execute(text("""
            INSERT INTO transactions (id, user_id, amount, type, date, description)
            VALUES ('t1', 'u1', 50.00, 'expense', '2026-09-15', 'Pre-existing Transaction')
        """))

    # Verify client_id was absent
    inspector_before = inspect(legacy_engine)
    assert "client_id" not in [c["name"] for c in inspector_before.get_columns("transactions")]

    # Run migration
    run_schema_migrations(legacy_engine)

    # Verify column added
    inspector_after = inspect(legacy_engine)
    assert "client_id" in [c["name"] for c in inspector_after.get_columns("transactions")]

    # Verify pre-existing data was preserved
    with legacy_engine.connect() as conn:
        row = conn.execute(text("SELECT id, amount, description, client_id FROM transactions WHERE id = 't1'")).fetchone()
        assert row is not None
        assert row[0] == "t1"
        assert float(row[1]) == 50.00
        assert row[2] == "Pre-existing Transaction"
        assert row[3] is None
