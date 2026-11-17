"""Unit tests for Telegram bot formatting, authorization, and handlers."""

import asyncio
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock
import httpx
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
    assert "Published today" in label_today

    # Published 5 days ago
    label_old = format_date_label(published_at=old_job, first_seen_at=now)
    assert "Published 5d ago" in label_old

    # Missing publication date -> labeled 'First discovered', NEVER 'Posted today'
    label_missing = format_date_label(published_at=None, first_seen_at=first_seen)
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
    assert "Access Denied" in kwargs["text"]

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
    assert mock_client.send_message.call_count >= 1
    # Check that at least one message is a welcome message
    any_welcome = any("Welcome" in call.kwargs.get("text", "") for call in mock_client.send_message.call_args_list)
    assert any_welcome


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

    # Test Cover Letter Callback
    mock_client.reset_mock()
    dispatcher.gemini.generate_cover_letter = AsyncMock(return_value="Dear Hiring Team at GlobalTech, I am interested.")
    cover_callback = {
        "callback_query": {
            "id": "cb3",
            "from": {"id": 123456},
            "message": {"chat": {"id": 123456}},
            "data": f"cover:{job.id}",
        }
    }
    await dispatcher.handle_update(cover_callback, db_session)
    mock_client.send_message.assert_called_once()
    args, kwargs = mock_client.send_message.call_args
    assert "Cover Letter" in kwargs["text"]
    assert "GlobalTech" in kwargs["text"]

    # Test Interview Prep Callback
    mock_client.reset_mock()
    dispatcher.gemini.generate_interview_prep = AsyncMock(return_value="🎯 1️⃣ Angular Signals & State Management")
    interview_callback = {
        "callback_query": {
            "id": "cb4",
            "from": {"id": 123456},
            "message": {"chat": {"id": 123456}},
            "data": f"interview:{job.id}",
        }
    }
    await dispatcher.handle_update(interview_callback, db_session)
    mock_client.send_message.assert_called_once()
    args, kwargs = mock_client.send_message.call_args
    assert "Interview" in kwargs["text"]


@pytest.mark.asyncio
async def test_persistent_keyboard_and_natural_search(db_session):
    """Verify reply keyboard buttons and natural language searches."""
    from src.bot.formatters import build_persistent_reply_keyboard, build_quick_filters_keyboard

    kb = build_persistent_reply_keyboard()
    assert kb["is_persistent"] is True
    assert len(kb["keyboard"]) >= 4

    filters_kb = build_quick_filters_keyboard()
    assert len(filters_kb["inline_keyboard"]) >= 3

    mock_client = AsyncMock()
    dispatcher = TelegramBotDispatcher(telegram_client=mock_client)
    dispatcher.owner_id = 555666

    # Test persistent button click
    btn_update = {
        "message": {
            "from": {"id": 555666},
            "chat": {"id": 555666},
            "text": "📋 Today's Jobs",
        }
    }
    await dispatcher.handle_update(btn_update, db_session)
    mock_client.send_message.assert_called_once()

    # Test natural language query
    mock_client.reset_mock()
    nl_update = {
        "message": {
            "from": {"id": 555666},
            "chat": {"id": 555666},
            "text": "angular remote developer",
        }
    }
    await dispatcher.handle_update(nl_update, db_session)
    mock_client.send_message.assert_called_once()


@pytest.mark.asyncio
async def test_unsave_and_undo_dismiss_status(db_session):
    """Verify toggling save off and undo dismiss set status to DISCOVERED without crash."""
    mock_client = AsyncMock()
    dispatcher = TelegramBotDispatcher(telegram_client=mock_client)
    dispatcher.owner_id = 123456

    source = Source(
        name="test_src_toggle",
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
        source_name="test_src_toggle",
        source_job_id="test-toggle-1",
        source_url="https://example.com/job/toggle-1",
        canonical_url_hash="hash_toggle_1",
        original_application_url="https://example.com/job/toggle-1",
        company="ToggleTech",
        title="Frontend Specialist",
        description_text="Angular role",
        match_score=80.0,
    )
    db_session.add(job)
    await db_session.commit()
    await db_session.refresh(job)

    # 1. Save job
    await dispatcher.handle_update({
        "callback_query": {
            "id": "cb_save",
            "from": {"id": 123456},
            "message": {"chat": {"id": 123456}},
            "data": f"save:{job.id}",
        }
    }, db_session)
    await db_session.refresh(job, ["tracker"])
    assert job.tracker.status == ApplicationStatus.SAVED

    # 2. Toggle save off -> must return to DISCOVERED (not crash with AttributeError)
    await dispatcher.handle_update({
        "callback_query": {
            "id": "cb_unsave",
            "from": {"id": 123456},
            "message": {"chat": {"id": 123456}},
            "data": f"save:{job.id}",
        }
    }, db_session)
    await db_session.refresh(job, ["tracker"])
    assert job.tracker.status == ApplicationStatus.DISCOVERED

    # 3. Dismiss job
    await dispatcher.handle_update({
        "callback_query": {
            "id": "cb_dismiss",
            "from": {"id": 123456},
            "message": {"chat": {"id": 123456}},
            "data": f"dismiss:{job.id}",
        }
    }, db_session)
    await db_session.refresh(job, ["tracker"])
    assert job.tracker.status == ApplicationStatus.NOT_RELEVANT

    # 4. Undo dismiss -> must return to DISCOVERED (not crash)
    await dispatcher.handle_update({
        "callback_query": {
            "id": "cb_undo",
            "from": {"id": 123456},
            "message": {"chat": {"id": 123456}},
            "data": f"undo_dismiss:{job.id}",
        }
    }, db_session)
    await db_session.refresh(job, ["tracker"])
    assert job.tracker.status == ApplicationStatus.DISCOVERED


@pytest.mark.asyncio
async def test_telegram_client_retry_retries_three_times(monkeypatch):
    """Verify that TelegramClient._request retries on transient network errors."""
    from src.bot.telegram_client import TelegramClient
    client = TelegramClient(token="987654321:ABCDefghIJKlmnoPQRstuvWXyz_fake")
    assert client.is_configured is True

    # Speed up retry sleep for test
    async def fast_sleep(_):
        return None

    monkeypatch.setattr("asyncio.sleep", fast_sleep)

    attempts_made = 0

    class FailingClient:
        is_closed = False

        async def post(self, url, json=None):
            nonlocal attempts_made
            attempts_made += 1
            raise httpx.ConnectError("Simulated socket failure")

    client._client = FailingClient()
    res = await client._request("POST", "sendMessage", {"chat_id": 123, "text": "hi"})
    assert res["ok"] is False
    assert attempts_made == 3  # Successfully retried all 3 attempts!
