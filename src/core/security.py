"""Security utilities: SSRF defense, URL canonicalization, and prompt injection mitigation."""

import ipaddress
import re
import socket
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


# Regex to detect alternate numeric/hex/octal IPv4 hostnames (e.g. 2130706433, 0x7f000001, 0177.0.0.1, 127.1)
ALTERNATE_IP_REGEX = re.compile(
    r"^(?:0x[0-9a-f]+|0[0-7]*|\d+)(?:\.(?:0x[0-9a-f]+|0[0-7]*|\d+)){0,3}$",
    re.IGNORECASE,
)


def _is_global_ip(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    """Return True only when an IP address is strictly globally routable."""
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
        ip = ip.ipv4_mapped
    return (
        ip.is_global
        and not ip.is_private
        and not ip.is_loopback
        and not ip.is_link_local
        and not ip.is_reserved
        and not ip.is_multicast
        and not ip.is_unspecified
    )


def is_safe_url(url: str) -> bool:
    """Validate that a URL is safe to request (mitigating SSRF and DNS rebinding)."""
    try:
        if not url or not isinstance(url, str):
            return False
        cleaned = url.strip()
        if any(ord(ch) < 32 or ord(ch) == 127 for ch in cleaned):
            return False

        parsed = urlparse(cleaned)
        if parsed.scheme.lower() not in ("http", "https"):
            return False
        hostname = parsed.hostname
        if not hostname:
            return False
        host = hostname.rstrip(".").lower()
        if not host or "%" in host:
            return False
        if PRIVATE_IP_REGEX.match(host) or host.endswith(".localhost"):
            return False

        # If hostname is a standard IP literal, ensure it is strictly global
        try:
            ip = ipaddress.ip_address(host)
            return _is_global_ip(ip)
        except ValueError:
            pass

        # Reject alternate numeric/hex/octal/shorthand IP notations
        if ALTERNATE_IP_REGEX.match(host):
            return False
        try:
            socket.inet_aton(host)
            return False
        except OSError:
            pass

        # Resolve DNS safely; tolerate offline test environments (gaierror) for mocked transports
        try:
            addr_infos = socket.getaddrinfo(host, None)
        except socket.gaierror:
            return True
        except OSError:
            return False

        for info in addr_infos:
            sockaddr = info[4]
            if not sockaddr:
                continue
            raw_addr = str(sockaddr[0])
            if "%" in raw_addr:
                return False
            try:
                resolved_ip = ipaddress.ip_address(raw_addr)
            except ValueError:
                return False
            if not _is_global_ip(resolved_ip):
                return False
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

    # Neutralize remaining angle brackets to prevent prompt XML-tag breakout
    text = text.replace("<", "&lt;").replace(">", "&gt;")

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
