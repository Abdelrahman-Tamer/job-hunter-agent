"""Telegram notification dispatch history."""

from datetime import datetime, timezone
from sqlalchemy import (
    BigInteger,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    Enum as SQLEnum,
)
from sqlalchemy.orm import relationship
from src.core.database import Base
from src.models.enums import NotificationStatus, NotificationType


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


class NotificationLog(Base):
    """
    Log of Telegram notifications dispatched.
    Ensures an individual job or digest is not redundantly transmitted.
    """
    __tablename__ = "notification_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    run_id = Column(Integer, ForeignKey("daily_runs.id"), nullable=True, index=True)
    job_id = Column(Integer, ForeignKey("jobs.id"), nullable=True, index=True)

    notification_type = Column(SQLEnum(NotificationType), nullable=False)
    telegram_chat_id = Column(BigInteger, nullable=False)
    telegram_message_id = Column(Integer, nullable=True)

    status = Column(SQLEnum(NotificationStatus), default=NotificationStatus.SENT, nullable=False)
    error_details = Column(Text, nullable=True)
    sent_at = Column(DateTime(timezone=True), default=now_utc, nullable=False)

    # Relationships
    run = relationship("DailyRun", back_populates="notifications")
    job = relationship("Job", back_populates="notifications")
