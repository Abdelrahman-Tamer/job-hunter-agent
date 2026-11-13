"""Jobs discovery, search, filter, and detail endpoints."""

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import get_db_session
from src.models import (
    ApplicationStatus,
    GeographicEligibility,
    Job,
    JobStatusTracker,
    MatchBand,
    SeniorityLevel,
    WorkplaceType,
)

router = APIRouter(prefix="/api/v1/jobs", tags=["Jobs"])


class JobSummaryDTO(BaseModel):
    id: int
    source_name: str
    company: str
    title: str
    raw_location: Optional[str]
    workplace_type: WorkplaceType
    eligibility: GeographicEligibility
    seniority: SeniorityLevel
    match_score: float
    match_band: MatchBand
    published_at: Optional[str]
    first_seen_at: str
    original_application_url: str
    required_skills: List[str]
    tracker_status: Optional[ApplicationStatus] = None


class JobDetailDTO(JobSummaryDTO):
    description_text: str
    description_html: Optional[str]
    eligibility_reason: str
    score_breakdown: Dict[str, Any]
    match_reasons: List[str]
    skill_gaps: List[str]
    salary_min: Optional[float]
    salary_max: Optional[float]
    salary_currency: Optional[str]
    salary_period: Optional[str]


@router.get("", response_model=Dict[str, Any])
async def list_jobs(
    db: AsyncSession = Depends(get_db_session),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    keyword: Optional[str] = None,
    workplace_type: Optional[WorkplaceType] = None,
    eligibility: Optional[GeographicEligibility] = None,
    seniority: Optional[SeniorityLevel] = None,
    min_score: Optional[float] = Query(None, ge=0.0, le=100.0),
    source_name: Optional[str] = None,
) -> Dict[str, Any]:
    """Search and filter discovered opportunities."""
    filters = [Job.is_active == True]

    if keyword:
        filters.append(
            or_(
                Job.title.ilike(f"%{keyword}%"),
                Job.company.ilike(f"%{keyword}%"),
                Job.description_text.ilike(f"%{keyword}%"),
            )
        )
    if workplace_type:
        filters.append(Job.workplace_type == workplace_type)
    if eligibility:
        filters.append(Job.eligibility == eligibility)
    if seniority:
        filters.append(Job.seniority == seniority)
    if min_score is not None:
        filters.append(Job.match_score >= min_score)
    if source_name:
        filters.append(Job.source_name == source_name)

    offset = (page - 1) * limit

    # Count total
    count_stmt = select(Job).where(and_(*filters))
    total_res = await db.execute(count_stmt)
    total_count = len(total_res.scalars().all())

    # Fetch page
    stmt = (
        select(Job)
        .where(and_(*filters))
        .order_by(Job.match_score.desc(), Job.first_seen_at.desc())
        .offset(offset)
        .limit(limit)
    )
    result = await db.execute(stmt)
    jobs = result.scalars().all()

    items = []
    for j in jobs:
        items.append(
            JobSummaryDTO(
                id=j.id,
                source_name=j.source_name,
                company=j.company,
                title=j.title,
                raw_location=j.raw_location,
                workplace_type=j.workplace_type,
                eligibility=j.eligibility,
                seniority=j.seniority,
                match_score=j.match_score,
                match_band=j.match_band,
                published_at=j.published_at.isoformat() if j.published_at else None,
                first_seen_at=j.first_seen_at.isoformat(),
                original_application_url=j.original_application_url,
                required_skills=j.required_skills or [],
                tracker_status=j.tracker.status if j.tracker else None,
            )
        )

    return {
        "page": page,
        "limit": limit,
        "total": total_count,
        "items": items,
    }


@router.get("/{job_id}", response_model=JobDetailDTO)
async def get_job_detail(
    job_id: int,
    db: AsyncSession = Depends(get_db_session),
) -> JobDetailDTO:
    """Get full details of a specific job opportunity."""
    stmt = select(Job).where(Job.id == job_id)
    res = await db.execute(stmt)
    j = res.scalar_one_or_none()
    if not j:
        raise HTTPException(status_code=404, detail="Job not found")

    return JobDetailDTO(
        id=j.id,
        source_name=j.source_name,
        company=j.company,
        title=j.title,
        description_text=j.description_text,
        description_html=j.description_html,
        raw_location=j.raw_location,
        workplace_type=j.workplace_type,
        eligibility=j.eligibility,
        eligibility_reason=j.eligibility_reason,
        seniority=j.seniority,
        match_score=j.match_score,
        match_band=j.match_band,
        score_breakdown=j.score_breakdown or {},
        match_reasons=j.match_reasons or [],
        skill_gaps=j.skill_gaps or [],
        salary_min=j.salary_min,
        salary_max=j.salary_max,
        salary_currency=j.salary_currency,
        salary_period=j.salary_period,
        published_at=j.published_at.isoformat() if j.published_at else None,
        first_seen_at=j.first_seen_at.isoformat(),
        original_application_url=j.original_application_url,
        required_skills=j.required_skills or [],
        tracker_status=j.tracker.status if j.tracker else None,
    )
