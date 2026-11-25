"""RSS/Atom syndication feed adapter."""

import calendar
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse
from bs4 import BeautifulSoup
import feedparser

from src.core.logging import logger
from src.core.security import canonicalize_url
from src.models.enums import EmploymentType, SeniorityLevel, WorkplaceType
from src.sources.base import BaseSourceAdapter, NormalizedJobData, RawJobData, SourceMetadata
from src.sources.http_client import ResilientHttpClient


class RSSAdapter(BaseSourceAdapter):
    """Adapter for standard RSS 2.0 and Atom job syndication feeds."""

    def __init__(
        self,
        feed_url: str,
        name: Optional[str] = None,
        http_client: Optional[ResilientHttpClient] = None,
    ):
        self.feed_url = feed_url.strip()
        parsed = urlparse(self.feed_url)
        self.domain = parsed.netloc or "rss_feed"
        self._name = name or f"rss_{self.domain.replace('.', '_')}"
        self.http_client = http_client or ResilientHttpClient()

    def source_metadata(self) -> SourceMetadata:
        return SourceMetadata(
            name=self._name,
            source_type="rss",
            base_url=self.feed_url,
            doc_url=self.feed_url,
            allowed_usage_summary="Public syndication RSS/Atom feed. Links to original published posting.",
            rate_limit_req_per_minute=10,
            attribution_requirement=f"Attributed to syndication feed ({self.domain}).",
            freshness_limitations="Refreshed periodically conforming to feed TTL.",
            fields_provided=["title", "link", "description", "pubDate", "guid"],
        )

    async def health_check(self) -> bool:
        try:
            resp = await self.http_client.get(self.feed_url)
            parsed = feedparser.parse(resp.text)
            return len(parsed.entries) > 0 or not bool(parsed.bozo)
        except Exception as exc:
            logger.error(f"RSS ({self._name}) health check failed: {exc}")
            return False

    async def fetch_jobs(
        self,
        since: Optional[datetime] = None,
        query_config: Optional[Dict[str, Any]] = None,
    ) -> List[RawJobData]:
        raw_jobs: List[RawJobData] = []
        try:
            resp = await self.http_client.get(self.feed_url)
            parsed = feedparser.parse(resp.text)

            for entry in parsed.entries:
                job_id = entry.get("id") or entry.get("guid") or entry.get("link")
                raw_jobs.append(
                    RawJobData(
                        source_name=self._name,
                        source_job_id=str(job_id),
                        source_url=entry.get("link", ""),
                        payload=dict(entry),
                    )
                )
        except Exception as exc:
            logger.error(f"Failed to fetch jobs from RSS ({self._name}): {exc}")
            raise

        return raw_jobs

    def normalize(self, raw_job: RawJobData) -> NormalizedJobData:
        entry = raw_job.payload

        raw_desc = entry.get("summary") or entry.get("description") or ""
        soup = BeautifulSoup(raw_desc, "html.parser")
        text_desc = soup.get_text(separator="\n", strip=True)

        published_at: Optional[datetime] = None
        parsed_date = entry.get("published_parsed")
        if parsed_date:
            try:
                published_at = datetime.fromtimestamp(calendar.timegm(parsed_date), tz=timezone.utc)
            except Exception:
                published_at = None

        title = entry.get("title", "Untitled")
        # Many RSS feeds format title as "Company: Job Title" or "Job Title at Company"
        company = "Unknown"
        if ":" in title:
            parts = title.split(":", 1)
            company = parts[0].strip()
            title = parts[1].strip()
        elif " at " in title:
            parts = title.split(" at ", 1)
            title = parts[0].strip()
            company = parts[1].strip()

        link = entry.get("link", "")
        canonical = canonicalize_url(link)

        return NormalizedJobData(
            source_name=raw_job.source_name,
            source_job_id=raw_job.source_job_id,
            source_url=link,
            canonical_url=canonical,
            original_application_url=link,
            company=company,
            title=title,
            description_text=text_desc,
            description_html=raw_desc,
            raw_location="Remote",
            country_codes=[],
            workplace_type=WorkplaceType.REMOTE,
            remote_scope=None,
            eligible_countries=[],
            excluded_countries=[],
            seniority=SeniorityLevel.UNKNOWN,
            employment_type=EmploymentType.FULL_TIME,
            required_skills=[],
            preferred_skills=[],
            published_at=published_at,
            raw_payload=entry,
        )
