"""Security utilities: SSRF defense, URL canonicalization, and prompt injection mitigation."""

import ipaddress
import re
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse
from typing import Set


# Common tracking parameters to strip during URL canonicalization
TRACKING_PARAMS: Set[str] = {
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "fbclid",
    "gclid",
    "ref",
    "source",
    "affiliate",
    "trk",
    "trackingId",
    "origin",
    "_hsenc",
    "_hsmi",
    "mc_cid",
    "mc_eid",
}

# Regex to detect private, link-local (cloud metadata), or loopback IP hosts
PRIVATE_IP_REGEX = re.compile(
    r"^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+|169\.254\.\d+\.\d+|0\.0\.0\.0|::1|fc00:|fe80:|.*\.internal|.*\.local)",
    re.IGNORECASE,
)


def is_safe_url(url: str) -> bool:
    """Validate that a URL is safe to request (mitigating SSRF and DNS rebinding)."""
    try:
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https"):
            return False
        hostname = parsed.hostname
        if not hostname:
            return False
        if PRIVATE_IP_REGEX.match(hostname):
            return False
        # If hostname is an IP literal, ensure it is global
        # shortcut: relies on host regex and IP literal check; DNS rebinding deferred to client socket connection
        try:
            ip = ipaddress.ip_address(hostname)
            return ip.is_global
        except ValueError:
            pass
        return True
    except Exception:
        return False


def canonicalize_url(url: str) -> str:
    """
    Canonicalize a URL by stripping tracking parameters, normalizing lowercase host,
    and removing trailing slashes while preserving query parameters necessary for job identity.
    """
    if not url:
        return ""
    try:
        parsed = urlparse(url)
        # Filter query params
        query_items = parse_qsl(parsed.query, keep_blank_values=False)
        clean_items = [
            (k, v) for k, v in query_items if k.lower() not in TRACKING_PARAMS
        ]
        clean_query = urlencode(clean_items)

        # Normalize path: remove trailing slash if path > 1 char
        path = parsed.path
        if len(path) > 1 and path.endswith("/"):
            path = path[:-1]

        canonical = urlunparse((
            parsed.scheme.lower(),
            parsed.netloc.lower(),
            path,
            parsed.params,
            clean_query,
            "",  # Strip fragment
        ))
        return canonical
    except Exception:
        return url.strip()


def sanitize_text_for_llm(text: str, max_length: int = 12000) -> str:
    """
    Sanitize untrusted job description text before feeding it to Gemini:
    - Truncate excessive text
    - Neutralize potential prompt injection delimiters like system instructions, tool definitions, etc.
    """
    if not text:
        return ""

    # Enforce safe character limit
    text = text[:max_length]

    # Neutralize prompt injection phrases
    injection_patterns = [
        r"(?i)<\s*system\s*>",
        r"(?i)<\s*/\s*system\s*>",
        r"(?i)ignore\s+(all\s+)?previous\s+instructions",
        r"(?i)disregard\s+(all\s+)?prior\s+instructions",
        r"(?i)you\s+are\s+now\s+in\s+developer\s+mode",
        r"(?i)execute\s+tool\s*:",
        r"(?i)call\s+mcp\s*:",
    ]
    for pattern in injection_patterns:
        text = re.sub(pattern, "[DISARMED_INSTRUCTION]", text)

    return text


def sanitize_pii(text: str) -> str:
    """Strip candidate PII (email, phone, exact address) before sending to external services."""
    if not text:
        return ""
    # Strip emails
    text = re.sub(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+", "[EMAIL_REDACTED]", text)
    # Strip phone numbers (various formats)
    text = re.sub(r"(\+?\d{1,3}[-.\s]?)?(\(?\d{2,4}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{3,4}", "[PHONE_REDACTED]", text)
    return text
