"""
Pydantic schemas for Savings Goal tracking.
"""
from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict


class SavingsGoalBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=150)
    target_amount: Decimal = Field(..., gt=0, decimal_places=2)
    current_amount: Decimal = Field(Decimal("0.00"), ge=0, decimal_places=2)
    target_date: Optional[date] = None
    notes: Optional[str] = None


class SavingsGoalCreate(SavingsGoalBase):
    pass


class SavingsGoalUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=150)
    target_amount: Optional[Decimal] = Field(None, gt=0, decimal_places=2)
    current_amount: Optional[Decimal] = Field(None, ge=0, decimal_places=2)
    target_date: Optional[date] = None
    notes: Optional[str] = None
    is_completed: Optional[bool] = None


class SavingsGoalAdjust(BaseModel):
    amount: Decimal = Field(..., decimal_places=2, description="Positive to deposit, negative to withdraw")
    notes: Optional[str] = None


class SavingsGoalOut(SavingsGoalBase):
    id: str
    user_id: str
    is_completed: bool
    progress_percentage: float
    remaining_amount: Decimal
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
