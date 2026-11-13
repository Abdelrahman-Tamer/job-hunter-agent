"""Lever Postings Public API adapter."""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from bs4 import BeautifulSoup

from src.core.logging import logger
from src.core.security import canonicalize_url
from src.models.enums import EmploymentType, SeniorityLevel, WorkplaceType
from src.sources.base import BaseSourceAdapter, NormalizedJobData, RawJobData, SourceMetadata
from src.sources.http_client import ResilientHttpClient


class LeverAdapter(BaseSourceAdapter):
    """Adapter for Lever Postings public API."""

    API_BASE = "https://api.lever.co/v0/postings"
    DOC_URL = "https://github.com/lever/postings-api"

    def __init__(
        self,
        company_slug: str = "palantir",
        http_client: Optional[ResilientHttpClient] = None,
    ):
        self.company_slug = company_slug.strip().lower()
        self.http_client = http_client or ResilientHttpClient()

    def source_metadata(self) -> SourceMetadata:
        return SourceMetadata(
            name=f"lever_{self.company_slug}",
            source_type="lever",
            base_url=f"{self.API_BASE}/{self.company_slug}",
            doc_url=self.DOC_URL,
            allowed_usage_summary="Public read-only employer posting endpoint. Links to original hosted posting.",
            rate_limit_req_per_minute=20,
            attribution_requirement=f"Attributed to employer career postings on Lever ({self.company_slug}).",
            freshness_limitations="Real-time published employer jobs.",
            fields_provided=["id", "text", "categories", "createdAt", "hostedUrl", "descriptionPlain", "description"],
        )

    async def health_check(self) -> bool:
        try:
            url = f"{self.API_BASE}/{self.company_slug}?mode=json"
            resp = await self.http_client.get(url)
            return resp.status_code == 200 and isinstance(resp.json(), list)
        except Exception as exc:
            logger.error(f"Lever ({self.company_slug}) health check failed: {exc}")
            return False

    async def fetch_jobs(
        self,
        since: Optional[datetime] = None,
        query_config: Optional[Dict[str, Any]] = None,
    ) -> List[RawJobData]:
        url = f"{self.API_BASE}/{self.company_slug}?mode=json"

        raw_jobs: List[RawJobData] = []
        try:
            resp = await self.http_client.get(url)
            data = resp.json()
            if not isinstance(data, list):
                logger.warning(f"Unexpected response from Lever ({self.company_slug}): {data}")
                return []

            for item in data:
                job_id = str(item.get("id"))
                raw_jobs.append(
                    RawJobData(
                        source_name=f"lever_{self.company_slug}",
                        source_job_id=job_id,
                        source_url=item.get("hostedUrl", ""),
                        payload=item,
                    )
                )
        except Exception as exc:
            logger.error(f"Failed to fetch jobs from Lever ({self.company_slug}): {exc}")
            raise

        return raw_jobs

    def normalize(self, raw_job: RawJobData) -> NormalizedJobData:
        item = raw_job.payload
        categories = item.get("categories", {}) or {}

        raw_location = categories.get("location", "")
        commitment = str(categories.get("commitment", "")).lower()

        # Employment type
        emp_type = EmploymentType.UNKNOWN
        if "full" in commitment:
            emp_type = EmploymentType.FULL_TIME
        elif "part" in commitment:
            emp_type = EmploymentType.PART_TIME
        elif "contract" in commitment or "intern" in commitment:
            emp_type = EmploymentType.CONTRACT if "contract" in commitment else EmploymentType.INTERNSHIP

        # Workplace type
        workplace_type = WorkplaceType.UNKNOWN
        loc_lower = raw_location.lower()
        workplace_tag = str(item.get("workplaceType", "")).lower()
        if "remote" in workplace_tag or "remote" in loc_lower:
            workplace_type = WorkplaceType.REMOTE
        elif "hybrid" in workplace_tag or "hybrid" in loc_lower:
            workplace_type = WorkplaceType.HYBRID
        elif raw_location:
            workplace_type = WorkplaceType.ON_SITE

        # Parse publication date (Unix timestamp in ms)
        published_at: Optional[datetime] = None
        created_val = item.get("createdAt")
        if created_val:
            try:
                published_at = datetime.fromtimestamp(int(created_val) / 1000.0, tz=timezone.utc)
            except Exception:
                published_at = None

        description_text = item.get("descriptionPlain", "")
        description_html = item.get("description", "")
        if not description_text and description_html:
            soup = BeautifulSoup(description_html, "html.parser")
            description_text = soup.get_text(separator="\n", strip=True)

        hosted_url = item.get("hostedUrl", "")
        canonical = canonicalize_url(hosted_url)

        return NormalizedJobData(
            source_name=raw_job.source_name,
            source_job_id=raw_job.source_job_id,
            source_url=hosted_url,
            canonical_url=canonical,
            original_application_url=item.get("applyUrl") or hosted_url,
            company=self.company_slug.capitalize(),
            title=item.get("text", "Untitled"),
            description_text=description_text,
            description_html=description_html,
            raw_location=raw_location,
            country_codes=[],
            workplace_type=workplace_type,
            remote_scope=raw_location if workplace_type == WorkplaceType.REMOTE else None,
            eligible_countries=[],
            excluded_countries=[],
            seniority=SeniorityLevel.UNKNOWN,
            employment_type=emp_type,
            required_skills=[],
            preferred_skills=[],
            published_at=published_at,
            raw_payload=item,
        )
