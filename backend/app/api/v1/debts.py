"""
Debts, Loans, and Payment Tracking API Endpoints.
"""
from datetime import date, timedelta
from decimal import Decimal
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_db, get_current_user, verify_csrf
from app.models.user import User
from app.models.debt import Debt
from app.schemas.debt import DebtCreate, DebtUpdate, DebtPayment, DebtOut
from app.services.financial_math import calculate_loan_payoff_months, round_decimal

router = APIRouter(prefix="/debts", tags=["Debts & Loans"])


def _build_debt_out(debt: Debt) -> DebtOut:
    """Helper to compute amortization months, payoff percentage, and estimated payoff date."""
    principal = debt.total_principal
    balance = debt.remaining_balance
    paid_off = max(Decimal("0.00"), principal - balance)
    pct = float(round_decimal((paid_off / principal) * Decimal("100.0"), 1)) if principal > 0 else 100.0

    months_left, _ = calculate_loan_payoff_months(
        remaining_balance=balance,
        annual_interest_rate_pct=debt.interest_rate,
        monthly_payment=debt.minimum_payment,
    )

    estimated_payoff = debt.estimated_payoff_date
    if months_left is not None and months_left > 0:
        # Approximate payoff date from today
        estimated_payoff = date.today() + timedelta(days=months_left * 30)

    return DebtOut(
        id=debt.id,
        user_id=debt.user_id,
        name=debt.name,
        total_principal=principal,
        remaining_balance=balance,
        interest_rate=debt.interest_rate,
        minimum_payment=debt.minimum_payment,
        due_day_of_month=debt.due_day_of_month,
        start_date=debt.start_date,
        estimated_payoff_date=estimated_payoff,
        notes=debt.notes,
        payoff_progress_percentage=min(100.0, pct),
        months_to_payoff=months_left,
        created_at=debt.created_at,
    )


@router.get("", response_model=List[DebtOut])
async def list_debts(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieve all debts with payoff timeline, calculated months to payoff, and progress."""
    debts = (
        db.query(Debt)
        .filter(Debt.user_id == current_user.id)
        .order_by(Debt.remaining_balance.desc(), Debt.created_at.desc())
        .all()
    )
    return [_build_debt_out(d) for d in debts]


@router.post("", response_model=DebtOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(verify_csrf)])
async def create_debt(
    payload: DebtCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new debt or loan record."""
    debt = Debt(
        user_id=current_user.id,
        name=payload.name.strip(),
        total_principal=payload.total_principal,
        remaining_balance=payload.remaining_balance,
        interest_rate=payload.interest_rate,
        minimum_payment=payload.minimum_payment,
        due_day_of_month=payload.due_day_of_month,
        start_date=payload.start_date,
        estimated_payoff_date=payload.estimated_payoff_date,
        notes=payload.notes,
    )
    db.add(debt)
    db.commit()
    db.refresh(debt)
    return _build_debt_out(debt)


@router.put("/{debt_id}", response_model=DebtOut, dependencies=[Depends(verify_csrf)])
async def update_debt(
    debt_id: str,
    payload: DebtUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update an existing debt or loan."""
    debt = (
        db.query(Debt)
        .filter(Debt.id == debt_id, Debt.user_id == current_user.id)
        .first()
    )
    if not debt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Debt record not found.")

    if payload.name is not None:
        debt.name = payload.name.strip()
    if payload.total_principal is not None:
        debt.total_principal = payload.total_principal
    if payload.remaining_balance is not None:
        debt.remaining_balance = payload.remaining_balance
    if payload.interest_rate is not None:
        debt.interest_rate = payload.interest_rate
    if payload.minimum_payment is not None:
        debt.minimum_payment = payload.minimum_payment
    if payload.due_day_of_month is not None:
        debt.due_day_of_month = payload.due_day_of_month
    if payload.start_date is not None:
        debt.start_date = payload.start_date
    if payload.estimated_payoff_date is not None:
        debt.estimated_payoff_date = payload.estimated_payoff_date
    if payload.notes is not None:
        debt.notes = payload.notes

    db.commit()
    db.refresh(debt)
    return _build_debt_out(debt)


@router.post("/{debt_id}/payment", response_model=DebtOut, dependencies=[Depends(verify_csrf)])
async def record_debt_payment(
    debt_id: str,
    payload: DebtPayment,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Record a payment towards a debt balance."""
    debt = (
        db.query(Debt)
        .filter(Debt.id == debt_id, Debt.user_id == current_user.id)
        .first()
    )
    if not debt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Debt record not found.")

    new_balance = max(Decimal("0.00"), debt.remaining_balance - payload.payment_amount)
    debt.remaining_balance = new_balance

    db.commit()
    db.refresh(debt)
    return _build_debt_out(debt)


@router.delete("/{debt_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(verify_csrf)])
async def delete_debt(
    debt_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a debt record."""
    debt = (
        db.query(Debt)
        .filter(Debt.id == debt_id, Debt.user_id == current_user.id)
        .first()
    )
    if not debt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Debt record not found.")

    db.delete(debt)
    db.commit()
    return None
