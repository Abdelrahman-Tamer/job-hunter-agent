"""Normalized job opportunity database model."""

from datetime import datetime, timezone
from typing import Any
import sqlalchemy as sa
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    JSON,
    Enum as SQLEnum,
)
from sqlalchemy.orm import relationship
from src.core.database import Base
from src.models.enums import (
    EmploymentType,
    GeographicEligibility,
    JobTrack,
    MatchBand,
    SeniorityLevel,
    WorkplaceType,
)


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


class Job(Base):
    """
    Normalized job opportunity model.
    Encapsulates verified attributes, geographic classification, and deterministic match results.
    """
    __tablename__ = "jobs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    source_id = Column(Integer, ForeignKey("sources.id"), nullable=False, index=True)
    source_name = Column(String(100), nullable=False)
    source_job_id = Column(String(255), nullable=False)
    source_url = Column(String(1024), nullable=False)
    canonical_url_hash = Column(String(64), nullable=False, index=True)
    original_application_url = Column(String(1024), nullable=False)

    company = Column(String(255), nullable=False, index=True)
    title = Column(String(255), nullable=False, index=True)
    description_text = Column(Text, nullable=False)
    description_html = Column(Text, nullable=True)

    raw_location = Column(String(255), nullable=True)
    country_codes = Column(JSON, default=list, nullable=False)
    workplace_type = Column(SQLEnum(WorkplaceType), default=WorkplaceType.UNKNOWN, nullable=False)
    remote_scope = Column(String(255), nullable=True)  # e.g. "Worldwide", "EMEA", "US only"
    eligible_countries = Column(JSON, default=list, nullable=False)
    excluded_countries = Column(JSON, default=list, nullable=False)

    seniority = Column(SQLEnum(SeniorityLevel), default=SeniorityLevel.UNKNOWN, nullable=False)
    employment_type = Column(SQLEnum(EmploymentType), default=EmploymentType.UNKNOWN, nullable=False)

    salary_min = Column(Float, nullable=True)
    salary_max = Column(Float, nullable=True)
    salary_currency = Column(String(10), nullable=True)
    salary_period = Column(String(20), nullable=True)  # YEARLY, MONTHLY, HOURLY

    required_skills = Column(JSON, default=list, nullable=False)
    preferred_skills = Column(JSON, default=list, nullable=False)
    required_experience_years = Column(Float, nullable=True)

    published_at = Column(DateTime(timezone=True), nullable=True, index=True)
    first_seen_at = Column(DateTime(timezone=True), default=now_utc, nullable=False, index=True)
    last_seen_at = Column(DateTime(timezone=True), default=now_utc, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False, index=True)
    is_expired = Column(Boolean, default=False, server_default=sa.false(), nullable=False, index=True)
    last_verified_at = Column(DateTime(timezone=True), nullable=True)
    expiry_reason = Column(String(255), nullable=True)

    # Classification & Deterministic Scoring
    job_track = Column(
        SQLEnum(JobTrack, native_enum=False, length=50),
        default=JobTrack.OTHER,
        server_default="OTHER",
        nullable=False,
        index=True,
    )
    opportunity_segment = Column(
        String(32),
        default="OTHER",
        server_default="OTHER",
        nullable=False,
        index=True,
    )
    is_social_post = Column(
        Boolean,
        default=False,
        server_default=sa.false(),
        nullable=False,
        index=True,
    )
    eligibility = Column(
        SQLEnum(GeographicEligibility),
        default=GeographicEligibility.UNKNOWN,
        nullable=False,
        index=True,
    )
    eligibility_reason = Column(String(500), default="", nullable=False)
    match_score = Column(Float, default=0.0, nullable=False, index=True)
    match_band = Column(SQLEnum(MatchBand), default=MatchBand.LOW, nullable=False)
    score_breakdown = Column(JSON, default=dict, nullable=False)
    match_reasons = Column(JSON, default=list, nullable=False)
    skill_gaps = Column(JSON, default=list, nullable=False)
    match_confidence = Column(Float, default=0.0, nullable=False)

    # Safe payload audit
    raw_payload = Column(JSON, default=dict, nullable=False)

    created_at = Column(DateTime(timezone=True), default=now_utc, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=now_utc, onupdate=now_utc, nullable=False)

    # Relationships (explicitly loaded at call sites via selectinload/contains_eager)
    source = relationship("Source", back_populates="jobs")
    tracker = relationship("JobStatusTracker", back_populates="job", uselist=False, cascade="all, delete-orphan")
    notifications = relationship("NotificationLog", back_populates="job", cascade="all, delete-orphan")
    notes = relationship("ApplicationNote", back_populates="job", cascade="all, delete-orphan")

    def __init__(self, **kwargs: Any) -> None:
        raw_payload = kwargs.get("raw_payload") or {}
        if "is_social_post" not in kwargs:
            if isinstance(raw_payload, dict) and "is_social_post" in raw_payload:
                kwargs["is_social_post"] = bool(raw_payload["is_social_post"])
            else:
                s_name = str(kwargs.get("source_name") or "").lower()
                kwargs["is_social_post"] = ("linkedin_social" in s_name) or ("social" in s_name)
        else:
            kwargs["is_social_post"] = bool(kwargs["is_social_post"])

        if "opportunity_segment" not in kwargs:
            if isinstance(raw_payload, dict) and raw_payload.get("opportunity_segment"):
                seg_val = raw_payload["opportunity_segment"]
                kwargs["opportunity_segment"] = seg_val.value if hasattr(seg_val, "value") else str(seg_val)
            elif any(k in kwargs for k in ("raw_location", "workplace_type", "remote_scope", "eligibility")):
                from src.engine.eligibility import GeographicEligibilityEngine
                engine = GeographicEligibilityEngine()
                kwargs["opportunity_segment"] = engine.classify_segment(
                    raw_location=kwargs.get("raw_location"),
                    workplace_type=kwargs.get("workplace_type") or WorkplaceType.UNKNOWN,
                    remote_scope=kwargs.get("remote_scope"),
                    eligibility=kwargs.get("eligibility"),
                    description_text=kwargs.get("description_text"),
                ).value
        else:
            seg_val = kwargs["opportunity_segment"]
            kwargs["opportunity_segment"] = seg_val.value if hasattr(seg_val, "value") else str(seg_val)

        super().__init__(**kwargs)

    @property
    def source_category_label(self) -> str:
        """Display label distinguishing Social Post vs Job Board."""
        return "Social Post" if self.is_social_post else "Job Board"

    __table_args__ = (
        Index("ix_jobs_source_and_id", "source_name", "source_job_id", unique=True),
        Index("ix_jobs_eligibility_score", "eligibility", "match_score"),
        Index("ix_jobs_active_score_seen", "match_score", "first_seen_at", "id", postgresql_where=sa.text("is_active = true")),
        Index("ix_jobs_active_track_score", "job_track", "match_score", "first_seen_at", "id", postgresql_where=sa.text("is_active = true")),
        Index("ix_jobs_segment_social_score", "opportunity_segment", "is_social_post", "match_score", postgresql_where=sa.text("is_active = true")),
        Index("ix_jobs_expiry_scan", "last_verified_at", "first_seen_at", postgresql_where=sa.text("is_active = true AND is_expired = false")),
    )
