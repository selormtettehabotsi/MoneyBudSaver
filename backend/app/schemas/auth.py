"""
Pydantic schemas for Authentication, Registration, and User Profile.
Validates max 72-byte passwords and sanity checks.
"""
from datetime import datetime
from typing import Optional, Dict, Any
from pydantic import BaseModel, EmailStr, Field, ConfigDict, field_validator


class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, description="Password must be at least 8 characters")
    invite_code: Optional[str] = Field(None, description="Invite code required if not the first registered user")
    currency: Optional[str] = Field("GHS", max_length=10)

    @field_validator("password")
    @classmethod
    def validate_password_byte_length(cls, v: str) -> str:
        if len(v.encode("utf-8")) > 72:
            raise ValueError("Password must not exceed 72 bytes.")
        return v


class UserLogin(BaseModel):
    email: EmailStr
    password: str

    @field_validator("password")
    @classmethod
    def validate_password_byte_length(cls, v: str) -> str:
        if len(v.encode("utf-8")) > 72:
            raise ValueError("Password must not exceed 72 bytes.")
        return v


class UserSettingsUpdate(BaseModel):
    currency: Optional[str] = Field(None, max_length=10)
    settings: Optional[Dict[str, Any]] = None


class UserOut(BaseModel):
    id: str
    email: str
    currency: str
    is_active: bool
    created_at: datetime
    settings: Dict[str, Any]
    is_hosted: bool = False

    model_config = ConfigDict(from_attributes=True)


class CSRFTokenOut(BaseModel):
    csrf_token: str


class MessageResponse(BaseModel):
    message: str
    status: str = "success"
