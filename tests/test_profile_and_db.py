"""Unit tests for models, database relations, and candidate profile semantics."""

import pytest
from sqlalchemy import select
from src.models import (
    CandidateProfile,
    GeographicEligibility,
    Job,
    JobStatusTracker,
    SeniorityLevel,
    Source,
    WorkplaceType,
)
from src.services.profile_service import (
    export_candidate_profile,
    get_or_create_candidate_profile,
    reset_candidate_profile,
    update_candidate_profile,
)


@pytest.mark.asyncio
async def test_candidate_profile_baseline_semantics(db_session):
    """Verify that candidate profile baseline strictly complies with requirements."""
    profile = await get_or_create_candidate_profile(db_session)

    assert profile.country == "EG"
    assert profile.priority_target == "Angular / Frontend"
    assert "Angular" in profile.target_technology_terms
    assert "TypeScript" in profile.target_technology_terms
    assert "JavaScript" in profile.target_technology_terms

    # CRITICAL: confirmed_skills must be empty initially, never inferred from target
    assert profile.confirmed_skills == []
    assert "Angular" in profile.target_skills
    assert profile.experience_years is None
    assert profile.degree_title is None
    assert profile.graduation_year is None
    assert profile.linkedin_url == "https://www.linkedin.com/in/abd-el-rahman-emam"
    assert profile.education_institution == "Egyptian E-Learning University"


@pytest.mark.asyncio
async def test_candidate_profile_export_and_update(db_session):
    """Verify profile updating and export dictionary structure."""
    profile = await get_or_create_candidate_profile(db_session)

    updated = await update_candidate_profile(
        db_session,
        profile.id,
        {
            "confirmed_skills": ["HTML", "CSS"],
            "experience_years": 1.0,
        },
    )
    assert updated.confirmed_skills == ["HTML", "CSS"]
    assert updated.experience_years == 1.0

    exported = await export_candidate_profile(db_session)
    assert exported["confirmed_skills"] == ["HTML", "CSS"]
    assert exported["experience_years"] == 1.0
    assert exported["country"] == "EG"


@pytest.mark.asyncio
async def test_job_and_source_database_relationships(db_session):
    """Verify source and job persistence and relationships."""
    source = Source(
        name="test_source",
        source_type="himalayas",
        base_url="https://himalayas.app",
        doc_url="https://himalayas.app/jobs/api",
        is_enabled=True,
        attribution_text="Source: Himalayas",
    )
    db_session.add(source)
    await db_session.commit()
    await db_session.refresh(source)

    job = Job(
        source_id=source.id,
        source_name="test_source",
        source_job_id="job-101",
        source_url="https://himalayas.app/jobs/frontend-dev",
        canonical_url_hash="abc123hash",
        original_application_url="https://company.com/apply/101",
        company="TechCorp",
        title="Angular Frontend Engineer",
        description_text="Building responsive web applications in Angular and TypeScript.",
        workplace_type=WorkplaceType.REMOTE,
        eligibility=GeographicEligibility.REMOTE_WORLDWIDE,
        seniority=SeniorityLevel.MID,
        match_score=85.0,
    )
    db_session.add(job)
    await db_session.commit()
    await db_session.refresh(job)

    # Attach tracker
    tracker = JobStatusTracker(job_id=job.id)
    db_session.add(tracker)
    await db_session.commit()
    await db_session.refresh(tracker)
    await db_session.refresh(job, ["tracker"])

    # Query back
    stmt = select(Job).where(Job.id == job.id)
    res = await db_session.execute(stmt)
    retrieved_job = res.scalar_one()

    assert retrieved_job.company == "TechCorp"
    assert retrieved_job.source.name == "test_source"
    assert retrieved_job.tracker is not None
    assert retrieved_job.tracker.id == tracker.id
