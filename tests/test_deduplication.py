"""Unit tests for deduplication and URL canonicalization."""

import pytest
from src.core.security import canonicalize_url
from src.engine.deduplication import DeduplicationEngine, compute_url_hash, normalize_string_key
from src.models import (
    GeographicEligibility,
    Job,
    SeniorityLevel,
    Source,
    WorkplaceType,
)
from src.sources.base import NormalizedJobData


def test_url_canonicalization_strips_tracking_preserves_identity():
    """Verify UTM and tracking parameters are cleanly removed."""
    dirty_url = "https://boards.greenhouse.io/canonical/jobs/12345?utm_source=linkedin&utm_medium=cpc&fbclid=XYZ123&token=abc"
    clean = canonicalize_url(dirty_url)

    assert "utm_source" not in clean
    assert "utm_medium" not in clean
    assert "fbclid" not in clean
    assert "token=abc" in clean  # Essential job token preserved
    assert clean.startswith("https://boards.greenhouse.io/canonical/jobs/12345")


@pytest.mark.asyncio
async def test_deduplication_exact_and_canonical(db_session):
    """Verify primary and secondary deduplication matches."""
    source = Source(
        name="himalayas",
        source_type="himalayas",
        base_url="https://himalayas.app",
        doc_url="https://himalayas.app/jobs/api",
        is_enabled=True,
        attribution_text="Himalayas",
    )
    db_session.add(source)
    await db_session.commit()
    await db_session.refresh(source)

    job_url = "https://himalayas.app/jobs/frontend-dev-123"
    job = Job(
        source_id=source.id,
        source_name="himalayas",
        source_job_id="hima-123",
        source_url=job_url,
        canonical_url_hash=compute_url_hash(job_url),
        original_application_url=job_url,
        company="TechCorp",
        title="Frontend Engineer",
        description_text="Angular and TypeScript.",
        raw_location="Remote - Worldwide",
        workplace_type=WorkplaceType.REMOTE,
        eligibility=GeographicEligibility.REMOTE_WORLDWIDE,
        seniority=SeniorityLevel.MID,
        match_score=80.0,
    )
    db_session.add(job)
    await db_session.commit()
    await db_session.refresh(job)

    # 1. Exact Source + Source Job ID
    incoming_exact = NormalizedJobData(
        source_name="himalayas",
        source_job_id="hima-123",
        source_url=job_url,
        canonical_url=canonicalize_url(job_url),
        original_application_url=job_url,
        company="TechCorp",
        title="Frontend Engineer",
        description_text="Angular and TypeScript.",
    )
    found_exact, reason_exact = await DeduplicationEngine.find_existing_job(db_session, incoming_exact)
    assert found_exact is not None
    assert reason_exact == "SOURCE_AND_ID_MATCH"

    # 2. Duplicate URL via different tracking params
    incoming_url = NormalizedJobData(
        source_name="other_source",
        source_job_id="diff-999",
        source_url=job_url + "?utm_campaign=winter_promo",
        canonical_url=canonicalize_url(job_url + "?utm_campaign=winter_promo"),
        original_application_url=job_url + "?utm_campaign=winter_promo",
        company="TechCorp",
        title="Frontend Engineer",
        description_text="Angular and TypeScript.",
    )
    found_url, reason_url = await DeduplicationEngine.find_existing_job(db_session, incoming_url)
    assert found_url is not None
    assert reason_url == "CANONICAL_URL_MATCH"


@pytest.mark.asyncio
async def test_deduplication_multiple_matches_do_not_crash(db_session):
    """Verify deduplication returns the first match without MultipleResultsFound exception."""
    source = Source(
        name="test_multi",
        source_type="himalayas",
        base_url="https://himalayas.app",
        doc_url="https://himalayas.app/api",
        is_enabled=True,
        attribution_text="Test",
    )
    db_session.add(source)
    await db_session.commit()
    await db_session.refresh(source)

    shared_hash = compute_url_hash("https://example.com/jobs/shared")
    job1 = Job(
        source_id=source.id,
        source_name="test_multi",
        source_job_id="id-1",
        source_url="https://example.com/jobs/shared",
        canonical_url_hash=shared_hash,
        original_application_url="https://example.com/jobs/shared",
        company="Co1",
        title="Dev",
        description_text="Desc",
    )
    job2 = Job(
        source_id=source.id,
        source_name="test_multi",
        source_job_id="id-2",
        source_url="https://example.com/jobs/shared",
        canonical_url_hash=shared_hash,
        original_application_url="https://example.com/jobs/shared",
        company="Co2",
        title="Dev",
        description_text="Desc",
    )
    db_session.add_all([job1, job2])
    await db_session.commit()

    incoming = NormalizedJobData(
        source_name="test_multi",
        source_job_id="id-1",
        source_url="https://example.com/jobs/shared",
        canonical_url="https://example.com/jobs/shared",
        original_application_url="https://example.com/jobs/shared",
        company="Co1",
        title="Dev",
        description_text="Desc",
    )
    matched, reason = await DeduplicationEngine.find_existing_job(db_session, incoming)
    assert matched is not None
