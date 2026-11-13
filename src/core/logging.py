"""Structured logging configuration with secret and PII sanitization."""

import logging
import re
import sys
from typing import Any


SENSITIVE_PATTERNS = [
    re.compile(r"(api[_-]?key|token|secret|password|authorization)['\":\s=]+([a-zA-Z0-9_\-\.]{8,})", re.IGNORECASE),
    re.compile(r"([a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)", re.IGNORECASE),
    re.compile(r"(\+?\d{1,3}[-.\s]?)?(\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}"),
]


class SanitizingFormatter(logging.Formatter):
    """Log formatter that masks sensitive data such as API tokens, emails, and phone numbers."""

    def format(self, record: logging.LogRecord) -> str:
        orig = super().format(record)
        sanitized = orig
        for pattern in SENSITIVE_PATTERNS:
            sanitized = pattern.sub(r"[REDACTED]", sanitized)
        return sanitized


def setup_logging(level: str = "INFO") -> logging.Logger:
    """Initialize root application logging."""
    numeric_level = getattr(logging, level.upper(), logging.INFO)
    logger = logging.getLogger("job_hunter")
    logger.setLevel(numeric_level)

    # Avoid duplicate handlers on re-init
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setLevel(numeric_level)
        formatter = SanitizingFormatter(
            fmt="%(asctime)s [%(levelname)s] [%(name)s:%(module)s:%(lineno)d] %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
        handler.setFormatter(formatter)
        logger.addHandler(handler)

    # Quiet external noisy libraries
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)

    return logger


logger = setup_logging()
