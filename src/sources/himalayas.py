"""Himalayas Public Jobs API adapter."""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from bs4 import BeautifulSoup

from src.core.logging import logger
from src.core.security import canonicalize_url
from src.models.enums import EmploymentType, SeniorityLevel, WorkplaceType
from src.sources.base import BaseSourceAdapter, NormalizedJobData, RawJobData, SourceMetadata
from src.sources.http_client import ResilientHttpClient


class HimalayasAdapter(BaseSourceAdapter):
    """Adapter for Himalayas public jobs API."""

    API_BASE = "https://himalayas.app/jobs/api"
    DOC_URL = "https://himalayas.app/jobs/api"

    def __init__(self, http_client: Optional[ResilientHttpClient] = None):
        self.http_client = http_client or ResilientHttpClient()

    def source_metadata(self) -> SourceMetadata:
        return SourceMetadata(
            name="himalayas",
            source_type="himalayas",
            base_url=self.API_BASE,
            doc_url=self.DOC_URL,
            allowed_usage_summary="Public read-only API supporting cursor pagination and search filters. Application links must be preserved unchanged.",
            rate_limit_req_per_minute=30,
            attribution_requirement="Visibly attribute Himalayas and preserve applicationLink intact.",
            freshness_limitations="Near real-time remote job listings; supports cursor pagination.",
            fields_provided=[
                "title", "companyName", "description", "locationRestrictions",
                "employmentType", "seniority", "minSalary", "maxSalary",
                "currency", "pubDate", "expiryDate", "applicationLink", "guid"
            ],
        )

    async def health_check(self) -> bool:
        try:
            resp = await self.http_client.get(self.API_BASE, params={"limit": 1})
            return resp.status_code == 200
        except Exception as exc:
            logger.error(f"Himalayas health check failed: {exc}")
            return False

    async def fetch_jobs(
        self,
        since: Optional[datetime] = None,
        query_config: Optional[Dict[str, Any]] = None,
    ) -> List[RawJobData]:
        params: Dict[str, Any] = {"limit": 50}
        if query_config and "cursor" in query_config:
            params["cursor"] = query_config["cursor"]

        raw_jobs: List[RawJobData] = []
        try:
            resp = await self.http_client.get(self.API_BASE, params=params)
            data = resp.json()
            jobs_list = data.get("jobs", [])

            for item in jobs_list:
                # Use guid or applicationLink as unique job identifier
                job_id = str(item.get("guid") or item.get("applicationLink") or "")
                raw_jobs.append(
                    RawJobData(
                        source_name="himalayas",
                        source_job_id=job_id,
                        source_url=item.get("applicationLink", ""),
                        payload=item,
                    )
                )
        except Exception as exc:
            logger.error(f"Failed to fetch jobs from Himalayas: {exc}")
            raise

        return raw_jobs

    def normalize(self, raw_job: RawJobData) -> NormalizedJobData:
        item = raw_job.payload

        # Clean HTML description
        raw_desc = item.get("description", "")
        soup = BeautifulSoup(raw_desc, "html.parser")
        text_desc = soup.get_text(separator="\n", strip=True)

        # Parse publication date (Unix timestamp)
        published_at: Optional[datetime] = None
        pub_date_val = item.get("pubDate")
        if pub_date_val:
            try:
                published_at = datetime.fromtimestamp(int(pub_date_val), tz=timezone.utc)
            except Exception:
                published_at = None

        # Map seniority
        raw_seniority = str(item.get("seniority", "")).upper()
        seniority = SeniorityLevel.UNKNOWN
        for level in SeniorityLevel:
            if level.value in raw_seniority:
                seniority = level
                break

        # Map employment type
        raw_emp = str(item.get("employmentType", "")).upper()
        emp_type = EmploymentType.UNKNOWN
        if "FULL" in raw_emp:
            emp_type = EmploymentType.FULL_TIME
        elif "PART" in raw_emp:
            emp_type = EmploymentType.PART_TIME
        elif "CONTRACT" in raw_emp:
            emp_type = EmploymentType.CONTRACT
        elif "INTERN" in raw_emp:
            emp_type = EmploymentType.INTERNSHIP

        # Location restrictions
        location_restrictions = item.get("locationRestrictions", [])
        if isinstance(location_restrictions, str):
            location_restrictions = [location_restrictions]

        remote_scope = ", ".join(location_restrictions) if location_restrictions else "Remote"

        app_link = item.get("applicationLink", "")
        canonical = canonicalize_url(app_link)

        return NormalizedJobData(
            source_name="himalayas",
            source_job_id=raw_job.source_job_id,
            source_url=app_link,
            canonical_url=canonical,
            original_application_url=app_link,
            company=item.get("companyName", "Unknown"),
            title=item.get("title", "Untitled"),
            description_text=text_desc,
            description_html=raw_desc,
            raw_location=remote_scope,
            country_codes=[],
            workplace_type=WorkplaceType.REMOTE,  # Himalayas is remote-first
            remote_scope=remote_scope,
            eligible_countries=location_restrictions,
            excluded_countries=[],
            seniority=seniority,
            employment_type=emp_type,
            salary_min=float(item["minSalary"]) if item.get("minSalary") is not None else None,
            salary_max=float(item["maxSalary"]) if item.get("maxSalary") is not None else None,
            salary_currency=item.get("currency"),
            salary_period=item.get("salaryPeriod"),
            required_skills=item.get("categories", []),
            preferred_skills=[],
            published_at=published_at,
            raw_payload=item,
        )
