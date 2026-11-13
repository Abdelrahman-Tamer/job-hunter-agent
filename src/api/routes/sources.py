"""Source adapters management and manual ingestion endpoints."""

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import get_db_session
from src.core.logging import logger
from src.core.security import canonicalize_url
from src.engine.deduplication import DeduplicationEngine, compute_url_hash
from src.engine.eligibility import GeographicEligibilityEngine
from src.engine.matching import MatchingEngine
from src.models import (
    CandidateProfile,
    GeographicEligibility,
    Job,
    JobStatusTracker,
    Source,
    WorkplaceType,
)
from src.services.profile_service import get_or_create_candidate_profile
from src.sources.base import NormalizedJobData
from src.sources.registry import SourceRegistry, create_default_registry

router = APIRouter(prefix="/api/v1/sources", tags=["Sources"])
registry_instance = create_default_registry()


class UserJobAlertDTO(BaseModel):
    source_name: str = "user_alert"
    company: str
    title: str
    application_url: str
    location: Optional[str] = "Remote"
    workplace_type: WorkplaceType = WorkplaceType.REMOTE
    description_text: str
    skills: List[str] = []


@router.get("", response_model=List[Dict[str, Any]])
async def list_sources(db: AsyncSession = Depends(get_db_session)) -> List[Dict[str, Any]]:
    """List registered sources with metadata and last sync state."""
    meta_list = registry_instance.list_metadata()
    results = []

    for m in meta_list:
        stmt = select(Source).where(Source.name == m.name)
        res = await db.execute(stmt)
        s_record = res.scalar_one_or_none()

        results.append({
            "name": m.name,
            "source_type": m.source_type,
            "base_url": m.base_url,
            "doc_url": m.doc_url,
            "allowed_usage": m.allowed_usage_summary,
            "rate_limit_per_min": m.rate_limit_req_per_minute,
            "attribution": m.attribution_requirement,
            "freshness": m.freshness_limitations,
            "is_enabled": s_record.is_enabled if s_record else True,
            "last_sync_at": s_record.last_sync_at.isoformat() if s_record and s_record.last_sync_at else None,
            "last_sync_status": s_record.last_sync_status if s_record else None,
            "last_sync_error": s_record.last_sync_error if s_record else None,
        })
    return results


@router.get("/health", response_model=Dict[str, bool])
async def check_sources_health() -> Dict[str, bool]:
    """Execute live health checks across all registered sources."""
    return await registry_instance.check_all_health()


@router.post("/ingest/user-alert", response_model=Dict[str, Any])
async def ingest_user_alert(
    dto: UserJobAlertDTO,
    db: AsyncSession = Depends(get_db_session),
) -> Dict[str, Any]:
    """
    Ingest a job alert forwarded from official emails or manual entry.
    Complies with Rule 5 by offering an authorized ingestion path for boards without public APIs.
    """
    profile = await get_or_create_candidate_profile(db)
    canonical = canonicalize_url(dto.application_url)
    url_hash = compute_url_hash(canonical)

    norm = NormalizedJobData(
        source_name=dto.source_name,
        source_job_id=url_hash[:16],
        source_url=dto.application_url,
        canonical_url=canonical,
        original_application_url=dto.application_url,
        company=dto.company,
        title=dto.title,
        description_text=dto.description_text,
        raw_location=dto.location,
        workplace_type=dto.workplace_type,
        remote_scope=dto.location if dto.workplace_type == WorkplaceType.REMOTE else None,
        required_skills=dto.skills,
    )

    existing, match_type = await DeduplicationEngine.find_existing_job(db, norm)
    if existing:
        return {"status": "duplicate", "message": f"Job already exists ({match_type})", "job_id": existing.id}

    # Ensure source record
    stmt_s = select(Source).where(Source.name == dto.source_name)
    res_s = await db.execute(stmt_s)
    source_rec = res_s.scalar_one_or_none()
    if not source_rec:
        source_rec = Source(
            name=dto.source_name,
            source_type="user_alert",
            base_url="https://local",
            doc_url="https://local",
            is_enabled=True,
            attribution_text="User-provided job alert",
        )
        db.add(source_rec)
        await db.commit()
        await db.refresh(source_rec)

    # Classify & score
    geo_engine = GeographicEligibilityEngine(candidate_country=profile.country)
    eligibility, elig_reason = geo_engine.classify(
        raw_location=dto.location,
        workplace_type=dto.workplace_type,
        description_text=dto.description_text,
    )

    matching_engine = MatchingEngine()
    match_res = matching_engine.evaluate(
        job_title=dto.title,
        job_description=dto.description_text,
        job_skills=dto.skills,
        seniority=norm.seniority,
        employment_type=norm.employment_type,
        eligibility=eligibility,
        published_at=None,
        required_experience_years=None,
        profile=profile,
    )

    job_rec = Job(
        source_id=source_rec.id,
        source_name=dto.source_name,
        source_job_id=norm.source_job_id,
        source_url=dto.application_url,
        canonical_url_hash=url_hash,
        original_application_url=dto.application_url,
        company=dto.company,
        title=dto.title,
        description_text=dto.description_text,
        raw_location=dto.location,
        workplace_type=dto.workplace_type,
        eligibility=eligibility,
        eligibility_reason=elig_reason,
        match_score=match_res.score,
        match_band=match_res.band,
        score_breakdown=match_res.breakdown.model_dump(),
        match_reasons=match_res.reasons,
        skill_gaps=match_res.skill_gaps,
        match_confidence=match_res.confidence,
    )
    db.add(job_rec)
    await db.flush()

    tracker = JobStatusTracker(job_id=job_rec.id)
    db.add(tracker)
    await db.commit()

    return {
        "status": "success",
        "job_id": job_rec.id,
        "score": job_rec.match_score,
        "band": job_rec.match_band.value,
        "eligibility": job_rec.eligibility.value,
    }
