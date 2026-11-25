"""Major Job Boards Serper Dorking adapter.

Discovers fresh Frontend and Angular listings across Indeed, LinkedIn Jobs (/jobs/view/),
Bayt, Glassdoor, and Wellfound (AngelList) cleanly via Serper without Cloudflare blocks.
"""

import hashlib
import json
import re
from datetime import datetime
from typing import Any, ClassVar
from urllib.parse import urlparse

import httpx

from src.core.config import settings
from src.core.logging import logger
from src.models.enums import EmploymentType, SeniorityLevel, WorkplaceType
from src.sources._parsing import (
    extract_location,
    extract_published_at,
    extract_seniority,
    extract_skills,
    extract_workplace_type,
    is_allowed_domain_url,
    safe_canonicalize_for_board,
)
from src.sources.base import (
    BaseSourceAdapter,
    NormalizedJobData,
    RawJobData,
    SourceMetadata,
)
from src.sources.http_client import ResilientHttpClient


class MajorBoardsDorkAdapter(BaseSourceAdapter):
    """Discover fresh Frontend & Angular roles on major job boards via Serper."""

    SERPER_URL: ClassVar[str] = "https://google.serper.dev/search"
    MAX_QUERIES_PER_RUN: ClassVar[int] = 4

    ALLOWED_BOARD_DOMAINS: ClassVar[tuple[str, ...]] = (
        "indeed.com",
        "linkedin.com",
        "bayt.com",
        "glassdoor.com",
        "wellfound.com",
    )

    DEFAULT_QUERIES: ClassVar[list[str]] = [
        # 1. Indeed Egypt & GCC Frontend/Angular
        (
            '(site:eg.indeed.com OR site:ae.indeed.com OR site:sa.indeed.com OR site:indeed.com/viewjob) '
            '("frontend" OR "front-end" OR "angular") ("egypt" OR "cairo" OR "remote" OR "dubai" OR "riyadh")'
        ),
        # 2. LinkedIn Jobs Official (/jobs/view/) Egypt & Remote GCC
        (
            'site:linkedin.com/jobs/view ("frontend" OR "front-end" OR "angular") '
            '("egypt" OR "cairo" OR "remote" OR "uae" OR "saudi")'
        ),
        # 3. Bayt & Glassdoor MENA Frontend/Angular
        (
            '(site:bayt.com OR site:glassdoor.com/job-listing) '
            '("frontend" OR "front-end" OR "angular") ("egypt" OR "cairo" OR "remote" OR "dubai" OR "riyadh")'
        ),
        # 4. Wellfound (AngelList) Startups Remote/EMEA
        'site:wellfound.com/jobs ("frontend" OR "front-end" OR "angular") ("remote" OR "emea" OR "egypt")',
    ]

    _BOARD_SUFFIX_RE: ClassVar[re.Pattern[str]] = re.compile(
        r"\s*[|\-–]\s*(?:Indeed(?:\.com)?(?:\s+\w+)?|LinkedIn|Bayt(?:\.com)?|Glassdoor|Wellfound|AngelList(?:\s+Talent)?)\s*$",
        re.IGNORECASE,
    )
    _HIRING_TITLE_RE: ClassVar[re.Pattern[str]] = re.compile(
        r"^(.+?)\s+hiring\s+(.+?)(?:\s+in\s+(.+))?$",
        re.IGNORECASE,
    )
    _AT_TITLE_RE: ClassVar[re.Pattern[str]] = re.compile(
        r"^(.+?)\s+at\s+([^|\-–]{2,80})$",
        re.IGNORECASE,
    )
    _LOCATION_HINT_RE: ClassVar[re.Pattern[str]] = re.compile(
        r"\b(egypt|cairo|giza|alexandria|dubai|abu dhabi|uae|riyadh|jeddah|saudi|ksa|qatar|doha|"
        r"kuwait|bahrain|oman|gcc|emea|mena|remote|worldwide|global)\b",
        re.IGNORECASE,
    )

    def __init__(
        self,
        http_client: ResilientHttpClient | None = None,
        api_key: str | None = None,
        custom_queries: list[str] | None = None,
    ):
        self.http_client = http_client or ResilientHttpClient()
        self.api_key = api_key
        self.queries = custom_queries or list(self.DEFAULT_QUERIES)

    def source_metadata(self) -> SourceMetadata:
        return SourceMetadata(
            name="major_boards",
            source_type="major_boards",
            base_url=self.SERPER_URL,
            doc_url="https://serper.dev",
            allowed_usage_summary="Public Google search indexing over Indeed, LinkedIn Jobs, Bayt, Glassdoor, and Wellfound via Serper API.",
            rate_limit_req_per_minute=20,
            attribution_requirement="Direct link to original job board posting.",
            freshness_limitations="Bounded by SERPER_FRESHNESS_TBS (default last 72h).",
            fields_provided=["title", "link", "snippet", "date", "origin_board"],
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
        """Execute max 4 Serper queries over major boards; return [] cleanly if key missing."""
        api_key = self._resolve_api_key()
        if not api_key:
            logger.debug("MajorBoardsDorkAdapter skipped: SERPER_API_KEY is not configured.")
            return []

        headers = {
            "X-API-KEY": api_key,
            "Content-Type": "application/json",
        }
        freshness_tbs = getattr(settings, "SERPER_FRESHNESS_TBS", "qdr:d3")

        raw_jobs: list[RawJobData] = []
        seen_urls: set[str] = set()

        for query in self.queries[: self.MAX_QUERIES_PER_RUN]:
            payload_json: dict[str, Any] = {"q": query, "num": 10}
            if freshness_tbs:
                payload_json["tbs"] = freshness_tbs

            try:
                resp = await self.http_client.post(
                    self.SERPER_URL,
                    headers=headers,
                    json=payload_json,
                )
            except (httpx.HTTPError, TimeoutError, ValueError) as exc:
                logger.warning(f"MajorBoardsDorkAdapter Serper error for query: {exc}")
                continue

            if resp.status_code != 200:
                logger.warning(
                    f"MajorBoardsDorkAdapter Serper returned HTTP {resp.status_code}: {resp.text[:200]}"
                )
                continue

            try:
                data = resp.json()
            except json.JSONDecodeError as exc:
                logger.warning(f"MajorBoardsDorkAdapter invalid JSON response: {exc}")
                continue

            for entry in data.get("organic", []):
                if not isinstance(entry, dict):
                    continue
                link = str(entry.get("link") or "").strip()
                if not self._is_allowed_board_url(link):
                    continue

                canonical = safe_canonicalize_for_board(link)
                if canonical in seen_urls:
                    continue
                seen_urls.add(canonical)

                job_hash = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
                origin_board = self._detect_origin_board(link)
                raw_jobs.append(
                    RawJobData(
                        source_name="major_boards",
                        source_job_id=job_hash,
                        source_url=link,
                        payload={
                            "title": str(entry.get("title") or "").strip(),
                            "snippet": str(entry.get("snippet") or "").strip(),
                            "link": link,
                            "canonical_link": canonical,
                            "date": str(entry.get("date") or "").strip(),
                            "origin_board": origin_board,
                        },
                    )
                )

        logger.info(f"MajorBoardsDorkAdapter discovered {len(raw_jobs)} verified board listings.")
        return raw_jobs

    def normalize(self, raw_job: RawJobData) -> NormalizedJobData:
        """Transform a Serper major-board listing into NormalizedJobData."""
        payload = raw_job.payload
        link = str(payload.get("link") or raw_job.source_url).strip()
        canonical = str(payload.get("canonical_link") or safe_canonicalize_for_board(link)).strip()
        origin_board = str(payload.get("origin_board") or self._detect_origin_board(link))

        raw_title = str(payload.get("title") or "").strip()
        snippet = str(payload.get("snippet") or "").strip()
        company, title, title_loc_hint = self._parse_title_fields(raw_title, origin_board)

        combined_text = "\n".join(p for p in (raw_title, snippet) if p).strip()
        loc_search_text = f"{title_loc_hint} {title} {snippet}".lower()
        lower_text = f"{title_loc_hint} {combined_text}".lower()

        workplace_type = extract_workplace_type(lower_text)
        raw_location = extract_location(loc_search_text)
        remote_scope = raw_location if workplace_type == WorkplaceType.REMOTE else None
        seniority = extract_seniority(title, lower_text)
        employment_type = (
            EmploymentType.INTERNSHIP if seniority == SeniorityLevel.INTERNSHIP else EmploymentType.FULL_TIME
        )
        skills = extract_skills(lower_text)
        published_at = extract_published_at(payload.get("date"), snippet)

        app_url = canonical if origin_board == "LinkedIn Jobs" else link
        country_codes = ["EG"] if (raw_location and "egypt" in raw_location.lower()) else []

        return NormalizedJobData(
            source_name="major_boards",
            source_job_id=raw_job.source_job_id,
            source_url=link,
            canonical_url=canonical,
            original_application_url=app_url,
            company=company,
            title=title,
            description_text=combined_text or title,
            description_html=f"<p>{combined_text}</p>" if combined_text else None,
            raw_location=raw_location,
            country_codes=country_codes,
            workplace_type=workplace_type,
            remote_scope=remote_scope,
            eligible_countries=["EG"] if "EG" in country_codes else [],
            seniority=seniority,
            employment_type=employment_type,
            required_skills=skills,
            published_at=published_at,
            is_social_post=False,
            raw_payload={
                **payload,
                "origin_board": origin_board,
                "is_social_post": False,
                "source_category": "JOB_BOARD",
                "board_host": (urlparse(link).hostname or "").lower(),
            },
        )

    @classmethod
    def _is_allowed_board_url(cls, url: str) -> bool:
        """Strictly validate parsed hostname against allowed boards and LinkedIn /jobs/view/ path."""
        if not is_allowed_domain_url(url, cls.ALLOWED_BOARD_DOMAINS):
            return False
        parsed = urlparse(url)
        host = (parsed.hostname or "").lower().rstrip(".")
        if host == "linkedin.com" or host.endswith(".linkedin.com"):
            return "/jobs/view/" in (parsed.path or "").lower()
        return True

    @staticmethod
    def _detect_origin_board(url: str) -> str:
        """Map validated URL hostname to a clean job board label."""
        host = (urlparse(url).hostname or "").lower().rstrip(".")
        if host == "indeed.com" or host.endswith(".indeed.com"):
            return "Indeed"
        if host == "linkedin.com" or host.endswith(".linkedin.com"):
            return "LinkedIn Jobs"
        if host == "bayt.com" or host.endswith(".bayt.com"):
            return "Bayt"
        if host == "glassdoor.com" or host.endswith(".glassdoor.com"):
            return "Glassdoor"
        if host == "wellfound.com" or host.endswith(".wellfound.com"):
            return "Wellfound"
        return "Job Board"

    def _looks_like_location(self, text: str) -> bool:
        return bool(self._LOCATION_HINT_RE.search(text or ""))

    def _parse_title_fields(self, raw_title: str, origin_board: str) -> tuple[str, str, str]:
        """Parse (company, role_title, location_hint) across LinkedIn, Indeed, Bayt, Glassdoor, Wellfound titles."""
        clean = self._BOARD_SUFFIX_RE.sub("", raw_title).strip()
        # Strip trailing second board marker if title had both "- Cairo | Bayt.com" or "- Bayt.com"
        clean = self._BOARD_SUFFIX_RE.sub("", clean).strip()
        fallback_company = f"{origin_board} Employer"

        # 1. LinkedIn / Glassdoor: "<Company> hiring <Role> [in <Location>]"
        match_hiring = self._HIRING_TITLE_RE.match(clean)
        if match_hiring:
            company = match_hiring.group(1).strip()
            role = match_hiring.group(2).strip()
            loc_hint = (match_hiring.group(3) or "").strip()
            return company or fallback_company, role or "Frontend Engineer", loc_hint

        # 2. Wellfound / Glassdoor / Bayt: "<Role> at <Company>"
        match_at = self._AT_TITLE_RE.match(clean)
        if match_at:
            role = match_at.group(1).strip()
            company = match_at.group(2).strip()
            return company or fallback_company, role or "Frontend Engineer", ""

        # 3. Hyphen-delimited patterns:
        #    Indeed: "<Role> - <Company> - <Location>" or "<Role> - <Company>"
        #    Bayt:   "<Role> - <Location> - <Company>" or "<Role> - <Company> - <Location>"
        parts = [p.strip() for p in re.split(r"\s+[-–]\s+", clean) if p.strip()]
        if len(parts) >= 3:
            last, middle = parts[-1], parts[-2]
            leading = " - ".join(parts[:-2])
            if self._looks_like_location(last):
                return middle or fallback_company, leading or parts[0], last
            if self._looks_like_location(middle):
                return last or fallback_company, leading or parts[0], middle
            return middle or fallback_company, leading or parts[0], last

        if len(parts) == 2:
            left, right = parts
            if self._looks_like_location(right):
                return fallback_company, left, right
            return right or fallback_company, left or "Frontend Engineer", ""

        # 4. Fallback: "<Role> Job in <Location>" (Glassdoor)
        match_job_in = re.match(r"^(.+?)\s+Job\s+in\s+(.+)$", clean, re.IGNORECASE)
        if match_job_in:
            return fallback_company, match_job_in.group(1).strip(), match_job_in.group(2).strip()

        return fallback_company, clean or "Frontend Engineer", ""
