"""Integration tests for FastAPI endpoints."""

import pytest
from httpx import ASGITransport, AsyncClient
from src.api.main import app
from src.core.database import get_db_session
from src.models import (
    ApplicationStatus,
    GeographicEligibility,
    Job,
    JobStatusTracker,
    JobTrack,
    SeniorityLevel,
    Source,
    WorkplaceType,
)


@pytest.mark.asyncio
async def test_health_and_readiness_endpoints(db_session):
    """Verify /health and /ready endpoints return 200."""
    app.dependency_overrides[get_db_session] = lambda: db_session

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.get("/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "healthy"

        resp_ready = await ac.get("/ready")
        assert resp_ready.status_code == 200
        assert resp_ready.json()["database_connected"] is True

    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_jobs_list_and_detail(db_session):
    """Verify jobs discovery list with filters and detail view."""
    app.dependency_overrides[get_db_session] = lambda: db_session

    source = Source(
        name="test_api_source",
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
        source_name="test_api_source",
        source_job_id="api-job-1",
        source_url="https://himalayas.app/job/api-1",
        canonical_url_hash="hashapi1",
        original_application_url="https://himalayas.app/job/api-1",
        company="AngularTech",
        title="Senior Angular Developer",
        description_text="Building enterprise Angular applications with Signals.",
        raw_location="Worldwide",
        workplace_type=WorkplaceType.REMOTE,
        eligibility=GeographicEligibility.REMOTE_WORLDWIDE,
        seniority=SeniorityLevel.SENIOR,
        job_track=JobTrack.WEB_ANGULAR,
        match_score=88.5,
        required_skills=["Angular", "TypeScript"],
    )
    db_session.add(job)
    await db_session.commit()
    await db_session.refresh(job)

    tracker = JobStatusTracker(job_id=job.id, status=ApplicationStatus.DISCOVERED)
    db_session.add(tracker)
    await db_session.commit()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # Test listing with keyword and track
        resp = await ac.get("/api/v1/jobs?keyword=Angular&track=WEB_ANGULAR")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["title"] == "Senior Angular Developer"
        assert data["items"][0]["job_track"] == "WEB_ANGULAR"

        # Test listing with different track returns 0
        resp_other = await ac.get("/api/v1/jobs?track=NO_EXP_REMOTE")
        assert resp_other.status_code == 200
        assert resp_other.json()["total"] == 0

        # Test detail
        resp_det = await ac.get(f"/api/v1/jobs/{job.id}")
        assert resp_det.status_code == 200
        det_data = resp_det.json()
        assert det_data["company"] == "AngularTech"
        assert det_data["match_score"] == 88.5
        assert det_data["job_track"] == "WEB_ANGULAR"

    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_profile_read_update_and_cv_import(db_session):
    """Verify profile operations and local CV parsing with PII redaction."""
    app.dependency_overrides[get_db_session] = lambda: db_session

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # Read profile
        resp = await ac.get("/api/v1/profile")
        assert resp.status_code == 200
        prof = resp.json()
        assert prof["country"] == "EG"
        assert prof["priority_target"] == "Angular / Frontend"

        # Update profile
        resp_up = await ac.put(
            "/api/v1/profile",
            json={"confirmed_skills": ["Angular", "TypeScript", "RxJS"]},
        )
        assert resp_up.status_code == 200

        # Import CV locally with PII redaction
        sample_cv = """
        Name: Abd El-Rahman Emam
        Email: abd@example.com
        Phone: +20 100 123 4567
        Education: Egyptian E-Learning University
        Skills: Angular, TypeScript, JavaScript, RxJS, HTML, CSS, Git
        """
        resp_cv = await ac.post(
            "/api/v1/profile/import-cv",
            json={"cv_raw_text": sample_cv},
        )
        assert resp_cv.status_code == 200
        cv_data = resp_cv.json()
        assert "abd@example.com" not in cv_data["sanitized_text"]
        assert "[EMAIL_REDACTED]" in cv_data["sanitized_text"]
        assert "Angular" in cv_data["detected_skills"]
        assert cv_data["detected_education"] == "Egyptian E-Learning University"
        assert cv_data["requires_user_confirmation"] is True

    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_manual_user_alert_ingestion(db_session):
    """Verify Rule 5 manual job alert ingestion endpoint."""
    app.dependency_overrides[get_db_session] = lambda: db_session

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        payload = {
            "source_name": "user_alert",
            "company": "ForwardedCorp",
            "title": "Frontend Engineer (Angular)",
            "application_url": "https://forwarded.example.com/apply/456",
            "location": "Worldwide",
            "workplace_type": "REMOTE",
            "description_text": "We are seeking a Frontend Engineer proficient in Angular.",
            "skills": ["Angular", "TypeScript"],
        }
        resp = await ac.post("/api/v1/sources/ingest/user-alert", json=payload)
        assert resp.status_code == 200
        res_data = resp.json()
        assert res_data["status"] == "success"
        assert res_data["score"] > 60.0

    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_wipe_and_reset_requires_admin_authorization(db_session):
    """Verify /wipe-and-reset rejects unauthenticated calls and requires X-Admin-Key."""
    from src.core.config import settings
    app.dependency_overrides[get_db_session] = lambda: db_session

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # Unauthenticated request rejected with 403
        resp_unauth = await ac.post("/api/v1/jobs/wipe-and-reset")
        assert resp_unauth.status_code == 403

        # Invalid key rejected with 403
        resp_bad = await ac.post("/api/v1/jobs/wipe-and-reset", headers={"X-Admin-Key": "wrong-key"})
        assert resp_bad.status_code == 403

        # Valid key succeeds with 200
        resp_ok = await ac.post("/api/v1/jobs/wipe-and-reset", headers={"X-Admin-Key": settings.SECRET_KEY})
        assert resp_ok.status_code == 200
        assert resp_ok.json()["status"] == "success"

    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_add_note_404_when_job_missing(db_session):
    """Verify POST /api/v1/tracker/{id}/notes returns 404 when job does not exist."""
    app.dependency_overrides[get_db_session] = lambda: db_session

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/api/v1/tracker/999999/notes", json={"note_text": "Missing job note"})
        assert resp.status_code == 404
        assert resp.json()["detail"] == "Job not found"

    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_wipe_and_reset_clears_application_notes(db_session):
    """Verify wipe succeeds without foreign key violation even when jobs have notes."""
    from src.core.config import settings
    from src.models import ApplicationNote

    app.dependency_overrides[get_db_session] = lambda: db_session

    # Create dummy job with attached note
    source = Source(
        name="test_wipe_notes_src",
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
        source_name="test_wipe_notes_src",
        source_job_id="wipe-job-1",
        source_url="https://example.com/wipe/1",
        canonical_url_hash="wipehash1",
        original_application_url="https://example.com/wipe/1",
        company="WipeCo",
        title="Frontend Dev",
        description_text="Desc",
    )
    db_session.add(job)
    await db_session.commit()
    await db_session.refresh(job)

    note = ApplicationNote(job_id=job.id, note_text="Important note before wipe")
    db_session.add(note)
    await db_session.commit()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/api/v1/jobs/wipe-and-reset", headers={"X-Admin-Key": settings.SECRET_KEY})
        assert resp.status_code == 200
        assert resp.json()["status"] == "success"

    app.dependency_overrides.clear()
