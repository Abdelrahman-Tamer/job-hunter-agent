"""Workable Public Job Board widget adapter.

Extracts published opportunities from tech companies and regional employers hosted on Workable.
"""

import re
from datetime import datetime
from typing import Any

import httpx
from bs4 import BeautifulSoup

from src.core.logging import logger
from src.core.security import canonicalize_url
from src.models.enums import EmploymentType, SeniorityLevel, WorkplaceType
from src.sources.base import (
    BaseSourceAdapter,
    NormalizedJobData,
    RawJobData,
    SourceMetadata,
)
from src.sources.http_client import ResilientHttpClient


class WorkableAdapter(BaseSourceAdapter):
    """Adapter for public Workable company career widgets."""

    API_BASE = "https://apply.workable.com/api/v1/widget/accounts"
    DOC_URL = "https://workable.com"

    def __init__(
        self,
        company_slug: str = "integrant",
        http_client: ResilientHttpClient | None = None,
    ):
        self.company_slug = company_slug.strip().lower()
        self.http_client = http_client or ResilientHttpClient()

    def source_metadata(self) -> SourceMetadata:
        return SourceMetadata(
            name=f"workable_{self.company_slug}",
            source_type="workable",
            base_url=f"{self.API_BASE}/{self.company_slug}",
            doc_url=f"https://apply.workable.com/{self.company_slug}",
            allowed_usage_summary=f"Public read-only careers widget for {self.company_slug}.",
            rate_limit_req_per_minute=10,
            attribution_requirement=f"Attributed to {self.company_slug} via Workable.",
            freshness_limitations="Real-time published vacancies.",
            fields_provided=["title", "city", "country", "telecommuting", "shortlink", "description"],
        )

    async def health_check(self) -> bool:
        url = f"{self.API_BASE}/{self.company_slug}"
        try:
            resp = await self.http_client.get(url)
            return resp.status_code in (200, 429)  # 429 means server is up but rate-limited
        except (httpx.HTTPError, ValueError) as exc:
            logger.error(f"Workable ({self.company_slug}) health check failed: {exc}")
            return False

    async def fetch_jobs(
        self,
        since: datetime | None = None,
        query_config: dict[str, Any] | None = None,
    ) -> list[RawJobData]:
        url = f"{self.API_BASE}/{self.company_slug}"
        raw_jobs: list[RawJobData] = []

        try:
            resp = await self.http_client.get(url)
            if resp.status_code == 429:
                logger.warning(f"Workable ({self.company_slug}) rate limited (HTTP 429). Skipping gracefully.")
                return []
            if resp.status_code != 200:
                logger.warning(f"Workable ({self.company_slug}) returned HTTP {resp.status_code}.")
                return []

            data = resp.json()
            jobs_list = data.get("jobs", [])
            company_name = data.get("name", self.company_slug.title())

            for item in jobs_list:
                item["company_name"] = company_name
                job_id = str(item.get("shortcode") or item.get("id") or item.get("shortlink") or "")
                job_url = item.get("shortlink") or f"https://apply.workable.com/{self.company_slug}/j/{job_id}/"

                raw_jobs.append(
                    RawJobData(
                        source_name=f"workable_{self.company_slug}",
                        source_job_id=job_id,
                        source_url=job_url,
                        payload=item,
                    )
                )
        except (httpx.HTTPError, ValueError, KeyError) as exc:
            logger.warning(f"Workable ({self.company_slug}) fetch failed: {exc}")

        return raw_jobs

    def normalize(self, raw: RawJobData) -> NormalizedJobData:
        item = raw.payload
        company = item.get("company_name", self.company_slug.title())
        title = item.get("title", "Engineering Role")
        app_url = item.get("shortlink", raw.source_url)
        canonical = canonicalize_url(app_url)

        city = item.get("city") or ""
        country = item.get("country") or ""
        raw_loc = f"{city}, {country}".strip(", ") or None

        # Workplace type
        is_telecommuting = bool(item.get("telecommuting", False))
        workplace_type = WorkplaceType.UNKNOWN
        if is_telecommuting:
            workplace_type = WorkplaceType.REMOTE
        elif raw_loc and "remote" in raw_loc.lower():
            workplace_type = WorkplaceType.REMOTE
        elif raw_loc and ("onsite" in raw_loc.lower() or "on-site" in raw_loc.lower()):
            workplace_type = WorkplaceType.ON_SITE
        elif raw_loc and "hybrid" in raw_loc.lower():
            workplace_type = WorkplaceType.HYBRID

        # Seniority
        title_lower = title.lower()
        seniority = SeniorityLevel.UNKNOWN
        if any(w in title_lower for w in ["intern", "trainee", "student"]):
            seniority = SeniorityLevel.INTERNSHIP
        elif any(w in title_lower for w in ["junior", "entry", "associate", "graduate"]):
            seniority = SeniorityLevel.JUNIOR
        elif "lead" in title_lower or "staff" in title_lower:
            seniority = SeniorityLevel.LEAD
        elif "senior" in title_lower or "sr." in title_lower:
            seniority = SeniorityLevel.SENIOR

        employment_type = EmploymentType.INTERNSHIP if seniority == SeniorityLevel.INTERNSHIP else EmploymentType.FULL_TIME

        # Skills from title and department
        skills: list[str] = []
        dept = item.get("department") or ""
        if dept:
            skills.append(dept)

        for tech in ["angular", "react", "typescript", "javascript", "vue", "node", "python", ".net", "java", "sql"]:
            if re.search(rf"\b{re.escape(tech)}\b", title_lower):
                skills.append(tech.title())

        loc_desc = f" in {raw_loc}" if raw_loc else ""
        desc_text = item.get("description") or f"{title} at {company}{loc_desc}."
        if "<" in desc_text:
            desc_text = BeautifulSoup(desc_text, "html.parser").get_text(separator=" ", strip=True)

        return NormalizedJobData(
            source_name=f"workable_{self.company_slug}",
            source_job_id=raw.source_job_id,
            source_url=app_url,
            canonical_url=canonical,
            original_application_url=app_url,
            company=company,
            title=title,
            description_text=desc_text,
            description_html=item.get("description"),
            raw_location=raw_loc,
            country_codes=["EG"] if (raw_loc and any(k in raw_loc.lower() for k in ["egypt", "cairo", "giza", "alexandria"])) else [],
            workplace_type=workplace_type,
            seniority=seniority,
            employment_type=employment_type,
            required_skills=skills,
            published_at=None,
            raw_payload=item,
        )
