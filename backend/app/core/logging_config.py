"""
Logging Security Configuration.
Ensures httpx, httpcore, uvicorn, and application loggers redact all sensitive tokens,
API keys, Authorization headers, and query parameters containing keys at all log levels.
"""
import logging
from typing import Any
from app.core.security import redact_sensitive_info


class SensitiveDataRedactingFilter(logging.Filter):
    """
    Logging filter that intercepts all log records across all loggers,
    redacting API keys, bearer tokens, passwords, and sensitive query parameters.
    """
    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            record.msg = redact_sensitive_info(record.msg)

        if record.args:
            if isinstance(record.args, dict):
                record.args = {
                    k: redact_sensitive_info(str(v)) if isinstance(v, (str, bytes)) else v
                    for k, v in record.args.items()
                }
            elif isinstance(record.args, tuple):
                record.args = tuple(
                    redact_sensitive_info(str(a)) if isinstance(a, (str, bytes)) else a
                    for a in record.args
                )

        if record.exc_text:
            record.exc_text = redact_sensitive_info(record.exc_text)

        return True


def setup_secure_logging() -> None:
    """
    Configures secure logging across the application:
    - Attaches SensitiveDataRedactingFilter to root, uvicorn, httpx, httpcore, and fastapi loggers.
    - Sets appropriate log levels for third-party HTTP transport libraries.
    """
    redacting_filter = SensitiveDataRedactingFilter()

    # Target key loggers
    target_loggers = [
        "",  # root
        "uvicorn",
        "uvicorn.access",
        "uvicorn.error",
        "httpx",
        "httpcore",
        "fastapi",
    ]

    for logger_name in target_loggers:
        logger = logging.getLogger(logger_name)
        # Avoid duplicate filters
        if not any(isinstance(f, SensitiveDataRedactingFilter) for f in logger.filters):
            logger.addFilter(redacting_filter)
        for handler in logger.handlers:
            if not any(isinstance(f, SensitiveDataRedactingFilter) for f in handler.filters):
                handler.addFilter(redacting_filter)

    # Restrict verbose outbound HTTP debug logs
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
