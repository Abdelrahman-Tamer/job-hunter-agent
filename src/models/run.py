"""Daily run and scheduler execution tracking."""

from datetime import datetime, timezone
from sqlalchemy import Column, DateTime, Enum as SQLEnum, Integer, String, Text, JSON
from sqlalchemy.orm import relationship
from src.core.database import Base
from src.models.enums import RunStatus


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


class DailyRun(Base):
    """
    Record of a daily scheduled execution.
    Uses run_date and run_key for database-level idempotency to prevent duplicate runs.
    """
    __tablename__ = "daily_runs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    run_date = Column(String(10), unique=True, nullable=False, index=True)  # YYYY-MM-DD
    run_key = Column(String(100), unique=True, nullable=False, index=True)  # daily-digest-YYYY-MM-DD

    status = Column(SQLEnum(RunStatus), default=RunStatus.PENDING, nullable=False, index=True)
    started_at = Column(DateTime(timezone=True), default=now_utc, nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    jobs_discovered = Column(Integer, default=0, nullable=False)
    jobs_new = Column(Integer, default=0, nullable=False)
    jobs_eligible = Column(Integer, default=0, nullable=False)
    jobs_notified = Column(Integer, default=0, nullable=False)

    error_message = Column(Text, nullable=True)
    metrics = Column(JSON, default=dict, nullable=False)

    created_at = Column(DateTime(timezone=True), default=now_utc, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=now_utc, onupdate=now_utc, nullable=False)

    # Relationships
    notifications = relationship("NotificationLog", back_populates="run", cascade="all, delete-orphan", lazy="selectin")
