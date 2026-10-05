"""
Budget Management and Budget vs Actual API Endpoints.
"""
from datetime import date
from decimal import Decimal
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import func, extract

from app.core.dependencies import get_db, get_current_user, verify_csrf
from app.models.user import User
from app.models.budget import Budget
from app.models.category import Category
from app.models.transaction import Transaction
from app.schemas.budget import BudgetCreate, BudgetUpdate, BudgetOut, BudgetProgressOut
from app.services.financial_math import round_decimal

router = APIRouter(prefix="/budgets", tags=["Budgets"])


@router.get("", response_model=List[BudgetProgressOut])
async def list_budgets(
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None, ge=2000, le=2100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Retrieve all budgets for a given month and year with real-time actual spending,
    remaining budget balance, and over-budget status.
    """
    today = date.today()
    target_month = month or today.month
    target_year = year or today.year

    # Fetch all user budgets for target period
    budgets = (
        db.query(Budget)
        .filter(
            Budget.user_id == current_user.id,
            Budget.month == target_month,
            Budget.year == target_year,
        )
        .all()
    )

    result = []
    for b in budgets:
        cat = db.query(Category).filter(Category.id == b.category_id).first()
        cat_name = cat.name if cat else "Uncategorized"
        cat_color = cat.color_hex if cat else "#6366f1"
        cat_icon = cat.icon_name if cat else "tag"

        # Calculate actual spent in this category for this month/year
        actual_spent = (
            db.query(func.sum(Transaction.amount))
            .filter(
                Transaction.user_id == current_user.id,
                Transaction.category_id == b.category_id,
                Transaction.type == "expense",
                extract("month", Transaction.date) == target_month,
                extract("year", Transaction.date) == target_year,
            )
            .scalar()
        ) or Decimal("0.00")

        actual_spent_dec = Decimal(str(actual_spent))
        limit_dec = b.amount_limit
        remaining = limit_dec - actual_spent_dec
        pct = float(round_decimal((actual_spent_dec / limit_dec) * Decimal("100.0"), 1)) if limit_dec > 0 else 0.0

        result.append(
            BudgetProgressOut(
                id=b.id,
                category_id=b.category_id,
                category_name=cat_name,
                category_color=cat_color,
                category_icon=cat_icon,
                month=b.month,
                year=b.year,
                amount_limit=limit_dec,
                actual_spent=actual_spent_dec,
                remaining_budget=remaining,
                percentage_used=pct,
                is_over_budget=actual_spent_dec > limit_dec,
            )
        )

    return result


@router.post("", response_model=BudgetOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(verify_csrf)])
async def create_or_update_budget(
    payload: BudgetCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create or upsert a monthly budget limit for a category."""
    category = (
        db.query(Category)
        .filter(Category.id == payload.category_id, Category.user_id == current_user.id)
        .first()
    )
    if not category:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid category ID.")

    existing = (
        db.query(Budget)
        .filter(
            Budget.user_id == current_user.id,
            Budget.category_id == payload.category_id,
            Budget.month == payload.month,
            Budget.year == payload.year,
        )
        .first()
    )

    if existing:
        existing.amount_limit = payload.amount_limit
        db.commit()
        db.refresh(existing)
        return existing

    budget = Budget(
        user_id=current_user.id,
        category_id=payload.category_id,
        month=payload.month,
        year=payload.year,
        amount_limit=payload.amount_limit,
    )
    db.add(budget)
    db.commit()
    db.refresh(budget)
    return budget


@router.put("/{budget_id}", response_model=BudgetOut, dependencies=[Depends(verify_csrf)])
async def update_budget(
    budget_id: str,
    payload: BudgetUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update an existing budget amount limit."""
    budget = (
        db.query(Budget)
        .filter(Budget.id == budget_id, Budget.user_id == current_user.id)
        .first()
    )
    if not budget:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Budget not found.")

    budget.amount_limit = payload.amount_limit
    db.commit()
    db.refresh(budget)
    return budget


@router.delete("/{budget_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(verify_csrf)])
async def delete_budget(
    budget_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a budget."""
    budget = (
        db.query(Budget)
        .filter(Budget.id == budget_id, Budget.user_id == current_user.id)
        .first()
    )
    if not budget:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Budget not found.")

    db.delete(budget)
    db.commit()
    return None
