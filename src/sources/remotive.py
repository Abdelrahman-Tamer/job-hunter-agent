"""Remotive Public Jobs API adapter."""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from bs4 import BeautifulSoup
from dateutil import parser as date_parser

from src.core.logging import logger
from src.core.security import canonicalize_url
from src.models.enums import EmploymentType, SeniorityLevel, WorkplaceType
from src.sources.base import BaseSourceAdapter, NormalizedJobData, RawJobData, SourceMetadata
from src.sources.http_client import ResilientHttpClient


class RemotiveAdapter(BaseSourceAdapter):
    """Adapter for Remotive public remote jobs API."""

    API_BASE = "https://remotive.com/api/remote-jobs"
    DOC_URL = "https://remotive.com/api-documentation"

    def __init__(self, http_client: Optional[ResilientHttpClient] = None):
        self.http_client = http_client or ResilientHttpClient()

    def source_metadata(self) -> SourceMetadata:
        return SourceMetadata(
            name="remotive",
            source_type="remotive",
            base_url=self.API_BASE,
            doc_url=self.DOC_URL,
            allowed_usage_summary="Public read-only remote jobs feed. Jobs are delayed by 24 hours. Recommended max 4 requests/day. Must link to Remotive job listing.",
            rate_limit_req_per_minute=4,  # Max 4 requests per day recommended by terms
            attribution_requirement="Link back to Remotive listing and mention Remotive as source.",
            freshness_limitations="Public jobs delayed by 24 hours.",
            fields_provided=[
                "id", "url", "title", "company_name", "category", "tags",
                "job_type", "publication_date", "candidate_required_location",
                "salary", "description"
            ],
        )

    async def health_check(self) -> bool:
        try:
            resp = await self.http_client.get(self.API_BASE, params={"limit": 1})
            return resp.status_code == 200
        except Exception as exc:
            logger.error(f"Remotive health check failed: {exc}")
            return False

    async def fetch_jobs(
        self,
        since: Optional[datetime] = None,
        query_config: Optional[Dict[str, Any]] = None,
    ) -> List[RawJobData]:
        params: Dict[str, Any] = {}
        if query_config and "category" in query_config:
            params["category"] = query_config["category"]
        if query_config and "limit" in query_config:
            params["limit"] = query_config["limit"]

        raw_jobs: List[RawJobData] = []
        try:
            resp = await self.http_client.get(self.API_BASE, params=params)
            data = resp.json()
            jobs_list = data.get("jobs", [])

            for item in jobs_list:
                job_id = str(item.get("id"))
                raw_jobs.append(
                    RawJobData(
                        source_name="remotive",
                        source_job_id=job_id,
                        source_url=item.get("url", ""),
                        payload=item,
                    )
                )
        except Exception as exc:
            logger.error(f"Failed to fetch jobs from Remotive: {exc}")
            raise

        return raw_jobs

    def normalize(self, raw_job: RawJobData) -> NormalizedJobData:
        item = raw_job.payload

        # Clean HTML description
        raw_desc = item.get("description", "")
        soup = BeautifulSoup(raw_desc, "html.parser")
        text_desc = soup.get_text(separator="\n", strip=True)

        # Parse publication date (ISO string)
        published_at: Optional[datetime] = None
        pub_str = item.get("publication_date")
        if pub_str:
            try:
                published_at = date_parser.isoparse(pub_str)
                if published_at.tzinfo is None:
                    published_at = published_at.replace(tzinfo=timezone.utc)
            except Exception:
                published_at = None

        # Employment type
        raw_type = str(item.get("job_type", "")).lower()
        emp_type = EmploymentType.UNKNOWN
        if "full" in raw_type:
            emp_type = EmploymentType.FULL_TIME
        elif "part" in raw_type:
            emp_type = EmploymentType.PART_TIME
        elif "contract" in raw_type or "freelance" in raw_type:
            emp_type = EmploymentType.CONTRACT
        elif "intern" in raw_type:
            emp_type = EmploymentType.INTERNSHIP

        location_str = item.get("candidate_required_location", "")
        canonical = canonicalize_url(item.get("url", ""))

        return NormalizedJobData(
            source_name="remotive",
            source_job_id=raw_job.source_job_id,
            source_url=item.get("url", ""),
            canonical_url=canonical,
            original_application_url=item.get("url", ""),
            company=item.get("company_name", "Unknown"),
            title=item.get("title", "Untitled"),
            description_text=text_desc,
            description_html=raw_desc,
            raw_location=location_str,
            country_codes=[],
            workplace_type=WorkplaceType.REMOTE,  # Remotive is remote
            remote_scope=location_str or "Remote",
            eligible_countries=[location_str] if location_str else [],
            excluded_countries=[],
            seniority=SeniorityLevel.UNKNOWN,  # To be extracted/classified
            employment_type=emp_type,
            required_skills=item.get("tags", []),
            preferred_skills=[],
            published_at=published_at,
            raw_payload=item,
        )
