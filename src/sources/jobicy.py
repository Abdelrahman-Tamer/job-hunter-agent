"""Jobicy Remote Jobs API adapter.

Fetches EMEA, Worldwide, Frontend, and Internship opportunities from Jobicy.
"""

import json
import re
from datetime import UTC, datetime
from typing import Any

import httpx
from bs4 import BeautifulSoup
from dateutil import parser as date_parser

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


class JobicyAdapter(BaseSourceAdapter):
    """Adapter for Jobicy public remote jobs API."""

    API_BASE = "https://jobicy.com/api/v2/remote-jobs"
    DOC_URL = "https://jobicy.com/jobs-rss-feed"

    def __init__(self, http_client: ResilientHttpClient | None = None):
        self.http_client = http_client or ResilientHttpClient()

    def source_metadata(self) -> SourceMetadata:
        return SourceMetadata(
            name="jobicy",
            source_type="jobicy",
            base_url=self.API_BASE,
            doc_url=self.DOC_URL,
            allowed_usage_summary="Public read-only remote jobs feed with geographic and tag filters.",
            rate_limit_req_per_minute=20,
            attribution_requirement="Link back to Jobicy posting and preserve attribution.",
            freshness_limitations="Near real-time remote jobs.",
            fields_provided=[
                "id", "url", "jobTitle", "companyName", "jobGeo", "jobType",
                "pubDate", "annualSalaryMin", "annualSalaryMax", "salaryCurrency",
                "jobDescription", "jobIndustry"
            ],
        )

    async def health_check(self) -> bool:
        try:
            resp = await self.http_client.get(self.API_BASE, params={"count": 1})
            return resp.status_code == 200
        except (httpx.HTTPError, ValueError) as exc:
            logger.error(f"Jobicy health check failed: {exc}")
            return False

    async def fetch_jobs(
        self,
        since: datetime | None = None,
        query_config: dict[str, Any] | None = None,
    ) -> list[RawJobData]:
        raw_jobs: list[RawJobData] = []
        seen_ids = set()

        # Query EMEA (open to Egypt), Frontend, Angular, and Internships
        query_params_list = [
            {"count": 30, "geo": "emea"},
            {"count": 30, "tag": "frontend"},
            {"count": 20, "tag": "angular"},
            {"count": 20, "tag": "intern"},
        ]

        for params in query_params_list:
            try:
                resp = await self.http_client.get(self.API_BASE, params=params)
                if resp.status_code != 200:
                    continue
                data = resp.json()
                jobs_list = data.get("jobs", [])

                for item in jobs_list:
                    job_id = str(item.get("id") or item.get("url") or "")
                    if not job_id or job_id in seen_ids:
                        continue
                    seen_ids.add(job_id)

                    raw_jobs.append(
                        RawJobData(
                            source_name="jobicy",
                            source_job_id=job_id,
                            source_url=item.get("url", ""),
                            payload=item,
                        )
                    )
            except (httpx.HTTPError, ValueError, KeyError, json.JSONDecodeError) as exc:
                logger.error(f"Jobicy query failed for params {params}: {exc}")

        logger.info(f"Jobicy adapter fetched {len(raw_jobs)} unique listings.")
        return raw_jobs

    def normalize(self, raw: RawJobData) -> NormalizedJobData:
        item = raw.payload
        job_url = item.get("url", raw.source_url)
        canonical = canonicalize_url(job_url)

        title = item.get("jobTitle", "Remote Software Engineer")
        company = item.get("companyName", "Technology Employer")
        raw_location = item.get("jobGeo", "Worldwide")

        # HTML clean
        raw_desc = item.get("jobDescription", "")
        desc_text = BeautifulSoup(raw_desc, "html.parser").get_text(separator=" ", strip=True) if raw_desc else title

        # Seniority & Employment
        seniority = SeniorityLevel.UNKNOWN
        title_lower = title.lower()
        if any(w in title_lower for w in ["intern", "trainee"]):
            seniority = SeniorityLevel.INTERNSHIP
        elif any(w in title_lower for w in ["junior", "entry", "associate"]):
            seniority = SeniorityLevel.JUNIOR
        elif "lead" in title_lower or "staff" in title_lower:
            seniority = SeniorityLevel.LEAD
        elif "senior" in title_lower or "sr." in title_lower:
            seniority = SeniorityLevel.SENIOR

        job_type = str(item.get("jobType", "")).lower()
        employment_type = EmploymentType.FULL_TIME
        if "contract" in job_type or "freelance" in job_type:
            employment_type = EmploymentType.CONTRACT
        elif "intern" in job_type or seniority == SeniorityLevel.INTERNSHIP:
            employment_type = EmploymentType.INTERNSHIP
        elif "part-time" in job_type or "part_time" in job_type:
            employment_type = EmploymentType.PART_TIME

        # Publication date
        pub_date: datetime | None = None
        pub_str = item.get("pubDate")
        if pub_str:
            try:
                pub_date = date_parser.parse(pub_str)
                if pub_date.tzinfo is None:
                    pub_date = pub_date.replace(tzinfo=UTC)
            except (ValueError, TypeError, OverflowError):
                pub_date = None

        # Salary parsing
        salary_min = None
        salary_max = None
        try:
            if item.get("annualSalaryMin"):
                salary_min = float(item["annualSalaryMin"])
            if item.get("annualSalaryMax"):
                salary_max = float(item["annualSalaryMax"])
        except (ValueError, TypeError):
            pass

        # Location & Remote scope
        remote_scope = raw_location
        workplace_type = WorkplaceType.REMOTE

        # Required skills
        skills: list[str] = []
        tags = item.get("jobIndustry") or []
        if isinstance(tags, list):
            skills.extend([str(t).strip() for t in tags if str(t).strip()])

        for tech in ["angular", "react", "typescript", "javascript", "vue", "node", "python", "html", "css"]:
            has_tech = bool(
                re.search(rf"\b{re.escape(tech)}\b", title_lower)
                or re.search(rf"\b{re.escape(tech)}\b", desc_text[:1000].lower())
            )
            if has_tech and tech.title() not in skills:
                skills.append(tech.title())

        return NormalizedJobData(
            source_name="jobicy",
            source_job_id=raw.source_job_id,
            source_url=job_url,
            canonical_url=canonical,
            original_application_url=job_url,
            company=company,
            title=title,
            description_text=desc_text,
            description_html=raw_desc,
            raw_location=raw_location,
            country_codes=[],
            workplace_type=workplace_type,
            remote_scope=remote_scope,
            seniority=seniority,
            employment_type=employment_type,
            salary_min=salary_min,
            salary_max=salary_max,
            salary_currency=item.get("salaryCurrency", "USD"),
            salary_period="YEARLY",
            required_skills=skills,
            published_at=pub_date,
            raw_payload=item,
        )
