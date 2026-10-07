"""
Authentication, Registration, and User Settings API Endpoints.
"""
from fastapi import APIRouter, Depends, HTTPException, status, Response, Request
from sqlalchemy.orm import Session

from app.config import settings
from app.core.limiter import limiter
from app.core.dependencies import get_db, get_current_user, verify_csrf
from app.core.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    generate_csrf_token,
)
from app.db.init_db import seed_default_categories
from app.models.user import User
from app.schemas.auth import (
    UserRegister,
    UserLogin,
    ChangePasswordRequest,
    UserOut,
    UserSettingsUpdate,
    CSRFTokenOut,
    MessageResponse,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])


def _set_auth_cookies(response: Response, user_id: str, token_version: int = 1) -> str:
    """Helper to generate and attach session JWT and CSRF cookies."""
    token = create_access_token(data={"sub": user_id, "v": token_version})
    csrf_token = generate_csrf_token(user_id)

    # HttpOnly session cookie
    response.set_cookie(
        key=settings.AUTH_COOKIE_NAME,
        value=token,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        httponly=True,
        secure=settings.effective_cookie_secure,
        samesite=settings.COOKIE_SAMESITE,
        path="/",
    )

    # CSRF Token Cookie (readable by client script)
    response.set_cookie(
        key=settings.CSRF_COOKIE_NAME,
        value=csrf_token,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        httponly=False,
        secure=settings.effective_cookie_secure,
        samesite=settings.COOKIE_SAMESITE,
        path="/",
    )

    return csrf_token


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def register(payload: UserRegister, response: Response, db: Session = Depends(get_db)):
    """
    Register a user.
    - First user can register freely.
    - Subsequent registrations require an INVITE_CODE match.
    """
    user_count = db.query(User).count()

    if user_count > 0:
        # Subsequent registrations require a valid, non-blank INVITE_CODE configured in settings
        configured_invite = settings.INVITE_CODE.strip() if settings.INVITE_CODE else ""
        submitted_invite = payload.invite_code.strip() if payload.invite_code else ""

        if not configured_invite or not submitted_invite:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Registration is restricted. A valid non-blank invite code is required.",
            )

        import secrets
        if not secrets.compare_digest(submitted_invite, configured_invite):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Registration is restricted. Invalid invite code.",
            )

    # Check if email is already taken
    existing = db.query(User).filter(User.email == payload.email.lower().strip()).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email address already exists.",
        )

    # Create new user
    user = User(
        email=payload.email.lower().strip(),
        hashed_password=get_password_hash(payload.password),
        currency=payload.currency or settings.DEFAULT_CURRENCY,
        settings={
            "max_dti_ratio": settings.DEFAULT_MAX_DTI_RATIO,
            "min_runway_months": settings.DEFAULT_MIN_RUNWAY_MONTHS,
            "providers_enabled": {
                "gemini": bool(settings.GEMINI_API_KEY),
                "groq_1": bool(settings.GROQ_API_KEY),
                "groq_2": bool(settings.GROQ_API_KEY),
                "openrouter_1": bool(settings.OPENROUTER_API_KEY),
                "openrouter_2": bool(settings.OPENROUTER_API_KEY),
                "nvidia_1": bool(settings.NVIDIA_API_KEY),
                "nvidia_2": bool(settings.NVIDIA_API_KEY),
                "custom_1": False,
                "custom_2": False,
                "ollama": not settings.is_hosted,
            },
        },
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Seed default income and expense categories
    seed_default_categories(db, user.id)

    # Attach cookies
    _set_auth_cookies(response, user.id, token_version=user.token_version or 1)

    user_out = UserOut.model_validate(user)
    user_out.is_hosted = settings.is_hosted
    return user_out


@router.post("/login", response_model=UserOut)
@limiter.limit("10/minute")
async def login(
    request: Request,
    payload: UserLogin,
    response: Response,
    db: Session = Depends(get_db)
):
    """Rate-limited login endpoint setting secure HttpOnly session."""
    user = db.query(User).filter(User.email == payload.email.lower().strip()).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive.",
        )

    _set_auth_cookies(response, user.id, token_version=user.token_version or 1)

    user_out = UserOut.model_validate(user)
    user_out.is_hosted = settings.is_hosted
    return user_out


@router.post("/change-password", response_model=MessageResponse, dependencies=[Depends(verify_csrf)])
@limiter.limit("5/minute")
async def change_password(
    request: Request,
    payload: ChangePasswordRequest,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Securely change user password.
    - Requires active session & valid CSRF token.
    - Rate limited to 5 requests per minute.
    - Verifies current password.
    - Enforces min 12 chars and max 72 bytes.
    - Increments token_version to invalidate other active sessions.
    - Re-issues session cookies for the current client.
    - Never logs passwords.
    """
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect current password.",
        )

    # Hash new password
    current_user.hashed_password = get_password_hash(payload.new_password)
    # Increment token_version to invalidate all other active tokens
    current_user.token_version = (current_user.token_version or 1) + 1
    db.commit()
    db.refresh(current_user)

    # Refresh session cookies for the current caller so they stay authenticated
    _set_auth_cookies(response, current_user.id, token_version=current_user.token_version)

    return MessageResponse(message="Password changed successfully.")


@router.post("/logout", response_model=MessageResponse)
async def logout(response: Response):
    """Clear session and CSRF cookies."""
    response.delete_cookie(settings.AUTH_COOKIE_NAME, path="/")
    response.delete_cookie(settings.CSRF_COOKIE_NAME, path="/")
    return MessageResponse(message="Successfully logged out.")


@router.get("/me", response_model=UserOut)
async def get_current_user_profile(
    current_user: User = Depends(get_current_user),
    response: Response = None
):
    """Returns profile information and hosted status for the authenticated user."""
    # Ensure fresh CSRF cookie is set
    csrf_token = generate_csrf_token(current_user.id)
    if response:
        response.set_cookie(
            key=settings.CSRF_COOKIE_NAME,
            value=csrf_token,
            max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            httponly=False,
            secure=settings.COOKIE_SECURE,
            samesite=settings.COOKIE_SAMESITE,
            path="/",
        )

    user_out = UserOut.model_validate(current_user)
    user_out.is_hosted = settings.is_hosted
    return user_out


@router.get("/csrf", response_model=CSRFTokenOut)
async def get_csrf_token(current_user: User = Depends(get_current_user)):
    """Fetch or refresh the CSRF token for the authenticated user."""
    token = generate_csrf_token(current_user.id)
    return CSRFTokenOut(csrf_token=token)


@router.put("/settings", response_model=UserOut, dependencies=[Depends(verify_csrf)])
async def update_user_settings(
    payload: UserSettingsUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update user currency, financial guardrail thresholds, or model options."""
    if payload.currency:
        current_user.currency = payload.currency.upper()

    if payload.settings is not None:
        current_settings = dict(current_user.settings or {})
        current_settings.update(payload.settings)
        
        # If backend is hosted, force ollama to disabled in settings
        if settings.is_hosted and "providers_enabled" in current_settings:
            current_settings["providers_enabled"]["ollama"] = False

        current_user.settings = current_settings

    db.commit()
    db.refresh(current_user)

    user_out = UserOut.model_validate(current_user)
    user_out.is_hosted = settings.is_hosted
    return user_out
