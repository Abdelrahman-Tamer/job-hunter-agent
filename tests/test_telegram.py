"""Unit tests for Telegram bot formatting, authorization, and handlers."""

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock
import pytest
from src.bot.formatters import (
    chunk_message,
    escape,
    format_date_label,
    format_eligibility_badge,
    format_job_card,
)
from src.bot.handlers import TelegramBotDispatcher
from src.core.config import settings
from src.models import (
    ApplicationStatus,
    CandidateProfile,
    GeographicEligibility,
    Job,
    JobStatusTracker,
    MatchBand,
    SeniorityLevel,
    Source,
    WorkplaceType,
)


def test_html_escape_special_characters():
    """Verify HTML entities are properly escaped to prevent parsing errors."""
    assert escape("C++ & Python <script>") == "C++ &amp; Python &lt;script&gt;"
    assert escape(None) == ""


def test_truthful_date_label():
    """Verify that only jobs published today are labeled 'Posted today'."""
    now = datetime.now(timezone.utc)
    today_job = now
    old_job = now - timedelta(days=5)
    first_seen = now - timedelta(days=2)

    # Published today
    label_today = format_date_label(published_at=today_job, first_seen_at=now)
    assert "نُشرت اليوم / Published today" in label_today

    # Published 5 days ago
    label_old = format_date_label(published_at=old_job, first_seen_at=now)
    assert "5" in label_old
    assert "Published 5d ago" in label_old

    # Missing publication date -> labeled 'First discovered', NEVER 'Posted today'
    label_missing = format_date_label(published_at=None, first_seen_at=first_seen)
    assert "اكتُشفت أول مرة" in label_missing
    assert "First discovered" in label_missing
    assert "Published today" not in label_missing


def test_chunk_message_within_telegram_limits():
    """Verify long text is safely partitioned."""
    long_text = "\n".join([f"Line {i} of sample content" for i in range(300)])
    chunks = chunk_message(long_text, max_chars=1000)

    assert len(chunks) > 1
    for c in chunks:
        assert len(c) <= 1000


@pytest.mark.asyncio
async def test_telegram_authorization_allow_list(db_session):
    """Verify that unauthorized users are rejected and owner is authorized."""
    mock_client = AsyncMock()
    dispatcher = TelegramBotDispatcher(telegram_client=mock_client)
    dispatcher.owner_id = 999888777  # Configured owner

    # Unauthorized user
    unauth_update = {
        "message": {
            "from": {"id": 111222333},
            "chat": {"id": 111222333},
            "text": "/today",
        }
    }
    await dispatcher.handle_update(unauth_update, db_session)
    mock_client.send_message.assert_called_once()
    args, kwargs = mock_client.send_message.call_args
    assert "عفواً، هذا البوت خاص بمرشح محدد فقط" in kwargs["text"]

    # Authorized user
    mock_client.reset_mock()
    auth_update = {
        "message": {
            "from": {"id": 999888777},
            "chat": {"id": 999888777},
            "text": "/start",
        }
    }
    await dispatcher.handle_update(auth_update, db_session)
    mock_client.send_message.assert_called_once()
    args, kwargs = mock_client.send_message.call_args
    assert "مرحباً بك في Job Hunter Agent" in kwargs["text"]


@pytest.mark.asyncio
async def test_callback_save_and_applied(db_session):
    """Verify inline callbacks update application tracker status."""
    mock_client = AsyncMock()
    dispatcher = TelegramBotDispatcher(telegram_client=mock_client)
    dispatcher.owner_id = 123456

    source = Source(
        name="test_source",
        source_type="himalayas",
        base_url="https://himalayas.app",
        doc_url="https://himalayas.app",
        is_enabled=True,
        attribution_text="Himalayas",
    )
    db_session.add(source)
    await db_session.commit()
    await db_session.refresh(source)

    job = Job(
        source_id=source.id,
        source_name="test_source",
        source_job_id="test-1",
        source_url="https://example.com/job/1",
        canonical_url_hash="hash1",
        original_application_url="https://example.com/job/1",
        company="GlobalTech",
        title="Angular Developer",
        description_text="Angular role",
        match_score=80.0,
    )
    db_session.add(job)
    await db_session.commit()
    await db_session.refresh(job)

    # Test Save callback
    save_callback = {
        "callback_query": {
            "id": "cb1",
            "from": {"id": 123456},
            "message": {"chat": {"id": 123456}},
            "data": f"save:{job.id}",
        }
    }
    await dispatcher.handle_update(save_callback, db_session)
    await db_session.refresh(job, ["tracker"])
    assert job.tracker.status == ApplicationStatus.SAVED

    # Test Applied callback
    applied_callback = {
        "callback_query": {
            "id": "cb2",
            "from": {"id": 123456},
            "message": {"chat": {"id": 123456}},
            "data": f"applied:{job.id}",
        }
    }
    await dispatcher.handle_update(applied_callback, db_session)
    await db_session.refresh(job, ["tracker"])
    assert job.tracker.status == ApplicationStatus.APPLIED
    assert job.tracker.applied_at is not None
