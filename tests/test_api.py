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
        # Test listing
        resp = await ac.get("/api/v1/jobs?keyword=Angular")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["title"] == "Senior Angular Developer"

        # Test detail
        resp_det = await ac.get(f"/api/v1/jobs/{job.id}")
        assert resp_det.status_code == 200
        det_data = resp_det.json()
        assert det_data["company"] == "AngularTech"
        assert det_data["match_score"] == 88.5

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
