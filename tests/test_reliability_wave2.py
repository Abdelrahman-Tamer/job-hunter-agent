"""Wave 2 reliability, matching, PDF resume, and API regression tests (TDD RED -> GREEN)."""

import asyncio
import io
import logging
import time
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import httpx
import pypdf
import pytest
import respx
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from src.api.main import app
from src.bot.handlers import TelegramBotDispatcher
from src.core.database import get_db_session
from src.core.logging import SanitizingFormatter
from src.engine.deduplication import DeduplicationEngine, compute_url_hash
from src.engine.eligibility import GeographicEligibilityEngine
from src.engine.frontend_filter import is_frontend_opportunity
from src.engine.gemini_extractor import ExtractedJobAttributes
from src.engine.matching import MatchingEngine
from src.engine.track_classifier import classify_job_track
from src.models import (
    ApplicationStatus,
    CandidateProfile,
    DailyRun,
    EmploymentType,
    GeographicEligibility,
    Job,
    JobStatusTracker,
    JobTrack,
    NotificationLog,
    NotificationStatus,
    RunStatus,
    SeniorityLevel,
    Source,
    WorkplaceType,
)
from src.scheduler.runner import DailyPipelineRunner
from src.services.followup_service import check_and_send_followup_reminders
from src.services.resume_generator import generate_tailored_resume_pdf
from src.sources.base import BaseSourceAdapter, NormalizedJobData, RawJobData, SourceMetadata
from src.sources.http_client import ResilientHttpClient
from src.sources.registry import SourceRegistry
from src.sources.rss import RSSAdapter
from src.sources.workable import WorkableAdapter


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _mock_gemini():
    mock = AsyncMock()
    mock.extract_attributes.return_value = ExtractedJobAttributes()
    mock.generate_linkedin_outreach.return_value = {"follow_up_note": "Following up on my application!"}
    return mock


class _StubAdapter(BaseSourceAdapter):
    def __init__(self, name: str, jobs: list[NormalizedJobData], delay: float = 0.0):
        self._name = name
        self._jobs = jobs
        self._delay = delay

    def source_metadata(self) -> SourceMetadata:
        return SourceMetadata(
            name=self._name,
            source_type="custom",
            base_url="https://example.com",
            doc_url="https://example.com",
            allowed_usage_summary="Test stub",
            rate_limit_req_per_minute=60,
            attribution_requirement="Stub",
            freshness_limitations="None",
            fields_provided=["title", "company"],
        )

    async def health_check(self) -> bool:
        return True

    async def fetch_jobs(self, since=None, query_config=None) -> list[RawJobData]:
        if self._delay:
            await asyncio.sleep(self._delay)
        return [
            RawJobData(
                source_name=self._name,
                source_job_id=j.source_job_id,
                source_url=j.source_url,
                payload={"id": j.source_job_id},
            )
            for j in self._jobs
        ]

    def normalize(self, raw_job: RawJobData) -> NormalizedJobData:
        for j in self._jobs:
            if j.source_job_id == raw_job.source_job_id:
                return j
        raise ValueError(raw_job.source_job_id)


# ---------------------------------------------------------------------------
# 1. ResilientHttpClient.get raises after exhausted retries
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@respx.mock
async def test_http_client_get_raises_instead_of_returning_none_after_retries(monkeypatch):
    """Verify get() raises httpx.HTTPError when all retry attempts exhaust on 5xx, network errors, or 429."""
    async def fast_sleep(_sec):
        return None

    monkeypatch.setattr(asyncio, "sleep", fast_sleep)

    respx.get("https://example.com/always-429").mock(
        return_value=httpx.Response(429, headers={"Retry-After": "1"})
    )
    respx.get("https://apply.workable.com/api/v1/widget/accounts/broken").mock(
        return_value=httpx.Response(503)
    )

    client = ResilientHttpClient(max_retries=2)
    try:
        with pytest.raises(httpx.HTTPError):
            await client.get("https://example.com/always-429")

        adapter = WorkableAdapter(company_slug="broken", http_client=client)
        jobs = await adapter.fetch_jobs()
        assert jobs == []
    finally:
        await client.close()


# ---------------------------------------------------------------------------
# 2. Runner naive/aware DateTime recovery, exception FAILED state, Telegram ok check
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_runner_recovers_stale_naive_in_progress_run_and_records_failed_on_crash(db_session, monkeypatch):
    """Verify stale IN_PROGRESS runs with naive SQLite timestamps recover and unhandled exceptions persist FAILED."""
    runner = DailyPipelineRunner(
        registry=SourceRegistry(),
        telegram_client=AsyncMock(),
        gemini_extractor=_mock_gemini(),
    )
    date_str = runner.get_cairo_date_key()
    run_key = f"daily-digest-{date_str}"

    # Seed stale IN_PROGRESS row with NAIVE UTC datetime (as returned by SQLite)
    stale_naive = (datetime.now(UTC) - timedelta(minutes=25)).replace(tzinfo=None)
    stale_run = DailyRun(
        run_date=date_str,
        run_key=run_key,
        status=RunStatus.IN_PROGRESS,
        started_at=stale_naive,
    )
    db_session.add(stale_run)
    await db_session.commit()

    # Should recover stale run without TypeError on naive vs aware subtraction
    recovered = await runner.execute_daily_run(db_session, force=False, target_chat_id=None)
    assert recovered.status == RunStatus.COMPLETED

    # Now simulate an unhandled exception inside execute_daily_run -> must persist FAILED
    import src.scheduler.runner as runner_mod

    async def crash_profile(_session):
        raise RuntimeError("Simulated database or pipeline crash")

    monkeypatch.setattr(runner_mod, "get_or_create_candidate_profile", crash_profile)
    with pytest.raises(RuntimeError, match="Simulated database or pipeline crash"):
        await runner.execute_daily_run(db_session, force=True, target_chat_id=None)

    res = await db_session.execute(select(DailyRun).where(DailyRun.run_key == run_key))
    persisted = res.scalar_one()
    assert persisted.status == RunStatus.FAILED
    assert "Simulated database or pipeline crash" in (persisted.error_message or "")


@pytest.mark.asyncio
async def test_runner_marks_failed_telegram_send_and_retries_unsent_jobs(db_session, monkeypatch):
    """Verify Telegram ok=False logs NotificationStatus.FAILED and allows retry on subsequent run."""
    monkeypatch.setattr(
        "src.scheduler.runner.scan_and_mark_expired_jobs",
        AsyncMock(return_value={"checked": 0, "expired": 0, "active": 1}),
    )
    db_session.add(
        CandidateProfile(
            country="EG",
            confirmed_skills=["Angular", "TypeScript"],
            digest_enabled=1,
            digest_threshold=50.0,
        )
    )
    await db_session.commit()

    job_data = NormalizedJobData(
        source_name="stub_board",
        source_job_id="retry-1",
        source_url="https://example.com/jobs/retry-1",
        canonical_url="https://example.com/jobs/retry-1",
        original_application_url="https://example.com/jobs/retry-1",
        company="RetryCo",
        title="Angular Frontend Developer",
        description_text="Angular and TypeScript frontend developer in Cairo, Egypt.",
        raw_location="Cairo, Egypt",
        workplace_type=WorkplaceType.HYBRID,
        required_skills=["Angular", "TypeScript"],
        published_at=datetime.now(UTC),
    )
    registry = SourceRegistry()
    registry.register(_StubAdapter("stub_board", [job_data]))

    mock_tg = AsyncMock()
    mock_tg.send_message.return_value = {"ok": False, "description": "Bad Gateway"}

    runner = DailyPipelineRunner(
        registry=registry,
        telegram_client=mock_tg,
        gemini_extractor=_mock_gemini(),
    )

    run1 = await runner.execute_daily_run(db_session, force=True, target_chat_id=999111)
    assert run1.jobs_notified == 0

    logs1 = (await db_session.execute(select(NotificationLog).where(NotificationLog.job_id != None))).scalars().all()
    assert len(logs1) == 1
    assert logs1[0].status == NotificationStatus.FAILED

    # Now Telegram recovers -> second run MUST still select the job (not excluded by FAILED log)
    mock_tg.send_message.return_value = {"ok": True, "result": {"message_id": 555}}
    run2 = await runner.execute_daily_run(db_session, force=True, target_chat_id=999111)
    assert run2.jobs_notified == 1

    sent_logs = (
        await db_session.execute(
            select(NotificationLog).where(
                NotificationLog.job_id != None,
                NotificationLog.status == NotificationStatus.SENT,
            )
        )
    ).scalars().all()
    assert len(sent_logs) == 1
    assert sent_logs[0].telegram_message_id == 555


@pytest.mark.asyncio
async def test_followup_service_does_not_mark_sent_when_telegram_fails(db_session):
    """Verify check_and_send_followup_reminders checks res.get('ok') before setting follow_up_sent=True."""
    src = Source(
        name="fu_fail_src",
        source_type="custom",
        base_url="https://example.com",
        doc_url="https://example.com",
        is_enabled=True,
        attribution_text="Test",
    )
    db_session.add(src)
    await db_session.flush()

    job = Job(
        source_id=src.id,
        source_name="fu_fail_src",
        source_job_id="fu-1",
        source_url="https://example.com/fu/1",
        canonical_url_hash="fufailhash1",
        original_application_url="https://example.com/fu/1",
        company="FailCo",
        title="Angular Developer",
        description_text="Angular",
        first_seen_at=datetime.now(UTC),
    )
    db_session.add(job)
    await db_session.flush()

    tracker = JobStatusTracker(
        job_id=job.id,
        status=ApplicationStatus.APPLIED,
        applied_at=datetime.now(UTC) - timedelta(days=6),
        follow_up_at=datetime.now(UTC) - timedelta(days=1),
        follow_up_sent=False,
    )
    db_session.add(tracker)
    await db_session.commit()

    mock_tg = AsyncMock()
    mock_tg.is_configured = True
    mock_tg.send_message.return_value = {"ok": False, "description": "Forbidden"}

    sent_count = await check_and_send_followup_reminders(
        session=db_session,
        telegram=mock_tg,
        gemini=_mock_gemini(),
        target_chat_id=123456,
    )
    assert sent_count == 0
    await db_session.refresh(tracker)
    assert tracker.follow_up_sent is False


# ---------------------------------------------------------------------------
# 3. Concurrent Run Guard & Non-Blocking 202 Trigger
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_concurrent_execute_daily_run_serialized_without_collision(db_session, monkeypatch):
    """Verify concurrent execute_daily_run calls do not collide on run_key or send duplicate digests."""
    monkeypatch.setattr(
        "src.scheduler.runner.scan_and_mark_expired_jobs",
        AsyncMock(return_value={"checked": 0, "expired": 0, "active": 1}),
    )
    db_session.add(
        CandidateProfile(
            country="EG",
            confirmed_skills=["Angular", "TypeScript"],
            digest_enabled=1,
            digest_threshold=50.0,
        )
    )
    await db_session.commit()

    job_data = NormalizedJobData(
        source_name="conc_board",
        source_job_id="conc-1",
        source_url="https://example.com/jobs/conc-1",
        canonical_url="https://example.com/jobs/conc-1",
        original_application_url="https://example.com/jobs/conc-1",
        company="ConcCo",
        title="Angular Developer",
        description_text="Angular and TypeScript in Cairo, Egypt.",
        raw_location="Cairo, Egypt",
        workplace_type=WorkplaceType.HYBRID,
        required_skills=["Angular", "TypeScript"],
        published_at=datetime.now(UTC),
    )
    registry = SourceRegistry()
    registry.register(_StubAdapter("conc_board", [job_data], delay=0.05))
    mock_tg = AsyncMock()
    mock_tg.send_message.return_value = {"ok": True, "result": {"message_id": 101}}

    runner = DailyPipelineRunner(
        registry=registry,
        telegram_client=mock_tg,
        gemini_extractor=_mock_gemini(),
    )

    r1, r2 = await asyncio.gather(
        runner.execute_daily_run(db_session, force=False, target_chat_id=12345),
        runner.execute_daily_run(db_session, force=False, target_chat_id=12345),
    )
    assert r1.status == RunStatus.COMPLETED
    assert r2.status == RunStatus.COMPLETED
    assert r1.id == r2.id
    # Job notified once, not twice
    sent_logs = (await db_session.execute(select(NotificationLog).where(NotificationLog.job_id != None))).scalars().all()
    assert len(sent_logs) == 1


@pytest.mark.asyncio
async def test_runs_trigger_returns_202_and_dispatches_background_sweep(monkeypatch):
    """Verify POST /api/v1/runs/trigger returns 202 Accepted and runs via BackgroundTasks with fresh session."""
    import src.api.routes.runs as runs_route

    bg_calls = []

    async def fake_bg_sweep(force: bool = False):
        bg_calls.append(force)

    monkeypatch.setattr(runs_route, "_execute_background_sweep", fake_bg_sweep)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/api/v1/runs/trigger?force=true")
        assert resp.status_code == 202
        body = resp.json()
        assert body["status"] == "accepted"
        assert "message" in body

    assert bg_calls == [True]


# ---------------------------------------------------------------------------
# 4. Tracker 404 on Missing Job & Follow-Up Lifecycle
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_tracker_returns_404_for_missing_job_and_manages_followup_timestamps(db_session):
    """Verify tracker endpoints return 404 on missing jobs and clear/refresh follow_up_at on status transitions."""
    app.dependency_overrides[get_db_session] = lambda: db_session
    try:
        src = Source(
            name="trk_src",
            source_type="custom",
            base_url="https://example.com",
            doc_url="https://example.com",
            is_enabled=True,
            attribution_text="Test",
        )
        db_session.add(src)
        await db_session.flush()
        job = Job(
            source_id=src.id,
            source_name="trk_src",
            source_job_id="trk-1",
            source_url="https://example.com/trk/1",
            canonical_url_hash="trkhash1",
            original_application_url="https://example.com/trk/1",
            company="TrkCo",
            title="Angular Dev",
            description_text="Angular",
        )
        db_session.add(job)
        await db_session.commit()
        await db_session.refresh(job)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            # Missing job returns 404 (not 500 FK IntegrityError)
            resp_missing_status = await ac.put("/api/v1/tracker/999999/status", json={"status": "SAVED"})
            assert resp_missing_status.status_code == 404

            resp_missing_notes = await ac.get("/api/v1/tracker/999999/notes")
            assert resp_missing_notes.status_code == 404

            # Mark APPLIED -> schedules +5d follow-up
            resp_app1 = await ac.put(f"/api/v1/tracker/{job.id}/status", json={"status": "APPLIED"})
            assert resp_app1.status_code == 200
            assert resp_app1.json()["follow_up_at"] is not None

            # Simulate follow-up already sent, then transition away to SAVED -> must clear follow_up_at & follow_up_sent
            trk = (await db_session.execute(select(JobStatusTracker).where(JobStatusTracker.job_id == job.id))).scalar_one()
            old_followup = datetime.now(UTC) - timedelta(days=2)
            trk.follow_up_at = old_followup
            trk.follow_up_sent = True
            await db_session.commit()

            resp_saved = await ac.put(f"/api/v1/tracker/{job.id}/status", json={"status": "SAVED"})
            assert resp_saved.status_code == 200
            assert resp_saved.json()["follow_up_at"] is None
            await db_session.refresh(trk)
            assert trk.follow_up_at is None
            assert trk.follow_up_sent is False

            # Re-apply -> must schedule a fresh +5d reminder in the future
            resp_app2 = await ac.put(f"/api/v1/tracker/{job.id}/status", json={"status": "APPLIED"})
            assert resp_app2.status_code == 200
            await db_session.refresh(trk)
            assert trk.follow_up_at is not None
            fu_aware = trk.follow_up_at.replace(tzinfo=UTC) if trk.follow_up_at.tzinfo is None else trk.follow_up_at
            assert fu_aware > datetime.now(UTC) + timedelta(days=4)
            assert trk.follow_up_sent is False
    finally:
        app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# 5. Tailored PDF Resume Schema, No Fake Phone, & XML Escaping
# ---------------------------------------------------------------------------


def test_tailored_pdf_reads_real_profile_keys_omits_fake_phone_and_escapes_xml():
    """Verify PDF generator uses real profile keys, omits fabricated contact info, and escapes & / < characters."""
    profile = CandidateProfile(
        full_name="Jane & John <Dev>",
        country="EG",
        priority_target="Frontend & UI Engineer",
        confirmed_skills=["Angular", "TypeScript", "R&D Tools <Internal>"],
        professional_summary="Built fast <SPA> apps & tools.",
        experiences=[
            {
                "role": "Frontend Trainee",
                "company": "Route & Co <Academy>",
                "location": "Cairo, Egypt",
                "start_date": "Mar 2025",
                "end_date": "Jul 2026",
                "bullets": ["Shipped Angular & RxJS <modules>."],
            }
        ],
        projects=[
            {
                "name": "FreshCart & Store",
                "technologies": ["Angular 17", "TypeScript & RxJS"],
                "bullets": ["Built cart & checkout <flow>."],
            }
        ],
        educations=[
            {
                "degree": "B.Sc. CS & IT",
                "institution": "EELU <Cairo>",
                "graduation_year": 2026,
            }
        ],
    )
    job = Job(
        id=1,
        source_id=1,
        source_name="test",
        source_job_id="xml-1",
        source_url="https://example.com/1",
        canonical_url_hash="xmlhash1",
        original_application_url="https://example.com/1",
        company="AT&T R&D",
        title="Frontend & UI <Engineer>",
        description_text="Angular",
        required_skills=["Angular", "R&D Tools <Internal>"],
        first_seen_at=datetime.now(UTC),
    )

    pdf_bytes = generate_tailored_resume_pdf(profile, job)
    assert pdf_bytes.startswith(b"%PDF-")

    reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
    full_text = "\n".join(page.extract_text() or "" for page in reader.pages)

    assert "+20 101 234 5678" not in full_text
    assert "botta12779@gmail.com" not in full_text
    assert "AT&T R&D" in full_text
    assert "Frontend Trainee" in full_text
    assert "Route & Co <Academy>" in full_text
    assert "Mar 2025" in full_text and "Jul 2026" in full_text
    assert "FreshCart & Store" in full_text
    assert "2026" in full_text


# ---------------------------------------------------------------------------
# 6. Matching, Deduplication, Filters, Eligibility, Workable, SQL NULL, User-Alert, Bot, Misc
# ---------------------------------------------------------------------------


def test_matching_rejects_reactive_forms_for_react_and_scans_desc_when_tags_non_tech():
    """Verify word-boundary skill matching prevents 'Reactive Forms' -> 'React' and scans desc on non-tech tags."""
    engine = MatchingEngine()
    profile = CandidateProfile(
        country="EG",
        priority_target="Angular / Frontend",
        target_role_terms=["Frontend Developer"],
        target_technology_terms=["Angular", "TypeScript"],
        confirmed_skills=["Reactive Forms", "Angular", "TypeScript", "RxJS"],
        target_skills=["Angular", "TypeScript"],
    )

    # 1. 'Reactive Forms' must NOT award confirmed 'React' points
    res_react = engine.evaluate(
        job_title="Senior React Developer",
        job_description="We require React and Redux.",
        job_skills=["React", "Redux"],
        seniority=SeniorityLevel.SENIOR,
        employment_type=EmploymentType.FULL_TIME,
        eligibility=GeographicEligibility.EGYPT_ELIGIBLE,
        published_at=datetime.now(UTC),
        required_experience_years=3.0,
        profile=profile,
    )
    assert res_react.breakdown.confirmed_skills == 3.0

    # 2. Non-tech category tags ('Engineering', 'Full-Time') must still trigger description skill scan
    res_nontech_tags = engine.evaluate(
        job_title="Angular Frontend Developer",
        job_description="Looking for a developer proficient in Angular, TypeScript, and RxJS.",
        job_skills=["Engineering", "Full-Time"],
        seniority=SeniorityLevel.JUNIOR,
        employment_type=EmploymentType.FULL_TIME,
        eligibility=GeographicEligibility.EGYPT_ELIGIBLE,
        published_at=datetime.now(UTC),
        required_experience_years=1.0,
        profile=profile,
    )
    assert res_nontech_tags.breakdown.confirmed_skills > 15.0


@pytest.mark.asyncio
async def test_deduplication_skips_generic_fallback_company_title_location(db_session):
    """Verify generic fallback company/title/location never collapse distinct opportunities via fuzzy matching."""
    src = Source(
        name="li_social_dup",
        source_type="social_post",
        base_url="https://linkedin.com",
        doc_url="https://linkedin.com",
        is_enabled=True,
        attribution_text="LinkedIn",
    )
    db_session.add(src)
    await db_session.flush()

    existing = Job(
        source_id=src.id,
        source_name="li_social_dup",
        source_job_id="post-1",
        source_url="https://www.linkedin.com/posts/post-1",
        canonical_url_hash=compute_url_hash("https://www.linkedin.com/posts/post-1"),
        original_application_url="https://www.linkedin.com/posts/post-1",
        company="LinkedIn Hiring Network",
        title="Frontend Engineer",
        description_text="Hiring post 1",
        raw_location="Location Unspecified",
    )
    db_session.add(existing)
    await db_session.commit()

    incoming = NormalizedJobData(
        source_name="li_social_dup",
        source_job_id="post-2",
        source_url="https://www.linkedin.com/posts/post-2",
        canonical_url="https://www.linkedin.com/posts/post-2",
        original_application_url="https://www.linkedin.com/posts/post-2",
        company="LinkedIn Hiring Network",
        title="Frontend Engineer",
        description_text="Hiring post 2",
        raw_location="Location Unspecified",
    )
    found, reason = await DeduplicationEngine.find_existing_job(db_session, incoming)
    assert found is None
    assert reason == "NOT_FOUND"


def test_filters_eligibility_and_track_classifier_edge_cases():
    """Verify hyphenated React-Native, UI/UX Frontend Engineer, Ukraine/Dukhan boundaries, and UNKNOWN workplace."""
    assert is_frontend_opportunity("Senior React-Native Developer")[0] is False
    assert is_frontend_opportunity("UI/UX Frontend Engineer")[0] is True
    assert is_frontend_opportunity("UI/UX Designer")[0] is False

    geo = GeographicEligibilityEngine(candidate_country="EG")
    elig_ua, _ = geo.classify(raw_location="Remote - Ukraine", workplace_type=WorkplaceType.REMOTE)
    assert elig_ua != GeographicEligibility.NOT_ELIGIBLE

    elig_dukhan, _ = geo.classify(raw_location="Dukhan, Qatar", workplace_type=WorkplaceType.REMOTE)
    assert elig_dukhan == GeographicEligibility.EGYPT_ELIGIBLE

    assert classify_job_track(
        title="Frontend Engineer",
        description="Angular and TypeScript",
        raw_location="London, UK",
        workplace_type=WorkplaceType.UNKNOWN,
    ) == JobTrack.OTHER

    assert classify_job_track(
        title="Frontend Engineer",
        description="Angular and TypeScript",
        raw_location="Dubai, UAE",
        workplace_type=WorkplaceType.UNKNOWN,
    ) == JobTrack.OTHER


def test_workable_blank_location_returns_none_and_unknown_workplace():
    """Verify WorkableAdapter does not fabricate 'Cairo, Egypt' or HYBRID when city and country are blank."""
    adapter = WorkableAdapter(company_slug="example")
    raw = RawJobData(
        source_name="workable_example",
        source_job_id="wk-1",
        source_url="https://apply.workable.com/example/j/wk-1/",
        payload={
            "title": "Frontend Developer",
            "company_name": "ExampleCo",
            "city": "",
            "country": "",
            "telecommuting": False,
            "description": "Angular role",
        },
    )
    norm = adapter.normalize(raw)
    assert norm.raw_location is None
    assert norm.workplace_type == WorkplaceType.UNKNOWN


@pytest.mark.asyncio
async def test_remote_gcc_null_raw_location_included_in_api_and_bot(db_session):
    """Verify SQL NULL trap fix returns REMOTE_WORLDWIDE jobs with raw_location=None for REMOTE_GCC_ABROAD."""
    src = Source(
        name="null_loc_src",
        source_type="custom",
        base_url="https://example.com",
        doc_url="https://example.com",
        is_enabled=True,
        attribution_text="Test",
    )
    db_session.add(src)
    await db_session.flush()

    job = Job(
        source_id=src.id,
        source_name="null_loc_src",
        source_job_id="null-loc-1",
        source_url="https://example.com/null-loc/1",
        canonical_url_hash="nulllochash1",
        original_application_url="https://example.com/null-loc/1",
        company="RemoteCo",
        title="Angular Engineer",
        description_text="Worldwide remote role",
        raw_location=None,
        workplace_type=WorkplaceType.REMOTE,
        eligibility=GeographicEligibility.REMOTE_WORLDWIDE,
        job_track=JobTrack.WEB_ANGULAR,
        match_score=85.0,
        is_active=True,
        raw_payload={},
    )
    db_session.add(job)
    await db_session.commit()

    app.dependency_overrides[get_db_session] = lambda: db_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.get("/api/v1/jobs?segment=REMOTE_GCC_ABROAD")
            assert resp.status_code == 200
            assert resp.json()["total"] == 1
    finally:
        app.dependency_overrides.clear()

    mock_tg = AsyncMock()
    dispatcher = TelegramBotDispatcher(telegram_client=mock_tg)
    dispatcher.owner_id = 123456
    await dispatcher._handle_filter_query(chat_id=123456, key="remote_gcc", session=db_session)
    texts = [call.kwargs.get("text", "") for call in mock_tg.send_message.call_args_list]
    assert any("RemoteCo" in t for t in texts)


@pytest.mark.asyncio
async def test_ingest_user_alert_persists_track_segment_is_active_and_clamps(db_session):
    """Verify user-alert ingestion persists job_track, opportunity_segment, is_active, and clamps VARCHAR columns."""
    app.dependency_overrides[get_db_session] = lambda: db_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post(
                "/api/v1/sources/ingest/user-alert",
                json={
                    "source_name": "user_alert",
                    "company": "C" * 320,
                    "title": "Angular Frontend Engineer " + ("X" * 300),
                    "application_url": "https://careers.example.com/jobs/789",
                    "location": "Cairo, Egypt",
                    "workplace_type": "HYBRID",
                    "description_text": "Angular, TypeScript, and RxJS frontend engineering in Cairo.",
                    "skills": ["Angular", "TypeScript"],
                },
            )
            assert resp.status_code == 200
            job_id = resp.json()["job_id"]

        saved = (await db_session.execute(select(Job).where(Job.id == job_id))).scalar_one()
        assert saved.job_track == JobTrack.FRONTEND_EGYPT
        assert saved.opportunity_segment == "EGYPT"
        assert saved.is_active is True
        assert len(saved.company) <= 255
        assert len(saved.title) <= 255
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_telegram_run_avoids_duplicate_cards_and_chunks_long_messages(db_session, monkeypatch):
    """Verify /run does not resend cards already sent by execute_daily_run and long messages use chunk_message."""
    src = Source(
        name="bot_dup_src",
        source_type="custom",
        base_url="https://example.com",
        doc_url="https://example.com",
        is_enabled=True,
        attribution_text="Test",
    )
    db_session.add(src)
    await db_session.flush()

    job = Job(
        source_id=src.id,
        source_name="bot_dup_src",
        source_job_id="bot-dup-1",
        source_url="https://example.com/bot/1",
        canonical_url_hash="botduphash1",
        original_application_url="https://example.com/bot/1",
        company="BotCo",
        title="Angular Frontend Developer",
        description_text="Angular",
        match_score=90.0,
        is_active=True,
        eligibility=GeographicEligibility.EGYPT_ELIGIBLE,
    )
    db_session.add(job)
    await db_session.commit()
    await db_session.refresh(job)

    mock_tg = AsyncMock()
    mock_tg.send_message.return_value = {"ok": True, "result": {"message_id": 11}}
    dispatcher = TelegramBotDispatcher(telegram_client=mock_tg)
    dispatcher.owner_id = 123456

    async def fake_execute_daily_run(self, session, force=False, target_chat_id=None, progress_callback=None):
        return DailyRun(
            id=1,
            run_date="2026-11-25",
            run_key="daily-digest-2026-11-25",
            status=RunStatus.COMPLETED,
            jobs_discovered=10,
            jobs_new=1,
            jobs_notified=1,
        )

    monkeypatch.setattr(DailyPipelineRunner, "execute_daily_run", fake_execute_daily_run)

    await dispatcher._cmd_trigger_run(chat_id=123456, session=db_session)
    sent_texts = [c.kwargs.get("text", "") for c in mock_tg.send_message.call_args_list]
    assert not any("Direct Link" in t for t in sent_texts)

    # Long cover letter reply must be chunked into <= 4096 char Telegram messages
    mock_tg.reset_mock()
    long_letter = "\n".join([f"Paragraph line {i}: Angular and TypeScript experience." for i in range(140)])
    dispatcher.gemini.generate_cover_letter = AsyncMock(return_value=long_letter)

    await dispatcher.handle_update(
        {
            "callback_query": {
                "id": "cb_long_cover",
                "from": {"id": 123456},
                "message": {"chat": {"id": 123456}},
                "data": f"cover:{job.id}",
            }
        },
        db_session,
    )
    assert mock_tg.send_message.call_count > 1
    for call in mock_tg.send_message.call_args_list:
        assert len(call.kwargs["text"]) <= 4096


@pytest.mark.asyncio
async def test_rss_utc_timegm_ready_503_and_logging_7digit_ids(db_session):
    """Verify RSSAdapter uses UTC timegm, /ready returns 503 on DB error, and logging preserves 7-digit IDs."""
    adapter = RSSAdapter(feed_url="https://example.com/feed.rss", name="rss_test")
    utc_tuple = time.struct_time((2026, 11, 20, 12, 0, 0, 4, 324, 0))
    raw = RawJobData(
        source_name="rss_test",
        source_job_id="rss-1",
        source_url="https://example.com/rss/1",
        payload={"title": "Co: Angular Dev", "link": "https://example.com/rss/1", "published_parsed": utc_tuple},
    )
    norm = adapter.normalize(raw)
    assert norm.published_at == datetime(2026, 11, 20, 12, 0, 0, tzinfo=UTC)

    class BrokenDB:
        async def execute(self, _q):
            raise RuntimeError("DB offline")

    app.dependency_overrides[get_db_session] = lambda: BrokenDB()
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.get("/ready")
            assert resp.status_code == 503
            assert resp.json()["database_connected"] is False
    finally:
        app.dependency_overrides.clear()

    formatter = SanitizingFormatter("%(message)s")
    rec = logging.LogRecord(
        name="job_hunter",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg="Notifying chat_id=5753164 for activity-7131820; phone +20 100 123 4567 and 010-1234-5678",
        args=(),
        exc_info=None,
    )
    formatted = formatter.format(rec)
    assert "5753164" in formatted
    assert "7131820" in formatted
    assert "100 123 4567" not in formatted
    assert "010-1234-5678" not in formatted
