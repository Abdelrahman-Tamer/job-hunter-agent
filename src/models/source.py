"""Source and source execution logs data models."""

from datetime import datetime, timezone
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, JSON
from sqlalchemy.orm import relationship
from src.core.database import Base


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


class Source(Base):
    """Configuration and state of an integrated job source."""
    __tablename__ = "sources"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), unique=True, nullable=False, index=True)
    source_type = Column(String(50), nullable=False)  # himalayas, remotive, greenhouse, lever, rss, user_alert
    base_url = Column(String(255), nullable=False)
    doc_url = Column(String(255), nullable=False)
    is_enabled = Column(Boolean, default=True, nullable=False)

    config_json = Column(JSON, default=dict, nullable=False)
    rate_limit_req_per_minute = Column(Integer, default=30, nullable=False)
    attribution_text = Column(String(255), nullable=False)

    last_sync_at = Column(DateTime(timezone=True), nullable=True)
    last_sync_status = Column(String(50), nullable=True)
    last_sync_error = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), default=now_utc, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=now_utc, onupdate=now_utc, nullable=False)

    # Relationships
    jobs = relationship("Job", back_populates="source", cascade="all, delete-orphan", lazy="selectin")
    sync_logs = relationship("SourceSyncLog", back_populates="source", cascade="all, delete-orphan", lazy="selectin")


class SourceSyncLog(Base):
    """Individual execution history for a source ingestion pass."""
    __tablename__ = "source_sync_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    source_id = Column(Integer, ForeignKey("sources.id"), nullable=False, index=True)
    run_id = Column(Integer, ForeignKey("daily_runs.id"), nullable=True, index=True)

    status = Column(String(50), nullable=False)  # SUCCESS, FAILED, PARTIAL
    jobs_fetched = Column(Integer, default=0, nullable=False)
    jobs_normalized = Column(Integer, default=0, nullable=False)
    jobs_new = Column(Integer, default=0, nullable=False)
    duration_seconds = Column(Integer, default=0, nullable=False)
    error_message = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), default=now_utc, nullable=False)

    source = relationship("Source", back_populates="sync_logs")
