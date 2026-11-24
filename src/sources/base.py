"""Base contract and dataclasses for job source adapters."""

from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

from src.models.enums import (
    EmploymentType,
    GeographicEligibility,
    SeniorityLevel,
    WorkplaceType,
)


class SourceMetadata(BaseModel):
    """Metadata describing a source adapter, its terms, and operational boundaries."""
    name: str
    source_type: str
    base_url: str
    doc_url: str
    allowed_usage_summary: str
    rate_limit_req_per_minute: int
    attribution_requirement: str
    freshness_limitations: str
    fields_provided: List[str]


class RawJobData(BaseModel):
    """Raw payload captured from source adapter before normalization."""
    source_name: str
    source_job_id: str
    source_url: str
    payload: Dict[str, Any]
    retrieved_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class NormalizedJobData(BaseModel):
    """Clean, standardized representation of a discovered job."""
    source_name: str
    source_job_id: str
    source_url: str
    canonical_url: str
    original_application_url: str

    company: str
    title: str
    description_text: str
    description_html: Optional[str] = None

    raw_location: Optional[str] = None
    country_codes: List[str] = Field(default_factory=list)
    workplace_type: WorkplaceType = WorkplaceType.UNKNOWN
    remote_scope: Optional[str] = None
    eligible_countries: List[str] = Field(default_factory=list)
    excluded_countries: List[str] = Field(default_factory=list)

    seniority: SeniorityLevel = SeniorityLevel.UNKNOWN
    employment_type: EmploymentType = EmploymentType.UNKNOWN

    salary_min: Optional[float] = None
    salary_max: Optional[float] = None
    salary_currency: Optional[str] = None
    salary_period: Optional[str] = None

    required_skills: List[str] = Field(default_factory=list)
    preferred_skills: List[str] = Field(default_factory=list)
    required_experience_years: Optional[float] = None

    published_at: Optional[datetime] = None  # Explicit publication timestamp from source, if any
    is_social_post: bool = False
    raw_payload: Dict[str, Any] = Field(default_factory=dict)


class BaseSourceAdapter(ABC):
    """Abstract base class for all job source adapters."""

    @abstractmethod
    def source_metadata(self) -> SourceMetadata:
        """Return declaration of source name, policy URL, rate limits, and attribution."""
        pass

    @abstractmethod
    async def health_check(self) -> bool:
        """Verify endpoint connectivity and contract health."""
        pass

    @abstractmethod
    async def fetch_jobs(
        self,
        since: Optional[datetime] = None,
        query_config: Optional[Dict[str, Any]] = None,
    ) -> List[RawJobData]:
        """Fetch raw jobs conforming to rate limits and pagination boundaries."""
        pass

    @abstractmethod
    def normalize(self, raw_job: RawJobData) -> NormalizedJobData:
        """Transform raw payload into standard normalized job data."""
        pass
