"""
Transaction CRUD API Endpoints with Filtering, Search, Pagination, and User Isolation.
"""
from datetime import date
from decimal import Decimal
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func

from app.core.dependencies import get_db, get_current_user, verify_csrf
from app.models.user import User
from app.models.transaction import Transaction
from app.models.category import Category
from app.schemas.transaction import (
    TransactionCreate,
    TransactionUpdate,
    TransactionOut,
    TransactionListResponse,
)

router = APIRouter(prefix="/transactions", tags=["Transactions"])


@router.get("", response_model=TransactionListResponse)
async def list_transactions(
    category_id: Optional[str] = Query(None),
    type: Optional[str] = Query(None, pattern="^(income|expense)$"),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    search: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieve transactions strictly isolated to current user with search, category filtering, date ranges, and pagination."""
    query = db.query(Transaction).filter(Transaction.user_id == current_user.id)

    if category_id:
        query = query.filter(Transaction.category_id == category_id)
    if type:
        query = query.filter(Transaction.type == type)
    if start_date:
        query = query.filter(Transaction.date >= start_date)
    if end_date:
        query = query.filter(Transaction.date <= end_date)
    if search:
        query = query.filter(Transaction.description.ilike(f"%{search.strip()}%"))

    # Compute overall totals for current filter selection
    total_count = query.count()

    total_income = (
        db.query(func.sum(Transaction.amount))
        .filter(
            Transaction.user_id == current_user.id,
            Transaction.type == "income",
            (Transaction.category_id == category_id) if category_id else True,
            (Transaction.date >= start_date) if start_date else True,
            (Transaction.date <= end_date) if end_date else True,
            (Transaction.description.ilike(f"%{search.strip()}%")) if search else True,
        )
        .scalar()
    ) or Decimal("0.00")

    total_expense = (
        db.query(func.sum(Transaction.amount))
        .filter(
            Transaction.user_id == current_user.id,
            Transaction.type == "expense",
            (Transaction.category_id == category_id) if category_id else True,
            (Transaction.date >= start_date) if start_date else True,
            (Transaction.date <= end_date) if end_date else True,
            (Transaction.description.ilike(f"%{search.strip()}%")) if search else True,
        )
        .scalar()
    ) or Decimal("0.00")

    total_income_dec = Decimal(str(total_income))
    total_expense_dec = Decimal(str(total_expense))
    net_amount = total_income_dec - total_expense_dec

    items = (
        query.options(joinedload(Transaction.category))
        .order_by(Transaction.date.desc(), Transaction.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    return TransactionListResponse(
        items=items,
        total_count=total_count,
        total_income=total_income_dec,
        total_expense=total_expense_dec,
        net_amount=net_amount,
        limit=limit,
        offset=offset,
    )


@router.post("", response_model=TransactionOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(verify_csrf)])
async def create_transaction(
    payload: TransactionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new income or expense transaction with idempotency support via client_id."""
    # Idempotency check for offline sync replays
    if payload.client_id:
        existing = (
            db.query(Transaction)
            .options(joinedload(Transaction.category))
            .filter(
                Transaction.user_id == current_user.id,
                Transaction.client_id == payload.client_id,
            )
            .first()
        )
        if existing:
            return existing

    if payload.category_id:
        category = (
            db.query(Category)
            .filter(Category.id == payload.category_id, Category.user_id == current_user.id)
            .first()
        )
        if not category:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid category ID.")

    transaction = Transaction(
        user_id=current_user.id,
        category_id=payload.category_id,
        amount=payload.amount,
        type=payload.type,
        date=payload.date,
        description=payload.description.strip(),
        is_recurring=payload.is_recurring,
        tags=payload.tags,
        client_id=payload.client_id,
    )
    db.add(transaction)
    db.commit()
    db.refresh(transaction)
    return transaction


@router.get("/{transaction_id}", response_model=TransactionOut)
async def get_transaction(
    transaction_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get single transaction by ID with user isolation (returns 404 if belonging to another user)."""
    transaction = (
        db.query(Transaction)
        .options(joinedload(Transaction.category))
        .filter(Transaction.id == transaction_id, Transaction.user_id == current_user.id)
        .first()
    )
    if not transaction:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found.")
    return transaction


@router.put("/{transaction_id}", response_model=TransactionOut, dependencies=[Depends(verify_csrf)])
async def update_transaction(
    transaction_id: str,
    payload: TransactionUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update an existing transaction with user isolation (returns 404 if belonging to another user)."""
    transaction = (
        db.query(Transaction)
        .filter(Transaction.id == transaction_id, Transaction.user_id == current_user.id)
        .first()
    )
    if not transaction:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found.")

    if payload.category_id is not None:
        if payload.category_id != "":
            category = (
                db.query(Category)
                .filter(Category.id == payload.category_id, Category.user_id == current_user.id)
                .first()
            )
            if not category:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid category ID.")
            transaction.category_id = payload.category_id
        else:
            transaction.category_id = None

    if payload.amount is not None:
        transaction.amount = payload.amount
    if payload.type is not None:
        transaction.type = payload.type
    if payload.date is not None:
        transaction.date = payload.date
    if payload.description is not None:
        transaction.description = payload.description.strip()
    if payload.is_recurring is not None:
        transaction.is_recurring = payload.is_recurring
    if payload.tags is not None:
        transaction.tags = payload.tags

    db.commit()
    db.refresh(transaction)
    return transaction


@router.delete("/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(verify_csrf)])
async def delete_transaction(
    transaction_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a transaction with user isolation (returns 404 if belonging to another user)."""
    transaction = (
        db.query(Transaction)
        .filter(Transaction.id == transaction_id, Transaction.user_id == current_user.id)
        .first()
    )
    if not transaction:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found.")

    db.delete(transaction)
    db.commit()
    return None
