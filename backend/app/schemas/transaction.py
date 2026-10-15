"""
Pydantic schemas for Transaction management with exact Decimal handling and sane constraints.
"""
from datetime import date as dt_date, datetime
from decimal import Decimal
from typing import Optional, List, Literal
from pydantic import BaseModel, Field, ConfigDict, field_validator
from app.schemas.category import CategoryOut

MAX_TRANSACTION_AMOUNT = Decimal("999999999999.99")


class TransactionBase(BaseModel):
    category_id: Optional[str] = None
    amount: Decimal = Field(..., gt=Decimal("0.00"), le=MAX_TRANSACTION_AMOUNT, decimal_places=2, description="Positive Decimal amount")
    type: Literal["income", "expense"]
    date: dt_date
    description: str = Field(..., min_length=1, max_length=255)
    is_recurring: bool = False
    tags: List[str] = Field(default_factory=list)
    client_id: Optional[str] = Field(None, max_length=36, description="Client-generated unique ID for offline sync idempotency")

    @field_validator("date", mode="before")
    @classmethod
    def validate_date_bounds(cls, v):
        if isinstance(v, str):
            clean_str = v.split("T")[0].strip()
            v = dt_date.fromisoformat(clean_str)
        if isinstance(v, dt_date) and (v.year < 1970 or v.year > 2100):
            raise ValueError("Transaction date must be between years 1970 and 2100.")
        return v


class TransactionCreate(TransactionBase):
    pass


class TransactionUpdate(BaseModel):
    category_id: Optional[str] = None
    amount: Optional[Decimal] = Field(None, gt=Decimal("0.00"), le=MAX_TRANSACTION_AMOUNT, decimal_places=2)
    type: Optional[Literal["income", "expense"]] = None
    date: Optional[dt_date] = None
    description: Optional[str] = Field(None, min_length=1, max_length=255)
    is_recurring: Optional[bool] = None
    tags: Optional[List[str]] = None

    @field_validator("date", mode="before")
    @classmethod
    def validate_date_bounds(cls, v):
        if v is None or v == "":
            return None
        if isinstance(v, str):
            clean_str = v.split("T")[0].strip()
            v = dt_date.fromisoformat(clean_str)
        if isinstance(v, dt_date) and (v.year < 1970 or v.year > 2100):
            raise ValueError("Transaction date must be between years 1970 and 2100.")
        return v

    @field_validator("amount", mode="before")
    @classmethod
    def parse_amount(cls, v):
        if v is None or v == "":
            return None
        dec = Decimal(str(v)).quantize(Decimal("0.01"))
        return dec


class TransactionOut(TransactionBase):
    id: str
    user_id: str
    created_at: datetime
    category: Optional[CategoryOut] = None

    model_config = ConfigDict(from_attributes=True)


class TransactionListResponse(BaseModel):
    items: List[TransactionOut]
    total_count: int
    total_income: Decimal
    total_expense: Decimal
    net_amount: Decimal
    limit: int
    offset: int
