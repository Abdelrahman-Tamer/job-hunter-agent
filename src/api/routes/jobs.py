"""Jobs discovery, search, filter, and detail endpoints."""

import re
import secrets
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import select, and_, or_, delete, func, not_
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.config import settings
from src.core.database import get_db_session
from src.engine.gemini_extractor import GeminiJobExtractor
from src.models import (
    ApplicationNote,
    ApplicationStatus,
    GeographicEligibility,
    Job,
    JobStatusTracker,
    JobTrack,
    MatchBand,
    NotificationLog,
    SeniorityLevel,
    WorkplaceType,
)
from src.services.expiry_detector import scan_and_mark_expired_jobs
from src.services.profile_service import apply_verified_cv_to_profile, get_or_create_candidate_profile
from src.services.resume_generator import generate_tailored_resume_pdf

router = APIRouter(prefix="/api/v1/jobs", tags=["Jobs"])


class JobSummaryDTO(BaseModel):
    id: int
    source_name: str
    company: str
    title: str
    raw_location: Optional[str]
    workplace_type: WorkplaceType
    job_track: JobTrack = JobTrack.OTHER
    eligibility: GeographicEligibility
    seniority: SeniorityLevel
    match_score: float
    match_band: MatchBand
    published_at: Optional[str]
    first_seen_at: str
    original_application_url: str
    required_skills: List[str]
    tracker_status: Optional[ApplicationStatus] = None
    opportunity_segment: Optional[str] = None
    is_social_post: bool = False
    source_category_label: str = "Job Board"
    poster_name: Optional[str] = None
    contact_hint: Optional[str] = None


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
    track: Optional[JobTrack] = None,
    segment: Optional[str] = None,
    is_social_post: Optional[bool] = None,
    workplace_type: Optional[WorkplaceType] = None,
    eligibility: Optional[GeographicEligibility] = None,
    seniority: Optional[SeniorityLevel] = None,
    min_score: Optional[float] = Query(None, ge=0.0, le=100.0),
    source_name: Optional[str] = None,
) -> Dict[str, Any]:
    """Search and filter discovered opportunities."""
    filters = [Job.is_active == True]

    if track:
        filters.append(Job.job_track == track)
    if segment:
        seg_upper = segment.strip().upper()
        if seg_upper == "EGYPT":
            filters.append(
                or_(
                    Job.raw_payload["opportunity_segment"].as_string() == "EGYPT",
                    Job.job_track == JobTrack.FRONTEND_EGYPT,
                    Job.raw_location.ilike("%egypt%"),
                    Job.raw_location.ilike("%cairo%"),
                    Job.raw_location.ilike("%alexandria%"),
                    Job.raw_location.ilike("%giza%"),
                )
            )
        elif seg_upper in ("REMOTE_GCC_ABROAD", "GCC", "REMOTE_GCC", "REMOTE_ABROAD"):
            filters.append(
                or_(
                    Job.raw_payload["opportunity_segment"].as_string() == "REMOTE_GCC_ABROAD",
                    Job.job_track == JobTrack.FRONTEND_REMOTE_GCC,
                    and_(
                        Job.workplace_type == WorkplaceType.REMOTE,
                        Job.eligibility.in_([
                            GeographicEligibility.REMOTE_WORLDWIDE,
                            GeographicEligibility.REMOTE_REGION_POSSIBLE,
                        ]),
                        or_(
                            Job.raw_location.is_(None),
                            and_(
                                not_(Job.raw_location.ilike("%egypt%")),
                                not_(Job.raw_location.ilike("%cairo%")),
                            ),
                        ),
                    ),
                )
            )
        else:
            filters.append(Job.raw_payload["opportunity_segment"].as_string() == seg_upper)
    if is_social_post is not None:
        if is_social_post:
            filters.append(
                or_(
                    Job.source_name.ilike("%social%"),
                    Job.source_name.ilike("%linkedin%"),
                    Job.raw_payload["is_social_post"].as_string().in_(["true", "True", "1"]),
                    Job.raw_payload["is_social_post"].as_boolean() == True,
                )
            )
        else:
            filters.append(
                and_(
                    not_(Job.source_name.ilike("%social%")),
                    not_(Job.source_name.ilike("%linkedin%")),
                    or_(
                        Job.raw_payload == None,
                        Job.raw_payload["is_social_post"].as_string().is_(None),
                        Job.raw_payload["is_social_post"].as_string().not_in(["true", "True", "1"]),
                    ),
                )
            )
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

    # Count total via SQL aggregation instead of loading all rows into memory
    count_stmt = select(func.count(Job.id)).where(and_(*filters))
    total_count = (await db.execute(count_stmt)).scalar_one()

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
                job_track=j.job_track or JobTrack.OTHER,
                eligibility=j.eligibility,
                seniority=j.seniority,
                match_score=j.match_score,
                match_band=j.match_band,
                published_at=j.published_at.isoformat() if j.published_at else None,
                first_seen_at=j.first_seen_at.isoformat(),
                original_application_url=j.original_application_url,
                required_skills=j.required_skills or [],
                tracker_status=j.tracker.status if j.tracker else None,
                opportunity_segment=j.opportunity_segment,
                is_social_post=j.is_social_post,
                source_category_label=j.source_category_label,
                poster_name=(j.raw_payload or {}).get("poster_name"),
                contact_hint=(j.raw_payload or {}).get("contact_hint"),
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
        job_track=j.job_track or JobTrack.OTHER,
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
        opportunity_segment=j.opportunity_segment,
        is_social_post=j.is_social_post,
        source_category_label=j.source_category_label,
        poster_name=(j.raw_payload or {}).get("poster_name"),
        contact_hint=(j.raw_payload or {}).get("contact_hint"),
    )


@router.get("/{job_id}/tailored-resume")
async def download_tailored_resume(
    job_id: int,
    db: AsyncSession = Depends(get_db_session),
) -> Response:
    """Download an ATS-optimized PDF resume tailored specifically to this job's tech stack."""
    stmt = select(Job).where(Job.id == job_id)
    res = await db.execute(stmt)
    j = res.scalar_one_or_none()
    if not j:
        raise HTTPException(status_code=404, detail="Job not found")

    profile = await get_or_create_candidate_profile(db)
    pdf_bytes = generate_tailored_resume_pdf(profile, j)

    clean_company = re.sub(r'[^a-zA-Z0-9_-]', '_', j.company)
    filename = f"Resume_Abdelrahman_Emam_{clean_company}.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-cache",
        },
    )


@router.post("/{job_id}/outreach", response_model=Dict[str, Any])
async def generate_outreach_messages(
    job_id: int,
    db: AsyncSession = Depends(get_db_session),
) -> Dict[str, Any]:
    """Generate high-impact LinkedIn outreach note (<300 chars) and recruiter InMail/DM."""
    stmt = select(Job).where(Job.id == job_id)
    res = await db.execute(stmt)
    j = res.scalar_one_or_none()
    if not j:
        raise HTTPException(status_code=404, detail="Job not found")

    profile = await get_or_create_candidate_profile(db)
    gemini = GeminiJobExtractor()
    outreach = await gemini.generate_linkedin_outreach(
        candidate_name=profile.full_name or "Abdelrahman Emam",
        candidate_title=profile.priority_target or "Frontend Developer (Angular)",
        skills=profile.confirmed_skills or [],
        company=j.company,
        job_title=j.title,
        job_description=j.description_text or "",
    )

    return {
        "status": "success",
        "job_id": j.id,
        "company": j.company,
        "title": j.title,
        "connection_note": outreach.get("connection_note", ""),
        "inmail_dm": outreach.get("inmail_dm", ""),
        "follow_up_note": outreach.get("follow_up_note", ""),
    }


@router.post("/{job_id}/cover-letter", response_model=Dict[str, Any])
async def generate_cover_letter(
    job_id: int,
    db: AsyncSession = Depends(get_db_session),
) -> Dict[str, Any]:
    """Generate tailored AI cover letter for the specific job."""
    stmt = select(Job).where(Job.id == job_id)
    res = await db.execute(stmt)
    j = res.scalar_one_or_none()
    if not j:
        raise HTTPException(status_code=404, detail="Job not found")

    profile = await get_or_create_candidate_profile(db)
    gemini = GeminiJobExtractor()
    cover_letter = await gemini.generate_cover_letter(
        candidate_name=profile.full_name or "Abdelrahman Emam",
        candidate_title=profile.priority_target or "Frontend Developer (Angular)",
        skills=profile.confirmed_skills or [],
        projects=profile.projects or [],
        company=j.company,
        job_title=j.title,
        job_description=j.description_text or "",
    )

    return {
        "status": "success",
        "job_id": j.id,
        "cover_letter": cover_letter,
    }


@router.post("/verify-links", response_model=Dict[str, Any])
async def verify_active_links(
    limit: int = Query(30, ge=1, le=100),
    db: AsyncSession = Depends(get_db_session),
) -> Dict[str, Any]:
    """Run the Expiry & Ghost Posting detector across active opportunities."""
    metrics = await scan_and_mark_expired_jobs(db, limit=limit)
    return {
        "status": "success",
        "metrics": metrics,
    }


@router.post("/wipe-and-reset", response_model=Dict[str, Any])
async def wipe_all_jobs(
    x_admin_key: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db_session),
) -> Dict[str, Any]:
    """
    Wipe all existing jobs, application trackers, and notification records.
    Requires X-Admin-Key matching a configured non-default settings.SECRET_KEY.
    """
    configured_secret = (settings.SECRET_KEY or "").strip()
    if (
        not configured_secret
        or configured_secret == "insecure-default-key-for-dev-only-change-in-production"
    ):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Admin reset endpoint is disabled until a non-default SECRET_KEY is configured.",
        )
    if not x_admin_key or not secrets.compare_digest(x_admin_key, configured_secret):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin authorization required to reset database.",
        )
    await db.execute(delete(JobStatusTracker))
    await db.execute(delete(NotificationLog))
    await db.execute(delete(ApplicationNote))
    await db.execute(delete(Job))
    profile = await apply_verified_cv_to_profile(db)
    await db.commit()
    return {
        "status": "success",
        "message": "All legacy jobs have been completely wiped. Candidate profile loaded with verified CV (Abdelrahman Emam - Angular/Frontend).",
        "candidate": profile.full_name,
        "confirmed_skills_count": len(profile.confirmed_skills),
    }
