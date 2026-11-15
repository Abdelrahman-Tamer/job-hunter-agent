"""Application tracker and notes data models."""

from datetime import datetime, timezone
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    Text,
    Enum as SQLEnum,
)
from sqlalchemy.orm import relationship
from src.core.database import Base
from src.models.enums import ApplicationStatus


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


class JobStatusTracker(Base):
    """
    Lifecycle tracking for discovered jobs (Saved, Interested, Applied, Interview, Offer, Rejected).
    Prevents automatic application submission while enabling single-click candidate status tracking.
    """
    __tablename__ = "job_status_trackers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    job_id = Column(Integer, ForeignKey("jobs.id"), unique=True, nullable=False, index=True)

    status = Column(
        SQLEnum(ApplicationStatus),
        default=ApplicationStatus.DISCOVERED,
        nullable=False,
        index=True,
    )
    applied_at = Column(DateTime(timezone=True), nullable=True)
    follow_up_at = Column(DateTime(timezone=True), nullable=True, index=True)
    follow_up_sent = Column(Boolean, default=False, nullable=False)
    follow_up_note = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), default=now_utc, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=now_utc, onupdate=now_utc, nullable=False)

    # Relationships
    job = relationship("Job", back_populates="tracker")


class ApplicationNote(Base):
    """Candidate notes attached to a job opportunity."""
    __tablename__ = "application_notes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    job_id = Column(Integer, ForeignKey("jobs.id"), nullable=False, index=True)
    note_text = Column(Text, nullable=False)

    created_at = Column(DateTime(timezone=True), default=now_utc, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=now_utc, onupdate=now_utc, nullable=False)

    # Relationships
    job = relationship("Job", back_populates="notes")
