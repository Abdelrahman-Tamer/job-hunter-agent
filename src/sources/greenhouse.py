"""Greenhouse Job Board Public API adapter."""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from bs4 import BeautifulSoup
from dateutil import parser as date_parser

from src.core.logging import logger
from src.core.security import canonicalize_url
from src.models.enums import EmploymentType, SeniorityLevel, WorkplaceType
from src.sources.base import BaseSourceAdapter, NormalizedJobData, RawJobData, SourceMetadata
from src.sources.http_client import ResilientHttpClient


class GreenhouseAdapter(BaseSourceAdapter):
    """Adapter for public Greenhouse Job Boards."""

    API_BASE = "https://boards-api.greenhouse.io/v1/boards"
    DOC_URL = "https://developers.greenhouse.io/job-board.html"

    def __init__(
        self,
        board_token: str = "canonical",
        http_client: Optional[ResilientHttpClient] = None,
    ):
        self.board_token = board_token.strip().lower()
        self.http_client = http_client or ResilientHttpClient()

    def source_metadata(self) -> SourceMetadata:
        return SourceMetadata(
            name=f"greenhouse_{self.board_token}",
            source_type="greenhouse",
            base_url=f"{self.API_BASE}/{self.board_token}",
            doc_url=self.DOC_URL,
            allowed_usage_summary="Public read-only career board endpoint. Directly link to application form.",
            rate_limit_req_per_minute=20,
            attribution_requirement=f"Attributed to employer career board on Greenhouse ({self.board_token}).",
            freshness_limitations="Real-time published board jobs.",
            fields_provided=["id", "title", "location", "updated_at", "absolute_url", "content"],
        )

    async def health_check(self) -> bool:
        try:
            url = f"{self.API_BASE}/{self.board_token}/jobs"
            resp = await self.http_client.get(url, params={"content": "false"})
            return resp.status_code == 200
        except Exception as exc:
            logger.error(f"Greenhouse ({self.board_token}) health check failed: {exc}")
            return False

    async def fetch_jobs(
        self,
        since: Optional[datetime] = None,
        query_config: Optional[Dict[str, Any]] = None,
    ) -> List[RawJobData]:
        url = f"{self.API_BASE}/{self.board_token}/jobs"
        params = {"content": "true"}

        raw_jobs: List[RawJobData] = []
        try:
            resp = await self.http_client.get(url, params=params)
            data = resp.json()
            jobs_list = data.get("jobs", [])

            for item in jobs_list:
                job_id = str(item.get("id"))
                raw_jobs.append(
                    RawJobData(
                        source_name=f"greenhouse_{self.board_token}",
                        source_job_id=job_id,
                        source_url=item.get("absolute_url", ""),
                        payload=item,
                    )
                )
        except Exception as exc:
            logger.error(f"Failed to fetch jobs from Greenhouse ({self.board_token}): {exc}")
            raise

        return raw_jobs

    def normalize(self, raw_job: RawJobData) -> NormalizedJobData:
        item = raw_job.payload

        # Clean HTML content
        raw_content = item.get("content", "")
        soup = BeautifulSoup(raw_content, "html.parser")
        text_desc = soup.get_text(separator="\n", strip=True)

        # Parse updated_at
        published_at: Optional[datetime] = None
        updated_str = item.get("updated_at")
        if updated_str:
            try:
                published_at = date_parser.isoparse(updated_str)
                if published_at.tzinfo is None:
                    published_at = published_at.replace(tzinfo=timezone.utc)
            except Exception:
                published_at = None

        location_obj = item.get("location", {})
        raw_location = location_obj.get("name", "") if isinstance(location_obj, dict) else str(location_obj)

        workplace_type = WorkplaceType.UNKNOWN
        loc_lower = raw_location.lower()
        if "remote" in loc_lower or "home based" in loc_lower or "anywhere" in loc_lower:
            workplace_type = WorkplaceType.REMOTE
        elif "hybrid" in loc_lower:
            workplace_type = WorkplaceType.HYBRID
        elif raw_location:
            workplace_type = WorkplaceType.ON_SITE

        app_url = item.get("absolute_url", "")
        canonical = canonicalize_url(app_url)

        return NormalizedJobData(
            source_name=raw_job.source_name,
            source_job_id=raw_job.source_job_id,
            source_url=app_url,
            canonical_url=canonical,
            original_application_url=app_url,
            company=self.board_token.capitalize(),
            title=item.get("title", "Untitled"),
            description_text=text_desc,
            description_html=raw_content,
            raw_location=raw_location,
            country_codes=[],
            workplace_type=workplace_type,
            remote_scope=raw_location if workplace_type == WorkplaceType.REMOTE else None,
            eligible_countries=[],
            excluded_countries=[],
            seniority=SeniorityLevel.UNKNOWN,
            employment_type=EmploymentType.FULL_TIME,  # Greenhouse default is usually full time
            required_skills=[],
            preferred_skills=[],
            published_at=published_at,
            raw_payload=item,
        )
