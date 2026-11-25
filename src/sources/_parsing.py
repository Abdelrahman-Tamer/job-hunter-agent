"""Shared URL validation and text-attribute extraction helpers for source adapters."""

import re
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import urlparse

from dateutil import parser as date_parser

from src.core.security import canonicalize_url, is_safe_url
from src.models.enums import SeniorityLevel, WorkplaceType

_LINKEDIN_JOB_ID_PATH_RE = re.compile(r"/jobs/view/(?:[^/?#]*-)?(\d+)(?:/|\?|$)")

_KNOWN_SKILLS: tuple[tuple[str, str], ...] = (
    ("angular", "Angular"),
    ("typescript", "TypeScript"),
    ("javascript", "JavaScript"),
    ("react", "React"),
    ("next.js", "Next.js"),
    ("nextjs", "Next.js"),
    ("vue", "Vue.js"),
    ("nuxt", "Nuxt.js"),
    ("rxjs", "RxJS"),
    ("ngrx", "NgRx"),
    ("tailwind", "Tailwind CSS"),
    ("html", "HTML5"),
    ("css", "CSS3"),
)


def is_allowed_domain_url(url: str, allowed_domains: tuple[str, ...]) -> bool:
    """Validate URL scheme, credentials, SSRF safety, and exact/subdomain host allowlist."""
    if not url or not is_safe_url(url):
        return False
    try:
        parsed = urlparse(url.strip())
    except ValueError:
        return False
    if parsed.scheme.lower() not in ("http", "https"):
        return False
    if parsed.username or parsed.password:
        return False
    hostname = (parsed.hostname or "").lower().rstrip(".")
    if not hostname:
        return False
    return any(
        hostname == domain or hostname.endswith(f".{domain}")
        for domain in allowed_domains
    )


def extract_linkedin_job_id_from_url(url: str) -> str | None:
    """Extract numeric LinkedIn job ID from a /jobs/view/... URL path."""
    if not url:
        return None
    try:
        path = urlparse(url).path or ""
    except ValueError:
        return None
    match = _LINKEDIN_JOB_ID_PATH_RE.search(path)
    return match.group(1) if match else None


def canonical_linkedin_job_url(job_id: str) -> str:
    """Build the canonical LinkedIn public job URL from a numeric job ID."""
    return f"https://www.linkedin.com/jobs/view/{job_id}/"


def extract_workplace_type(
    lower_text: str,
    default: WorkplaceType = WorkplaceType.UNKNOWN,
) -> WorkplaceType:
    """Infer workplace type (Remote/Hybrid/On-site) from lowercase text."""
    if "hybrid" in lower_text:
        return WorkplaceType.HYBRID
    if any(r in lower_text for r in ("remote", "worldwide", "work from anywhere", "wfh", "anywhere")):
        return WorkplaceType.REMOTE
    if any(o in lower_text for o in ("on-site", "onsite", "on site")):
        return WorkplaceType.ON_SITE
    return default


def extract_location(lower_text: str) -> str | None:
    """Infer normalized MENA / International location label from lowercase text."""
    if any(c in lower_text for c in ("cairo", "smart village", "new cairo", "maadi", "nasr city")):
        return "Cairo, Egypt"
    if "giza" in lower_text:
        return "Giza, Egypt"
    if "alexandria" in lower_text:
        return "Alexandria, Egypt"
    if "egypt" in lower_text:
        return "Egypt"
    if any(s in lower_text for s in ("riyadh", "jeddah", "dammam", "saudi", "ksa")):
        return "Saudi Arabia"
    if any(u in lower_text for u in ("dubai", "abu dhabi", "sharjah", "uae", "united arab emirates")):
        return "UAE"
    if any(q in lower_text for q in ("doha", "qatar")):
        return "Qatar"
    if "kuwait" in lower_text:
        return "Kuwait"
    if any(b in lower_text for b in ("bahrain", "manama")):
        return "Bahrain"
    if any(o in lower_text for o in ("oman", "muscat")):
        return "Oman"
    if "gcc" in lower_text:
        return "GCC"
    if "emea" in lower_text:
        return "EMEA"
    if any(w in lower_text for w in ("worldwide", "global", "anywhere")):
        return "Worldwide"
    if "remote" in lower_text:
        return "Remote"
    return None


def extract_seniority(title: str, lower_text: str) -> SeniorityLevel:
    """Infer seniority level from title and lowercase text."""
    t_low = title.lower()
    if any(k in t_low for k in ("intern", "internship", "trainee")):
        return SeniorityLevel.INTERNSHIP
    if any(k in t_low for k in ("lead", "staff", "principal")):
        return SeniorityLevel.LEAD
    if any(k in t_low for k in ("senior", "sr.", "sr ")):
        return SeniorityLevel.SENIOR
    if any(k in t_low for k in ("junior", "jr.", "jr ", "entry", "fresh")):
        return SeniorityLevel.JUNIOR
    if "mid" in t_low or "mid-level" in lower_text or "mid level" in lower_text:
        return SeniorityLevel.MID
    return SeniorityLevel.UNKNOWN


def extract_skills(lower_text: str) -> list[str]:
    """Extract canonical frontend skills mentioned on word boundaries."""
    found: list[str] = []
    seen: set[str] = set()
    for kw, display in _KNOWN_SKILLS:
        if display in seen:
            continue
        if re.search(rf"\b{re.escape(kw)}\b", lower_text):
            seen.add(display)
            found.append(display)
    return found


def extract_published_at(raw_date: Any, fallback_text: str = "") -> datetime | None:
    """Parse structured ISO/date strings or relative timestamps into UTC datetime."""
    if raw_date:
        raw_str = str(raw_date).strip()
        if raw_str:
            try:
                dt = date_parser.parse(raw_str)
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=UTC)
                return dt.astimezone(UTC)
            except (ValueError, TypeError, OverflowError):
                pass

    text = f"{raw_date or ''} {fallback_text or ''}".strip().lower()
    match_rel = re.search(r"\b(\d+)\s*(minute|min|hour|hr|day|week|month)s?\s*ago\b", text)
    if match_rel:
        val = int(match_rel.group(1))
        unit = match_rel.group(2)
        now = datetime.now(UTC)
        if "min" in unit:
            return now - timedelta(minutes=val)
        if "hour" in unit or "hr" in unit:
            return now - timedelta(hours=val)
        if "day" in unit:
            return now - timedelta(days=val)
        if "week" in unit:
            return now - timedelta(weeks=val)
        if "month" in unit:
            return now - timedelta(days=val * 30)
    return None


def safe_canonicalize_for_board(url: str) -> str:
    """Canonicalize job URL, unifying LinkedIn /jobs/view/<id> regional variants."""
    job_id = extract_linkedin_job_id_from_url(url)
    if job_id and is_allowed_domain_url(url, ("linkedin.com",)):
        return canonical_linkedin_job_url(job_id)
    return canonicalize_url(url)
