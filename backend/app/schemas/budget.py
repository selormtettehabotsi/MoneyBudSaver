"""
Pydantic schemas for Budget management and Budget vs Actual tracking.
"""
from datetime import datetime
from decimal import Decimal
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict
from app.schemas.category import CategoryOut


class BudgetBase(BaseModel):
    category_id: str
    month: int = Field(..., ge=1, le=12)
    year: int = Field(..., ge=2000, le=2100)
    amount_limit: Decimal = Field(..., gt=0, decimal_places=2)


class BudgetCreate(BudgetBase):
    pass


class BudgetUpdate(BaseModel):
    amount_limit: Decimal = Field(..., gt=0, decimal_places=2)


class BudgetOut(BudgetBase):
    id: str
    user_id: str
    created_at: datetime
    category: Optional[CategoryOut] = None

    model_config = ConfigDict(from_attributes=True)


class BudgetProgressOut(BaseModel):
    id: str
    category_id: str
    category_name: str
    category_color: str
    category_icon: str
    month: int
    year: int
    amount_limit: Decimal
    actual_spent: Decimal
    remaining_budget: Decimal
    percentage_used: float
    is_over_budget: bool
