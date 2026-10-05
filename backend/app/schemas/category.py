"""
Pydantic schemas for Category management.
"""
from datetime import datetime
from typing import Optional, Literal
from pydantic import BaseModel, Field, ConfigDict


class CategoryBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    type: Literal["income", "expense"]
    icon_name: str = Field("tag", max_length=50)
    color_hex: str = Field("#6366f1", max_length=20)


class CategoryCreate(CategoryBase):
    pass


class CategoryUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    type: Optional[Literal["income", "expense"]] = None
    icon_name: Optional[str] = Field(None, max_length=50)
    color_hex: Optional[str] = Field(None, max_length=20)


class CategoryOut(CategoryBase):
    id: str
    user_id: str
    is_default: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
