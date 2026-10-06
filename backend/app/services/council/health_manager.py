"""
AI Council Health and Fallback Manager.
Handles provider circuit breaking (skip for 10 minutes on 3 consecutive failures),
and persists 7-day parameter fallback records ('thinking control not supported') in the database.
"""
from datetime import datetime, timezone, timedelta
from typing import Optional, Tuple, Dict, Any
from sqlalchemy.orm import Session

from app.models.council import ProviderCircuitBreaker, ProviderParamFallback
from app.services.council.base_adapter import _UNSUPPORTED_THINKING_PROVIDERS


def is_circuit_breaker_active(
    db: Session,
    provider_name: str,
) -> Tuple[bool, Optional[str], Optional[int]]:
    """
    Checks whether a provider's circuit breaker is currently tripped.
    Returns: (is_active, last_failure_reason, seconds_remaining)
    Auto-resets if the 10-minute cooldown period has expired.
    """
    p_name = provider_name.lower().strip()
    cb = db.query(ProviderCircuitBreaker).filter(ProviderCircuitBreaker.provider_name == p_name).first()
    if not cb or not cb.is_tripped:
        return False, None, None

    now = datetime.now(timezone.utc)
    tripped_until = cb.tripped_until
    if tripped_until:
        if tripped_until.tzinfo is None:
            tripped_until = tripped_until.replace(tzinfo=timezone.utc)
        if now >= tripped_until:
            # Cooldown period expired, auto-heal
            cb.is_tripped = False
            cb.consecutive_failures = 0
            cb.tripped_until = None
            cb.updated_at = now
            db.commit()
            return False, None, None
        
        remaining_secs = max(1, int((tripped_until - now).total_seconds()))
        return True, cb.last_failure_reason, remaining_secs

    return False, None, None


def record_provider_test_result(
    db: Session,
    provider_name: str,
    test_result: Dict[str, Any],
) -> None:
    """
    Persists the last test connection result without affecting the circuit breaker
    consecutive failure counter (test button calls must not trip the breaker).
    """
    p_name = provider_name.lower().strip()
    now = datetime.now(timezone.utc)
    cb = db.query(ProviderCircuitBreaker).filter(ProviderCircuitBreaker.provider_name == p_name).first()
    if not cb:
        cb = ProviderCircuitBreaker(
            provider_name=p_name,
            consecutive_failures=0,
            is_tripped=False,
            last_test_result=test_result,
            updated_at=now,
        )
        db.add(cb)
    else:
        cb.last_test_result = test_result
        cb.updated_at = now
    db.commit()


def record_provider_success(
    db: Session,
    provider_name: str,
    test_result: Optional[Dict[str, Any]] = None,
) -> None:
    """Records a successful response/test for a provider, resetting all failure counters."""
    p_name = provider_name.lower().strip()
    now = datetime.now(timezone.utc)
    cb = db.query(ProviderCircuitBreaker).filter(ProviderCircuitBreaker.provider_name == p_name).first()
    if not cb:
        cb = ProviderCircuitBreaker(
            provider_name=p_name,
            consecutive_failures=0,
            is_tripped=False,
            last_test_result=test_result,
            updated_at=now,
        )
        db.add(cb)
    else:
        cb.consecutive_failures = 0
        cb.is_tripped = False
        cb.tripped_until = None
        cb.last_failure_reason = None
        if test_result is not None:
            cb.last_test_result = test_result
        cb.updated_at = now
    db.commit()


def record_provider_failure(
    db: Session,
    provider_name: str,
    reason: str,
    test_result: Optional[Dict[str, Any]] = None,
    retry_after_seconds: Optional[int] = None,
) -> bool:
    """
    Records a real Council provider failure (timeout, 5xx, or severe rate limit).
    If reason is rate_limited and retry_after_seconds is under 60 seconds,
    it is treated as a short wait rather than a failure (not counted towards the 3-failure threshold).
    If consecutive failures reach 3, trips the circuit breaker for 10 minutes.
    Returns True if the circuit breaker is now tripped.
    """
    if reason == "rate_limited" and retry_after_seconds is not None and retry_after_seconds < 60:
        return False

    p_name = provider_name.lower().strip()
    now = datetime.now(timezone.utc)
    cb = db.query(ProviderCircuitBreaker).filter(ProviderCircuitBreaker.provider_name == p_name).first()
    if not cb:
        cb = ProviderCircuitBreaker(
            provider_name=p_name,
            consecutive_failures=1,
            last_failure_reason=reason,
            last_failure_at=now,
            is_tripped=False,
            last_test_result=test_result,
            updated_at=now,
        )
        db.add(cb)
    else:
        cb.consecutive_failures += 1
        cb.last_failure_reason = reason
        cb.last_failure_at = now
        if test_result is not None:
            cb.last_test_result = test_result
        cb.updated_at = now

        if cb.consecutive_failures >= 3:
            cb.is_tripped = True
            cb.tripped_until = now + timedelta(minutes=10)

    db.commit()
    return cb.is_tripped


def reset_circuit_breaker(
    db: Session,
    provider_name: str,
) -> None:
    """Manually resets a tripped circuit breaker (e.g. via 'Retry now' button)."""
    p_name = provider_name.lower().strip()
    now = datetime.now(timezone.utc)
    cb = db.query(ProviderCircuitBreaker).filter(ProviderCircuitBreaker.provider_name == p_name).first()
    if cb:
        cb.consecutive_failures = 0
        cb.is_tripped = False
        cb.tripped_until = None
        cb.updated_at = now
        db.commit()


def get_thinking_support_db(
    db: Session,
    provider_name: str,
    model_id: str,
) -> Optional[bool]:
    """
    Retrieves the persisted parameter fallback status from the database with 7-day expiry.
    Returns False if thinking/reasoning control is known to be unsupported, True if supported, or None if unrecorded/expired.
    """
    p_name = provider_name.lower().strip()
    m_id = model_id.strip()
    now = datetime.now(timezone.utc)

    record = db.query(ProviderParamFallback).filter(
        ProviderParamFallback.provider_name == p_name,
        ProviderParamFallback.model_id == m_id,
    ).first()

    if not record:
        return None

    exp = record.expires_at
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)

    if now >= exp:
        # Expired after 7 days
        db.delete(record)
        db.commit()
        return None

    # Sync into process memory cache as well
    if not record.thinking_supported:
        _UNSUPPORTED_THINKING_PROVIDERS.add(p_name)

    return record.thinking_supported


def record_thinking_support_db(
    db: Session,
    provider_name: str,
    model_id: str,
    supported: bool,
) -> None:
    """
    Persists parameter support status in the database with a 7-day expiry.
    """
    p_name = provider_name.lower().strip()
    m_id = model_id.strip()
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(days=7)

    record = db.query(ProviderParamFallback).filter(
        ProviderParamFallback.provider_name == p_name,
        ProviderParamFallback.model_id == m_id,
    ).first()

    if record:
        record.thinking_supported = supported
        record.last_checked_at = now
        record.expires_at = expires_at
        record.updated_at = now
    else:
        record = ProviderParamFallback(
            provider_name=p_name,
            model_id=m_id,
            thinking_supported=supported,
            last_checked_at=now,
            expires_at=expires_at,
            updated_at=now,
        )
        db.add(record)

    db.commit()

    if not supported:
        _UNSUPPORTED_THINKING_PROVIDERS.add(p_name)
    else:
        _UNSUPPORTED_THINKING_PROVIDERS.discard(p_name)
