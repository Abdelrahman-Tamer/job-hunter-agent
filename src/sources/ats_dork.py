"""Global ATS Dorking adapter via Serper Search API.

Discovers fresh Frontend and Angular openings directly on startup and mid-size
ATS portals (Ashby, Greenhouse, Lever, Workable, Breezy HR, SmartRecruiters)
across Egypt, Remote Worldwide/EMEA, and GCC without per-company allowlists.
"""

import hashlib
import json
import re
from datetime import UTC, datetime, timedelta
from typing import Any, ClassVar
from urllib.parse import parse_qs, urlparse

import httpx
from dateutil import parser as date_parser

from src.core.config import settings
from src.core.logging import logger
from src.core.security import canonicalize_url, is_safe_url
from src.models.enums import EmploymentType, SeniorityLevel, WorkplaceType
from src.sources.base import (
    BaseSourceAdapter,
    NormalizedJobData,
    RawJobData,
    SourceMetadata,
)
from src.sources.http_client import ResilientHttpClient


class GlobalAtsDorkAdapter(BaseSourceAdapter):
    """Discover fresh Frontend/Angular jobs across global ATS portals via Serper."""

    SERPER_URL: ClassVar[str] = "https://google.serper.dev/search"
    ATS_SITE_CLAUSE: ClassVar[str] = (
        "(site:jobs.ashbyhq.com OR site:boards.greenhouse.io OR site:jobs.lever.co "
        "OR site:apply.workable.com OR site:breezy.hr OR site:jobs.smartrecruiters.com)"
    )
    ALLOWED_ATS_DOMAINS: ClassVar[tuple[str, ...]] = (
        "ashbyhq.com",
        "greenhouse.io",
        "lever.co",
        "workable.com",
        "breezy.hr",
        "smartrecruiters.com",
    )
    DEFAULT_QUERIES: ClassVar[list[str]] = [
        # Query 1: Egypt / Cairo / Alexandria Frontend & Angular roles
        f'{ATS_SITE_CLAUSE} ("frontend" OR "front-end" OR "angular") ("egypt" OR "cairo" OR "alexandria")',
        # Query 2: Remote Worldwide / EMEA Angular & TypeScript roles
        f'{ATS_SITE_CLAUSE} ("angular" OR "frontend") ("typescript" OR "web") "remote" ("worldwide" OR "emea" OR "global" OR "anywhere")',
        # Query 3: Remote / Hybrid GCC Frontend & Angular roles
        f'{ATS_SITE_CLAUSE} ("frontend" OR "front-end" OR "angular") ("remote" OR "hybrid") ("uae" OR "dubai" OR "saudi" OR "riyadh" OR "qatar" OR "gcc")',
    ]

    def __init__(
        self,
        http_client: ResilientHttpClient | None = None,
        api_key: str | None = None,
        custom_queries: list[str] | None = None,
    ):
        self.http_client = http_client or ResilientHttpClient()
        self.api_key = api_key
        self.queries = custom_queries or self.DEFAULT_QUERIES

    def source_metadata(self) -> SourceMetadata:
        return SourceMetadata(
            name="ats_dork",
            source_type="ats_dork",
            base_url=self.SERPER_URL,
            doc_url="https://serper.dev",
            allowed_usage_summary="Public Google search indexing over startup/mid-size ATS job boards via Serper API.",
            rate_limit_req_per_minute=20,
            attribution_requirement="Direct link to official company ATS posting.",
            freshness_limitations="Bounded by SERPER_FRESHNESS_TBS (default last 72h).",
            fields_provided=["title", "link", "snippet", "date"],
        )

    def _resolve_api_key(self) -> str:
        raw = self.api_key if self.api_key is not None else getattr(settings, "SERPER_API_KEY", None)
        return str(raw).strip() if raw else ""

    async def health_check(self) -> bool:
        """Report healthy when Serper API key is configured."""
        return bool(self._resolve_api_key())

    async def fetch_jobs(
        self,
        since: datetime | None = None,
        query_config: dict[str, Any] | None = None,
    ) -> list[RawJobData]:
        """Run compact ATS dork query matrix via Serper; return [] cleanly if key missing."""
        api_key = self._resolve_api_key()
        if not api_key:
            logger.debug("GlobalAtsDorkAdapter skipped: SERPER_API_KEY is not configured.")
            return []

        headers = {
            "X-API-KEY": api_key,
            "Content-Type": "application/json",
        }
        freshness_tbs = getattr(settings, "SERPER_FRESHNESS_TBS", "qdr:d3")

        raw_jobs: list[RawJobData] = []
        seen_urls: set[str] = set()

        for query in self.queries[:4]:
            payload_json: dict[str, Any] = {"q": query, "num": 10}
            if freshness_tbs:
                payload_json["tbs"] = freshness_tbs

            try:
                resp = await self.http_client.post(
                    self.SERPER_URL,
                    headers=headers,
                    json=payload_json,
                )
            except (httpx.HTTPError, ValueError) as exc:
                logger.warning(f"GlobalAtsDorkAdapter Serper error for query: {exc}")
                continue

            if resp.status_code != 200:
                logger.warning(
                    f"GlobalAtsDorkAdapter Serper returned HTTP {resp.status_code}: {resp.text[:200]}"
                )
                continue

            try:
                data = resp.json()
            except json.JSONDecodeError as exc:
                logger.warning(f"GlobalAtsDorkAdapter invalid JSON response: {exc}")
                continue

            for entry in data.get("organic", []):
                if not isinstance(entry, dict):
                    continue
                link = str(entry.get("link") or "").strip()
                if not self._is_allowed_ats_url(link):
                    continue

                canonical = canonicalize_url(link)
                if canonical in seen_urls:
                    continue
                seen_urls.add(canonical)

                job_hash = hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:24]
                raw_jobs.append(
                    RawJobData(
                        source_name="ats_dork",
                        source_job_id=job_hash,
                        source_url=link,
                        payload={
                            "title": str(entry.get("title") or "").strip(),
                            "snippet": str(entry.get("snippet") or "").strip(),
                            "link": link,
                            "date": str(entry.get("date") or "").strip(),
                        },
                    )
                )

        logger.info(f"GlobalAtsDorkAdapter discovered {len(raw_jobs)} verified ATS listings.")
        return raw_jobs

    def normalize(self, raw_job: RawJobData) -> NormalizedJobData:
        """Normalize a Serper ATS listing into NormalizedJobData."""
        payload = raw_job.payload
        link = str(payload.get("link") or raw_job.source_url).strip()
        canonical = canonicalize_url(link)
        raw_title = str(payload.get("title") or "").strip()
        snippet = str(payload.get("snippet") or "").strip()
        combined_text = f"{raw_title}\n{snippet}".strip()
        lower_text = combined_text.lower()

        company, title = self._extract_company_and_title(raw_title, link)
        workplace_type = self._extract_workplace_type(lower_text)
        raw_location = self._extract_location(lower_text)
        remote_scope = raw_location if workplace_type == WorkplaceType.REMOTE else None
        seniority = self._extract_seniority(title, lower_text)
        employment_type = (
            EmploymentType.INTERNSHIP if seniority == SeniorityLevel.INTERNSHIP else EmploymentType.FULL_TIME
        )
        skills = self._extract_skills(lower_text)
        published_at = self._extract_published_at(payload.get("date"), snippet)

        return NormalizedJobData(
            source_name="ats_dork",
            source_job_id=raw_job.source_job_id,
            source_url=link,
            canonical_url=canonical,
            original_application_url=link,
            company=company,
            title=title,
            description_text=combined_text or title,
            description_html=f"<p>{combined_text}</p>" if combined_text else None,
            raw_location=raw_location,
            country_codes=["EG"] if (raw_location and "egypt" in raw_location.lower()) else [],
            workplace_type=workplace_type,
            remote_scope=remote_scope,
            seniority=seniority,
            employment_type=employment_type,
            required_skills=skills,
            published_at=published_at,
            is_social_post=False,
            raw_payload={
                **payload,
                "is_social_post": False,
                "source_category": "JOB_BOARD",
                "ats_host": (urlparse(link).hostname or "").lower(),
            },
        )

    @classmethod
    def _is_allowed_ats_url(cls, url: str) -> bool:
        """Strictly validate ATS domain allowlist and SSRF safety via parsed URL."""
        if not url or not is_safe_url(url):
            return False
        try:
            parsed = urlparse(url)
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
            for domain in cls.ALLOWED_ATS_DOMAINS
        )

    @staticmethod
    def _extract_company_slug_from_url(url: str) -> str:
        """Extract company slug from known ATS URL patterns."""
        parsed = urlparse(url)
        host = (parsed.hostname or "").lower()
        parts = [p for p in parsed.path.split("/") if p]

        if host.endswith(".breezy.hr"):
            sub = host.removesuffix(".breezy.hr")
            if sub and sub not in ("www", "app", "jobs"):
                return sub

        if host.endswith("greenhouse.io") and parts:
            if parts[0].lower() == "embed":
                qs = parse_qs(parsed.query)
                if qs.get("for"):
                    return qs["for"][0]
            return parts[0]

        if (
            any(
                host == d or host.endswith(f".{d}")
                for d in ("ashbyhq.com", "lever.co", "workable.com", "smartrecruiters.com")
            )
            and parts
            and parts[0].lower() not in ("j", "jobs", "p", "api")
        ):
            return parts[0]

        return ""

    @staticmethod
    def _format_slug(slug: str) -> str:
        if not slug:
            return ""
        cleaned = re.sub(r"[-_]+", " ", slug).strip()
        return " ".join(w.capitalize() for w in cleaned.split())

    def _extract_company_and_title(self, raw_title: str, link: str) -> tuple[str, str]:
        """Extract clean (company, role_title) from ATS URL slug and Serper headline."""
        slug_raw = self._extract_company_slug_from_url(link)
        slug_display = self._format_slug(slug_raw)

        # Strip common trailing ATS site labels
        clean = re.sub(
            r"\s*[|\-–]\s*(?:Greenhouse|Lever|Ashby|Workable|SmartRecruiters|Breezy(?:\s+HR)?)\s*$",
            "",
            raw_title,
            flags=re.IGNORECASE,
        ).strip()

        # Pattern 1: "Role at Company"
        match_at = re.match(r"^(.+?)\s+at\s+([^-|]{2,60})$", clean, re.IGNORECASE)
        if match_at:
            role = match_at.group(1).strip()
            comp = match_at.group(2).strip()
            return comp, role

        # Pattern 2: "Company - Role" or "Role - Company"
        if " - " in clean or " – " in clean:
            parts = [p.strip() for p in re.split(r"\s+[-–]\s+", clean, maxsplit=1) if p.strip()]
            if len(parts) == 2:
                left, right = parts
                slug_norm = re.sub(r"[^a-z0-9]", "", slug_raw.lower())
                left_norm = re.sub(r"[^a-z0-9]", "", left.lower())
                right_norm = re.sub(r"[^a-z0-9]", "", right.lower())
                if slug_norm and left_norm == slug_norm:
                    return left, right
                if slug_norm and right_norm == slug_norm:
                    return right, left
                if slug_display:
                    return slug_display, left
                return left, right

        return slug_display or "ATS Employer", clean or "Frontend Engineer"

    @staticmethod
    def _extract_workplace_type(lower_text: str) -> WorkplaceType:
        if "hybrid" in lower_text:
            return WorkplaceType.HYBRID
        if any(r in lower_text for r in ("remote", "worldwide", "work from anywhere", "wfh", "anywhere")):
            return WorkplaceType.REMOTE
        if any(o in lower_text for o in ("on-site", "onsite", "on site")):
            return WorkplaceType.ON_SITE
        return WorkplaceType.UNKNOWN

    @staticmethod
    def _extract_location(lower_text: str) -> str | None:
        if any(c in lower_text for c in ("cairo", "smart village", "new cairo", "maadi")):
            return "Cairo, Egypt"
        if "giza" in lower_text:
            return "Giza, Egypt"
        if "alexandria" in lower_text:
            return "Alexandria, Egypt"
        if "egypt" in lower_text:
            return "Egypt"
        if any(s in lower_text for s in ("riyadh", "jeddah", "saudi", "ksa")):
            return "Saudi Arabia"
        if any(u in lower_text for u in ("dubai", "abu dhabi", "uae")):
            return "UAE"
        if any(q in lower_text for q in ("doha", "qatar")):
            return "Qatar"
        if "gcc" in lower_text:
            return "GCC"
        if "emea" in lower_text:
            return "EMEA"
        if any(w in lower_text for w in ("worldwide", "global", "anywhere")):
            return "Worldwide"
        if "remote" in lower_text:
            return "Remote"
        return None

    @staticmethod
    def _extract_seniority(title: str, lower_text: str) -> SeniorityLevel:
        t_low = title.lower()
        if any(k in t_low for k in ("intern", "internship", "trainee")):
            return SeniorityLevel.INTERNSHIP
        if any(k in t_low for k in ("lead", "staff", "principal")):
            return SeniorityLevel.LEAD
        if any(k in t_low for k in ("senior", "sr.", "sr ")):
            return SeniorityLevel.SENIOR
        if any(k in t_low for k in ("junior", "jr.", "jr ", "entry")):
            return SeniorityLevel.JUNIOR
        if "mid" in lower_text:
            return SeniorityLevel.MID
        return SeniorityLevel.UNKNOWN

    @staticmethod
    def _extract_skills(lower_text: str) -> list[str]:
        known = [
            ("angular", "Angular"),
            ("typescript", "TypeScript"),
            ("javascript", "JavaScript"),
            ("react", "React"),
            ("next.js", "Next.js"),
            ("vue", "Vue.js"),
            ("rxjs", "RxJS"),
            ("tailwind", "Tailwind CSS"),
            ("html", "HTML5"),
            ("css", "CSS3"),
        ]
        found: list[str] = []
        for kw, display in known:
            if re.search(rf"\b{re.escape(kw)}\b", lower_text):
                found.append(display)
        return found

    @staticmethod
    def _extract_published_at(raw_date: Any, snippet: str) -> datetime | None:
        text = f"{raw_date or ''} {snippet or ''}".strip()
        if raw_date:
            try:
                dt = date_parser.parse(str(raw_date))
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=UTC)
                return dt
            except (ValueError, TypeError, OverflowError):
                pass
        match_rel = re.search(r"\b(\d+)\s*(hour|hr|day|week|month)s?\s*ago\b", text.lower())
        if match_rel:
            val = int(match_rel.group(1))
            unit = match_rel.group(2)
            now = datetime.now(UTC)
            if "hour" in unit or "hr" in unit:
                return now - timedelta(hours=val)
            if "day" in unit:
                return now - timedelta(days=val)
            if "week" in unit:
                return now - timedelta(weeks=val)
            if "month" in unit:
                return now - timedelta(days=val * 30)
        return None
