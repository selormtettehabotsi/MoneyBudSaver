"""
CSV Import/Export and Complete JSON Database Backup/Restore Engine.
Handles exact Decimal amounts, currency symbol scrubbing, flexible date parsing,
and multi-table JSON backups with transactional safety.
"""
import io
import csv
import json
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Dict, Any, List, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.user import User
from app.models.category import Category
from app.models.transaction import Transaction
from app.models.budget import Budget
from app.models.savings_goal import SavingsGoal
from app.models.debt import Debt
from app.models.council import CouncilDecision
from app.services.financial_math import round_decimal


def export_transactions_csv(db: Session, user_id: str) -> str:
    """Exports all transactions for a user as standard CSV string."""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Date", "Type", "Category", "Amount", "Description", "IsRecurring", "Tags"])

    txs = (
        db.query(Transaction, Category.name)
        .outerjoin(Category, Transaction.category_id == Category.id)
        .filter(Transaction.user_id == user_id)
        .order_by(Transaction.date.desc())
        .all()
    )

    for tx, cat_name in txs:
        tags_str = ",".join(tx.tags) if tx.tags else ""
        writer.writerow([
            tx.date.isoformat(),
            tx.type,
            cat_name or "Uncategorized",
            f"{tx.amount:.2f}",
            tx.description or "",
            "Yes" if tx.is_recurring else "No",
            tags_str,
        ])

    return output.getvalue()


def export_budgets_csv(db: Session, user_id: str) -> str:
    """Exports all budgets for a user as CSV string."""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Year", "Month", "Category", "LimitAmount"])

    budgets = (
        db.query(Budget, Category.name)
        .join(Category, Budget.category_id == Category.id)
        .filter(Budget.user_id == user_id)
        .order_by(Budget.year.desc(), Budget.month.desc())
        .all()
    )

    for b, cat_name in budgets:
        writer.writerow([
            b.year,
            b.month,
            cat_name,
            f"{b.amount_limit:.2f}",
        ])

    return output.getvalue()


def export_debts_csv(db: Session, user_id: str) -> str:
    """Exports all debts for a user as CSV string."""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Name", "TotalPrincipal", "RemainingBalance", "InterestRateAPR", "MinimumPayment", "DueDayOfMonth", "StartDate"])

    debts = db.query(Debt).filter(Debt.user_id == user_id).order_by(Debt.name).all()
    for d in debts:
        writer.writerow([
            d.name,
            f"{d.total_principal:.2f}",
            f"{d.remaining_balance:.2f}",
            f"{d.interest_rate:.3f}",
            f"{d.minimum_payment:.2f}",
            d.due_day_of_month,
            d.start_date.isoformat(),
        ])

    return output.getvalue()


def _parse_flexible_date(date_str: str) -> Optional[date]:
    """Parses various date string formats into standard date object."""
    if not date_str:
        return None
    cleaned = date_str.strip()
    formats = [
        "%Y-%m-%d",
        "%d/%m/%Y",
        "%m/%d/%Y",
        "%Y/%m/%d",
        "%d-%m-%Y",
        "%m-%d-%Y",
        "%Y.%m.%d",
        "%b %d, %Y",
        "%B %d, %Y",
    ]
    for fmt in formats:
        try:
            return datetime.strptime(cleaned, fmt).date()
        except ValueError:
            continue
    return None


def _clean_amount(amount_str: str) -> Optional[Decimal]:
    """Strips currency signs, commas, and whitespace, parsing exact Decimal."""
    if not amount_str:
        return None
    cleaned = str(amount_str).strip()
    for sym in ["GHS", "GH₵", "GH¢", "$", "€", "£", "¥", "₹", " "]:
        cleaned = cleaned.replace(sym, "")
    cleaned = cleaned.replace(",", "")
    try:
        val = Decimal(cleaned)
        return round_decimal(abs(val))
    except (InvalidOperation, ValueError):
        return None


def import_transactions_csv(
    db: Session,
    user_id: str,
    csv_content: str,
    create_missing_categories: bool = True,
) -> Dict[str, Any]:
    """
    Parses and imports transactions from CSV content with automatic column header mapping,
    category auto-creation, and duplicate avoidance.
    """
    f = io.StringIO(csv_content)
    reader = csv.reader(f)
    try:
        header = next(reader)
    except StopIteration:
        return {
            "success": False,
            "imported_count": 0,
            "skipped_duplicates": 0,
            "created_categories": 0,
            "errors": ["Uploaded CSV file is empty."],
        }

    # Normalize header column mapping
    header_norm = [h.strip().lower().replace("_", " ").replace("-", " ") for h in header]
    date_col = -1
    amount_col = -1
    desc_col = -1
    type_col = -1
    cat_col = -1

    for i, col in enumerate(header_norm):
        if "date" in col and date_col == -1:
            date_col = i
        elif any(k in col for k in ["category", "cat"]) and cat_col == -1:
            cat_col = i
        elif any(k in col for k in ["amount", "value", "cost", "sum", "price", "total"]) and amount_col == -1:
            amount_col = i
        elif any(k in col for k in ["type", "transaction type", "debit/credit", "dr/cr"]) and type_col == -1:
            type_col = i
        elif any(k in col for k in ["desc", "memo", "payee", "title", "name", "narrative", "details"]) and desc_col == -1:
            desc_col = i

    if date_col == -1 or amount_col == -1:
        return {
            "success": False,
            "imported_count": 0,
            "skipped_duplicates": 0,
            "created_categories": 0,
            "errors": ["CSV must contain identifiable 'Date' and 'Amount' columns."],
        }

    # Cache user's categories
    user_cats = {c.name.lower().strip(): c.id for c in db.query(Category).filter(Category.user_id == user_id).all()}

    imported_count = 0
    skipped_duplicates = 0
    created_categories_count = 0
    errors: List[str] = []
    seen_in_batch = set()

    for row_num, row in enumerate(reader, start=2):
        if not row or not any(row):
            continue

        try:
            date_str = row[date_col] if date_col < len(row) else ""
            parsed_date = _parse_flexible_date(date_str)
            if not parsed_date:
                errors.append(f"Row {row_num}: Invalid date format '{date_str}'.")
                continue

            amount_str = row[amount_col] if amount_col < len(row) else ""
            parsed_amount = _clean_amount(amount_str)
            if not parsed_amount or parsed_amount <= Decimal("0.00"):
                errors.append(f"Row {row_num}: Invalid amount '{amount_str}'.")
                continue

            description = row[desc_col].strip() if desc_col != -1 and desc_col < len(row) else "Imported Transaction"
            if not description:
                description = "Imported Transaction"

            # Determine type
            tx_type = "expense"
            if type_col != -1 and type_col < len(row):
                raw_type = row[type_col].lower().strip()
                if any(k in raw_type for k in ["inc", "credit", "deposit", "+"]):
                    tx_type = "income"
                elif any(k in raw_type for k in ["exp", "debit", "withdrawal", "-"]):
                    tx_type = "expense"
            elif "-" not in amount_str and ("credit" in description.lower() or "salary" in description.lower() or "deposit" in description.lower()):
                tx_type = "income"

            # Check for intra-batch duplicate
            batch_key = (parsed_date, parsed_amount, description, tx_type)
            if batch_key in seen_in_batch:
                skipped_duplicates += 1
                continue

            # Determine Category
            category_id = None
            if cat_col != -1 and cat_col < len(row):
                cat_raw = row[cat_col].strip()
                if cat_raw:
                    cat_key = cat_raw.lower()
                    if cat_key in user_cats:
                        category_id = user_cats[cat_key]
                    elif create_missing_categories:
                        new_cat = Category(
                            user_id=user_id,
                            name=cat_raw,
                            type=tx_type,
                            icon_name="tag",
                            color_hex="#6366f1" if tx_type == "income" else "#f43f5e",
                        )
                        db.add(new_cat)
                        db.commit()
                        db.refresh(new_cat)
                        user_cats[cat_key] = new_cat.id
                        category_id = new_cat.id
                        created_categories_count += 1

            # Check for duplicate in database
            duplicate = (
                db.query(Transaction)
                .filter(
                    Transaction.user_id == user_id,
                    Transaction.date == parsed_date,
                    Transaction.amount == parsed_amount,
                    Transaction.description == description,
                )
                .first()
            )
            if duplicate:
                skipped_duplicates += 1
                seen_in_batch.add(batch_key)
                continue

            # Create Transaction
            tx = Transaction(
                user_id=user_id,
                category_id=category_id,
                amount=parsed_amount,
                type=tx_type,
                date=parsed_date,
                description=description,
            )
            db.add(tx)
            seen_in_batch.add(batch_key)
            imported_count += 1

        except Exception as e:
            errors.append(f"Row {row_num}: {str(e)}")

    if imported_count > 0:
        db.commit()

    return {
        "success": True,
        "imported_count": imported_count,
        "skipped_duplicates": skipped_duplicates,
        "created_categories": created_categories_count,
        "errors": errors[:10],
    }


def export_full_backup_json(db: Session, user: User) -> Dict[str, Any]:
    """
    Serializes complete user database and settings to a portable JSON backup dictionary.
    """
    categories = db.query(Category).filter(Category.user_id == user.id).all()
    transactions = db.query(Transaction).filter(Transaction.user_id == user.id).all()
    budgets = db.query(Budget).filter(Budget.user_id == user.id).all()
    savings_goals = db.query(SavingsGoal).filter(SavingsGoal.user_id == user.id).all()
    debts = db.query(Debt).filter(Debt.user_id == user.id).all()
    decisions = db.query(CouncilDecision).filter(CouncilDecision.user_id == user.id).all()

    return {
        "metadata": {
            "version": "1.0",
            "app": "MoneyCouncil",
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "user_email": user.email,
            "currency": user.currency,
        },
        "settings": user.settings or {},
        "categories": [
            {
                "id": c.id,
                "name": c.name,
                "type": c.type,
                "icon_name": c.icon_name,
                "color_hex": c.color_hex,
                "is_default": c.is_default,
                "created_at": c.created_at.isoformat(),
            }
            for c in categories
        ],
        "transactions": [
            {
                "id": t.id,
                "category_id": t.category_id,
                "amount": str(t.amount),
                "type": t.type,
                "date": t.date.isoformat(),
                "description": t.description,
                "is_recurring": t.is_recurring,
                "tags": t.tags or [],
                "created_at": t.created_at.isoformat(),
            }
            for t in transactions
        ],
        "budgets": [
            {
                "id": b.id,
                "category_id": b.category_id,
                "month": b.month,
                "year": b.year,
                "amount_limit": str(b.amount_limit),
                "created_at": b.created_at.isoformat(),
            }
            for b in budgets
        ],
        "savings_goals": [
            {
                "id": g.id,
                "title": g.title,
                "target_amount": str(g.target_amount),
                "current_amount": str(g.current_amount),
                "target_date": g.target_date.isoformat() if g.target_date else None,
                "is_completed": g.is_completed,
                "notes": g.notes,
                "created_at": g.created_at.isoformat(),
            }
            for g in savings_goals
        ],
        "debts": [
            {
                "id": d.id,
                "name": d.name,
                "total_principal": str(d.total_principal),
                "remaining_balance": str(d.remaining_balance),
                "interest_rate": str(d.interest_rate),
                "minimum_payment": str(d.minimum_payment),
                "due_day_of_month": d.due_day_of_month,
                "start_date": d.start_date.isoformat(),
                "estimated_payoff_date": d.estimated_payoff_date.isoformat() if d.estimated_payoff_date else None,
                "notes": d.notes,
                "created_at": d.created_at.isoformat(),
            }
            for d in debts
        ],
        "council_decisions": [
            {
                "id": cd.id,
                "question": cd.question,
                "decision_type": cd.decision_type,
                "candidate_amount": str(cd.candidate_amount) if cd.candidate_amount else None,
                "round1_votes": cd.round1_votes,
                "round2_votes": cd.round2_votes,
                "final_tally": cd.final_tally,
                "guardrail_breach": cd.guardrail_breach,
                "user_verdict": cd.user_verdict,
                "user_modifications": cd.user_modifications,
                "decided_at": cd.decided_at.isoformat() if cd.decided_at else None,
                "created_at": cd.created_at.isoformat(),
            }
            for cd in decisions
        ],
    }


def restore_full_backup_json(
    db: Session,
    user: User,
    backup_data: Dict[str, Any],
    overwrite_existing: bool = False,
) -> Dict[str, Any]:
    """
    Restores user database from a JSON backup dictionary.
    """
    meta = backup_data.get("metadata", {})
    if not meta or meta.get("app") != "MoneyCouncil":
        raise ValueError("Invalid backup file: Not a recognized MoneyCouncil backup payload.")

    if overwrite_existing:
        # Delete existing child records in cascade order
        db.query(Transaction).filter(Transaction.user_id == user.id).delete()
        db.query(Budget).filter(Budget.user_id == user.id).delete()
        db.query(SavingsGoal).filter(SavingsGoal.user_id == user.id).delete()
        db.query(Debt).filter(Debt.user_id == user.id).delete()
        db.query(CouncilDecision).filter(CouncilDecision.user_id == user.id).delete()
        db.query(Category).filter(Category.user_id == user.id).delete()
        db.commit()

    # Update user currency & settings if present
    if meta.get("currency"):
        user.currency = meta["currency"]
    if backup_data.get("settings"):
        user.settings = backup_data["settings"]

    id_map_categories: Dict[str, str] = {}

    # 1. Restore Categories
    restored_cats = 0
    for c_data in backup_data.get("categories", []):
        old_id = c_data.get("id")
        # Check if category with name already exists
        existing = db.query(Category).filter(Category.user_id == user.id, Category.name == c_data["name"]).first()
        if existing:
            if old_id:
                id_map_categories[old_id] = existing.id
            continue

        new_cat = Category(
            user_id=user.id,
            name=c_data["name"],
            type=c_data["type"],
            icon_name=c_data.get("icon_name", "tag"),
            color_hex=c_data.get("color_hex", "#6366f1"),
            is_default=c_data.get("is_default", False),
        )
        db.add(new_cat)
        db.commit()
        db.refresh(new_cat)
        if old_id:
            id_map_categories[old_id] = new_cat.id
        restored_cats += 1

    # 2. Restore Transactions
    restored_txs = 0
    for t_data in backup_data.get("transactions", []):
        cat_id = id_map_categories.get(t_data.get("category_id")) if t_data.get("category_id") else None
        tx = Transaction(
            user_id=user.id,
            category_id=cat_id,
            amount=Decimal(str(t_data["amount"])),
            type=t_data["type"],
            date=_parse_flexible_date(t_data["date"]) or date.today(),
            description=t_data.get("description", ""),
            is_recurring=t_data.get("is_recurring", False),
            tags=t_data.get("tags", []),
        )
        db.add(tx)
        restored_txs += 1

    # 3. Restore Budgets
    restored_budgets = 0
    for b_data in backup_data.get("budgets", []):
        cat_id = id_map_categories.get(b_data.get("category_id")) if b_data.get("category_id") else None
        if not cat_id:
            continue
        budget = Budget(
            user_id=user.id,
            category_id=cat_id,
            month=int(b_data["month"]),
            year=int(b_data["year"]),
            amount_limit=Decimal(str(b_data["amount_limit"])),
        )
        db.add(budget)
        restored_budgets += 1

    # 4. Restore Savings Goals
    restored_goals = 0
    for g_data in backup_data.get("savings_goals", []):
        goal_title = g_data.get("title") or g_data.get("name", "Savings Goal")
        goal = SavingsGoal(
            user_id=user.id,
            title=goal_title,
            target_amount=Decimal(str(g_data["target_amount"])),
            current_amount=Decimal(str(g_data.get("current_amount", "0.00"))),
            target_date=_parse_flexible_date(g_data.get("target_date")),
            is_completed=g_data.get("is_completed", False),
            notes=g_data.get("notes"),
        )
        db.add(goal)
        restored_goals += 1

    # 5. Restore Debts
    restored_debts = 0
    for d_data in backup_data.get("debts", []):
        debt = Debt(
            user_id=user.id,
            name=d_data["name"],
            total_principal=Decimal(str(d_data["total_principal"])),
            remaining_balance=Decimal(str(d_data["remaining_balance"])),
            interest_rate=Decimal(str(d_data.get("interest_rate", "0.000"))),
            minimum_payment=Decimal(str(d_data["minimum_payment"])),
            due_day_of_month=int(d_data.get("due_day_of_month", 1)),
            start_date=_parse_flexible_date(d_data.get("start_date")) or date.today(),
            estimated_payoff_date=_parse_flexible_date(d_data.get("estimated_payoff_date")),
            notes=d_data.get("notes"),
        )
        db.add(debt)
        restored_debts += 1

    # 6. Restore Council Decisions
    restored_decisions = 0
    for cd_data in backup_data.get("council_decisions", []):
        dec = CouncilDecision(
            user_id=user.id,
            question=cd_data["question"],
            decision_type=cd_data.get("decision_type", "general"),
            candidate_amount=Decimal(str(cd_data["candidate_amount"])) if cd_data.get("candidate_amount") else None,
            round1_votes=cd_data.get("round1_votes", {}),
            round2_votes=cd_data.get("round2_votes"),
            final_tally=cd_data.get("final_tally") or cd_data.get("tally", {}),
            guardrail_breach=cd_data.get("guardrail_breach") or cd_data.get("guardrail_violations", []),
            user_verdict=cd_data.get("user_verdict"),
            user_modifications=cd_data.get("user_modifications"),
        )
        db.add(dec)
        restored_decisions += 1

    db.commit()

    return {
        "success": True,
        "restored_categories": restored_cats,
        "restored_transactions": restored_txs,
        "restored_budgets": restored_budgets,
        "restored_savings_goals": restored_goals,
        "restored_debts": restored_debts,
        "restored_council_decisions": restored_decisions,
    }
