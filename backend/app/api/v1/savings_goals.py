"""
Savings Goals CRUD and Progress Adjustment API Endpoints.
"""
from decimal import Decimal
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_db, get_current_user, verify_csrf
from app.models.user import User
from app.models.savings_goal import SavingsGoal
from app.schemas.savings_goal import (
    SavingsGoalCreate,
    SavingsGoalUpdate,
    SavingsGoalAdjust,
    SavingsGoalOut,
)
from app.services.financial_math import round_decimal

router = APIRouter(prefix="/savings-goals", tags=["Savings Goals"])


def _build_goal_out(goal: SavingsGoal) -> SavingsGoalOut:
    """Helper to compute progress and remaining amounts for a savings goal."""
    target = goal.target_amount
    current = goal.current_amount
    remaining = max(Decimal("0.00"), target - current)
    pct = float(round_decimal((current / target) * Decimal("100.0"), 1)) if target > 0 else 100.0

    return SavingsGoalOut(
        id=goal.id,
        user_id=goal.user_id,
        title=goal.title,
        target_amount=target,
        current_amount=current,
        target_date=goal.target_date,
        notes=goal.notes,
        is_completed=goal.is_completed or (current >= target),
        progress_percentage=min(100.0, pct),
        remaining_amount=remaining,
        created_at=goal.created_at,
    )


@router.get("", response_model=List[SavingsGoalOut])
async def list_savings_goals(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieve all savings goals with calculated progress and remaining amounts."""
    goals = (
        db.query(SavingsGoal)
        .filter(SavingsGoal.user_id == current_user.id)
        .order_by(SavingsGoal.is_completed.asc(), SavingsGoal.created_at.desc())
        .all()
    )
    return [_build_goal_out(g) for g in goals]


@router.post("", response_model=SavingsGoalOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(verify_csrf)])
async def create_savings_goal(
    payload: SavingsGoalCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new savings goal."""
    goal = SavingsGoal(
        user_id=current_user.id,
        title=payload.title.strip(),
        target_amount=payload.target_amount,
        current_amount=payload.current_amount,
        target_date=payload.target_date,
        notes=payload.notes,
        is_completed=payload.current_amount >= payload.target_amount,
    )
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return _build_goal_out(goal)


@router.put("/{goal_id}", response_model=SavingsGoalOut, dependencies=[Depends(verify_csrf)])
async def update_savings_goal(
    goal_id: str,
    payload: SavingsGoalUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update a savings goal."""
    goal = (
        db.query(SavingsGoal)
        .filter(SavingsGoal.id == goal_id, SavingsGoal.user_id == current_user.id)
        .first()
    )
    if not goal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Savings goal not found.")

    if payload.title is not None:
        goal.title = payload.title.strip()
    if payload.target_amount is not None:
        goal.target_amount = payload.target_amount
    if payload.current_amount is not None:
        goal.current_amount = payload.current_amount
    if payload.target_date is not None:
        goal.target_date = payload.target_date
    if payload.notes is not None:
        goal.notes = payload.notes
    if payload.is_completed is not None:
        goal.is_completed = payload.is_completed

    if goal.current_amount >= goal.target_amount:
        goal.is_completed = True

    db.commit()
    db.refresh(goal)
    return _build_goal_out(goal)


@router.post("/{goal_id}/adjust", response_model=SavingsGoalOut, dependencies=[Depends(verify_csrf)])
async def adjust_savings_goal_balance(
    goal_id: str,
    payload: SavingsGoalAdjust,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Deposit (positive) or withdraw (negative) funds towards a savings goal."""
    goal = (
        db.query(SavingsGoal)
        .filter(SavingsGoal.id == goal_id, SavingsGoal.user_id == current_user.id)
        .first()
    )
    if not goal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Savings goal not found.")

    new_amount = goal.current_amount + payload.amount
    if new_amount < Decimal("0.00"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot withdraw more than current saved balance.",
        )

    goal.current_amount = new_amount
    if goal.current_amount >= goal.target_amount:
        goal.is_completed = True
    else:
        goal.is_completed = False

    db.commit()
    db.refresh(goal)
    return _build_goal_out(goal)


@router.delete("/{goal_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(verify_csrf)])
async def delete_savings_goal(
    goal_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a savings goal."""
    goal = (
        db.query(SavingsGoal)
        .filter(SavingsGoal.id == goal_id, SavingsGoal.user_id == current_user.id)
        .first()
    )
    if not goal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Savings goal not found.")

    db.delete(goal)
    db.commit()
    return None
