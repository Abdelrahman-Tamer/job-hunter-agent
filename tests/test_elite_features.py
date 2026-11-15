"""Tests for the 4 elite additions:
1. LinkedIn Recruiter DM Generator (<300 chars note + InMail).
2. Application Follow-Up Reminders (5-day post-application scheduler).
3. Job Expiry & Ghost Posting Detector (HTTP status & dead marker culling).
4. One-Tap Tailored PDF Resume Synthesis (ATS-optimized ReportLab generator).
"""

from datetime import datetime, timedelta, timezone
import uuid
import pytest
import respx
import httpx
from sqlalchemy import select

from src.core.database import async_session_factory
from src.engine.gemini_extractor import GeminiJobExtractor
from src.models import (
    ApplicationStatus,
    CandidateProfile,
    EmploymentType,
    GeographicEligibility,
    Job,
    JobStatusTracker,
    MatchBand,
    SeniorityLevel,
    Source,
    WorkplaceType,
)
from src.services.expiry_detector import check_job_url, scan_and_mark_expired_jobs
from src.services.followup_service import check_and_send_followup_reminders
from src.services.resume_generator import generate_tailored_resume_pdf


@pytest.mark.asyncio
async def test_linkedin_outreach_generator_fallback_and_length():
    """Verify LinkedIn generator produces compliant connection notes (strictly <= 280 chars) and InMail."""
    extractor = GeminiJobExtractor(api_key="")  # Force fallback
    res = await extractor.generate_linkedin_outreach(
        candidate_name="Abdelrahman Emam",
        candidate_title="Frontend Developer (Angular)",
        skills=["Angular", "TypeScript", "RxJS", "Tailwind CSS"],
        company="TechCorp Global",
        job_title="Senior Frontend Engineer",
        job_description="Looking for an Angular engineer with TypeScript and RxJS experience.",
    )

    assert "connection_note" in res
    assert "inmail_dm" in res
    assert "follow_up_note" in res
    assert len(res["connection_note"]) <= 280
    assert "TechCorp Global" in res["connection_note"]
    assert "Senior Frontend Engineer" in res["connection_note"]
    assert len(res["inmail_dm"]) > 50


@pytest.mark.asyncio
async def test_tailored_pdf_resume_synthesis():
    """Verify that ReportLab produces a valid PDF file matching ATS requirements."""
    profile = CandidateProfile(
        full_name="Abdelrahman Emam",
        country="EG",
        priority_target="Frontend Developer (Angular)",
        confirmed_skills=["Angular", "TypeScript", "JavaScript", "HTML5", "CSS3", "Tailwind CSS", "RxJS"],
        professional_summary="Frontend engineer delivering high-performance Angular applications.",
        linkedin_url="https://linkedin.com/in/abd-el-rahman-emam",
        github_url="https://github.com/Abdelrahman-Tamer",
        experiences=[
            {
                "title": "Angular Developer",
                "company": "Enterprise Web Apps",
                "period": "2023 - Present",
                "bullets": ["Engineered responsive SPAs using Angular 19."],
            }
        ],
        projects=[
            {
                "title": "FreshCart E-Commerce",
                "stack": "Angular, TypeScript, Tailwind",
                "summary": "Modern storefront with reactive state management.",
            }
        ],
    )

    job = Job(
        id=101,
        source_id=1,
        source_name="Himalayas",
        source_job_id="test-101",
        source_url="https://himalayas.app/jobs/101",
        canonical_url_hash="hash-101",
        original_application_url="https://company.com/apply/101",
        company="Spotify",
        title="Frontend Web Developer",
        description_text="We need Angular and TypeScript.",
        required_skills=["Angular", "TypeScript"],
        first_seen_at=datetime.now(timezone.utc),
    )

    pdf_bytes = generate_tailored_resume_pdf(profile, job)
    assert isinstance(pdf_bytes, bytes)
    assert len(pdf_bytes) > 1000
    # Standard PDF header check
    assert pdf_bytes.startswith(b"%PDF-")


@pytest.mark.asyncio
@respx.mock
async def test_job_expiry_detector_dead_marker_and_404():
    """Verify detection of HTTP 404, dead job markers, and active status preservation."""
    # 1. Test 404
    respx.get("https://example.com/dead-job").mock(return_value=httpx.Response(404))
    async with httpx.AsyncClient() as client:
        is_expired, reason = await check_job_url("https://example.com/dead-job", client)
        assert is_expired is True
        assert "404" in reason

    # 2. Test Dead marker text in 200 OK body
    respx.get("https://example.com/expired-job").mock(
        return_value=httpx.Response(200, text="<html><body><h1>Sorry, this job has expired</h1></body></html>")
    )
    async with httpx.AsyncClient() as client:
        is_expired, reason = await check_job_url("https://example.com/expired-job", client)
        assert is_expired is True
        assert "expired" in reason.lower()

    # 3. Test Active listing
    respx.get("https://example.com/active-job").mock(
        return_value=httpx.Response(200, text="<html><body><h1>Senior Angular Developer - Apply Now</h1></body></html>")
    )
    async with httpx.AsyncClient() as client:
        is_expired, reason = await check_job_url("https://example.com/active-job", client)
        assert is_expired is False
        assert "Active" in reason


@pytest.mark.asyncio
async def test_follow_up_reminder_workflow():
    """Verify that applied jobs schedule follow-ups and service triggers reminders when due."""
    async with async_session_factory() as session:
        # Create dummy source and job
        uid = uuid.uuid4().hex[:8]
        source = Source(
            name=f"TEST_SRC_FOLLOWUP_{uid}",
            source_type="API",
            base_url="https://test.com",
            doc_url="https://test.com",
            rate_limit_req_per_minute=60,
            attribution_text="Test source attribution",
        )
        session.add(source)
        await session.flush()

        job = Job(
            source_id=source.id,
            source_name=source.name,
            source_job_id=f"fu-job-{uid}",
            source_url="https://test.com/jobs/1",
            canonical_url_hash=f"hash-fu-{uid}",
            original_application_url="https://test.com/apply/1",
            company="FollowUp Corp",
            title="Frontend Specialist",
            description_text="Angular test role",
            first_seen_at=datetime.now(timezone.utc),
        )
        session.add(job)
        await session.flush()

        # Create tracker due for follow-up (applied 5 days ago)
        applied_time = datetime.now(timezone.utc) - timedelta(days=6)
        tracker = JobStatusTracker(
            job_id=job.id,
            status=ApplicationStatus.APPLIED,
            applied_at=applied_time,
            follow_up_at=applied_time + timedelta(days=5),  # 1 day in the past = DUE
            follow_up_sent=False,
        )
        session.add(tracker)
        await session.commit()

        # Mock telegram client to test dispatch without sending live Telegram network requests
        class MockTelegram:
            is_configured = True
            sent_messages = []
            async def send_message(self, chat_id, text, reply_markup=None):
                self.sent_messages.append({"chat_id": chat_id, "text": text, "reply_markup": reply_markup})
                return {"ok": True, "result": {"message_id": 999}}

        mock_tg = MockTelegram()
        gemini = GeminiJobExtractor(api_key="")

        sent_count = await check_and_send_followup_reminders(
            session=session,
            telegram=mock_tg,  # type: ignore
            gemini=gemini,
            target_chat_id=12345678,
        )

        assert sent_count >= 1
        assert len(mock_tg.sent_messages) >= 1
        assert "Follow-Up Reminder" in mock_tg.sent_messages[0]["text"]
        assert "FollowUp Corp" in mock_tg.sent_messages[0]["text"]

        # Check DB updated
        await session.refresh(tracker)
        assert tracker.follow_up_sent is True
