"""
FastAPI Dependencies for Database Sessions, Authentication, and CSRF Validation.
"""
from typing import Optional
from fastapi import Depends, HTTPException, status, Request, Header
from sqlalchemy.orm import Session

from app.config import settings
from app.db.session import get_db_session
from app.models.user import User
from app.core.security import decode_access_token, verify_csrf_token


def get_db():
    """Dependency that yields a SQLAlchemy database session."""
    yield from get_db_session()


async def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(None)
) -> User:
    """
    Extracts authenticated user from HttpOnly session cookie or Authorization header.
    """
    token = request.cookies.get(settings.AUTH_COOKIE_NAME)
    
    # Optional header fallback for automated testing / curl
    if not token and authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1]

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please log in.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired or invalid. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id: str = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token payload.",
        )

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account not found.",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated.",
        )

    return user


async def verify_csrf(
    request: Request,
    current_user: User = Depends(get_current_user),
    x_csrf_token: Optional[str] = Header(None, alias="X-CSRF-Token")
):
    """
    CSRF verification dependency for state-mutating requests (POST, PUT, DELETE, PATCH).
    Validates cryptographic signature of the CSRF token.
    """
    if request.method in ("POST", "PUT", "DELETE", "PATCH"):
        # Exempt login, register, health, and cron endpoints
        path = request.url.path
        if path.endswith("/auth/login") or path.endswith("/auth/register") or "/cron/" in path or path.startswith("/health"):
            return True

        if not x_csrf_token:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Missing X-CSRF-Token header on mutation request.",
            )

        if not verify_csrf_token(x_csrf_token, current_user.id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invalid or expired CSRF token.",
            )
    return True
