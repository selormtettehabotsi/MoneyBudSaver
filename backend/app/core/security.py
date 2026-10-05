"""
Security utilities: Direct Bcrypt password hashing, JWT issuance and verification, CSRF token validation.
Enforces strict 72-byte maximum password length for bcrypt security.
"""
import hmac
import hashlib
import time
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional
import bcrypt
from jose import jwt, JWTError

from app.config import settings

MAX_PASSWORD_BYTES = 72


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify plain password against hashed password using native bcrypt."""
    if not plain_password or not hashed_password:
        return False
    pwd_bytes = plain_password.encode("utf-8")
    if len(pwd_bytes) > MAX_PASSWORD_BYTES:
        return False
    try:
        hash_bytes = hashed_password.encode("utf-8")
        return bcrypt.checkpw(pwd_bytes, hash_bytes)
    except Exception:
        return False


def get_password_hash(password: str) -> str:
    """Generate secure bcrypt hash from plain password, verifying byte limit."""
    pwd_bytes = password.encode("utf-8")
    if len(pwd_bytes) > MAX_PASSWORD_BYTES:
        raise ValueError(f"Password exceeds maximum length of {MAX_PASSWORD_BYTES} bytes.")
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pwd_bytes, salt).decode("utf-8")


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create signed JWT access token."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire, "iat": datetime.now(timezone.utc)})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt


def decode_access_token(token: str) -> Optional[dict]:
    """Decode and validate a JWT access token."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError:
        return None


# CSRF Token Generator & Verifier (HMAC-SHA256 based)
def generate_csrf_token(user_id: str) -> str:
    """Generate a signed, timed CSRF token for a user."""
    timestamp = str(int(time.time()))
    nonce = secrets.token_hex(8)
    message = f"{user_id}:{timestamp}:{nonce}"
    signature = hmac.new(
        settings.SECRET_KEY.encode("utf-8"),
        message.encode("utf-8"),
        hashlib.sha256
    ).hexdigest()
    return f"{signature}.{message}"


def verify_csrf_token(token: str, user_id: str, max_age_seconds: int = 86400 * 7) -> bool:
    """Verify that a CSRF token matches the signature and user_id within expiration."""
    if not token or "." not in token:
        return False
    try:
        signature, message = token.split(".", 1)
        parts = message.split(":")
        if len(parts) != 3:
            return False
        token_user_id, timestamp_str, _ = parts
        if token_user_id != user_id:
            return False
        
        timestamp = int(timestamp_str)
        if int(time.time()) - timestamp > max_age_seconds:
            return False

        expected_sig = hmac.new(
            settings.SECRET_KEY.encode("utf-8"),
            message.encode("utf-8"),
            hashlib.sha256
        ).hexdigest()

        return hmac.compare_digest(signature, expected_sig)
    except Exception:
        return False
