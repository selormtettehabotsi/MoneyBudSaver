"""
Pydantic schemas for Debts and Loans management.
"""
from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict


class DebtBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=150)
    total_principal: Decimal = Field(..., gt=0, decimal_places=2)
    remaining_balance: Decimal = Field(..., ge=0, decimal_places=2)
    interest_rate: Decimal = Field(Decimal("0.000"), ge=0, decimal_places=3, description="Annual percentage rate, e.g. 15.5")
    minimum_payment: Decimal = Field(..., gt=0, decimal_places=2)
    due_day_of_month: int = Field(1, ge=1, le=31)
    start_date: date
    estimated_payoff_date: Optional[date] = None
    notes: Optional[str] = None


class DebtCreate(DebtBase):
    pass


class DebtUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=150)
    total_principal: Optional[Decimal] = Field(None, gt=0, decimal_places=2)
    remaining_balance: Optional[Decimal] = Field(None, ge=0, decimal_places=2)
    interest_rate: Optional[Decimal] = Field(None, ge=0, decimal_places=3)
    minimum_payment: Optional[Decimal] = Field(None, gt=0, decimal_places=2)
    due_day_of_month: Optional[int] = Field(None, ge=1, le=31)
    start_date: Optional[date] = None
    estimated_payoff_date: Optional[date] = None
    notes: Optional[str] = None


class DebtPayment(BaseModel):
    payment_amount: Decimal = Field(..., gt=0, decimal_places=2)
    payment_date: Optional[date] = None
    notes: Optional[str] = None


class DebtOut(DebtBase):
    id: str
    user_id: str
    payoff_progress_percentage: float
    months_to_payoff: Optional[int] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
