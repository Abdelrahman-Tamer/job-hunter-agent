"""Jobs discovery, search, filter, and detail endpoints."""

import re
import secrets
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import and_, delete, func, not_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import defer, selectinload

from src.core.config import settings
from src.core.database import get_db_session
from src.core.security import is_safe_url
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
from src.services.profile_service import (
    apply_verified_cv_to_profile,
    get_or_create_candidate_profile,
)
from src.services.resume_generator import generate_tailored_resume_pdf

router = APIRouter(prefix="/api/v1/jobs", tags=["Jobs"])
DbSession = Annotated[AsyncSession, Depends(get_db_session)]


class JobSummaryDTO(BaseModel):
    id: int
    source_name: str
    company: str
    title: str
    raw_location: str | None
    workplace_type: WorkplaceType
    job_track: JobTrack = JobTrack.OTHER
    eligibility: GeographicEligibility
    seniority: SeniorityLevel
    match_score: float
    match_band: MatchBand
    published_at: str | None
    first_seen_at: str
    original_application_url: str
    required_skills: list[str]
    tracker_status: ApplicationStatus | None = None
    opportunity_segment: str | None = None
    is_social_post: bool = False
    source_category_label: str = "Job Board"
    poster_name: str | None = None
    contact_hint: str | None = None
    direct_email: str | None = None
    whatsapp_contact: str | None = None
    apply_form_url: str | None = None
    origin_board: str | None = None


_SAFE_EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")


def _extract_safe_job_contacts(raw_payload: Any) -> dict[str, str | None]:
    """Extract and validate direct contact fields and origin board from Job.raw_payload."""
    payload = raw_payload if isinstance(raw_payload, dict) else {}

    raw_email = str(payload.get("direct_email") or "").strip()
    direct_email: str | None = None
    if raw_email and not any(ch in raw_email for ch in "<>\"'`\r\n") and _SAFE_EMAIL_RE.match(raw_email):
        direct_email = raw_email[:160]

    raw_wa = str(payload.get("whatsapp_contact") or "").strip()
    whatsapp_contact: str | None = None
    if raw_wa and not any(ch in raw_wa for ch in "<>\"'`\r\n"):
        lowered_wa = raw_wa.lower()
        if lowered_wa.startswith(("http://", "https://")):
            if is_safe_url(raw_wa):
                whatsapp_contact = raw_wa[:256]
        elif not lowered_wa.startswith(("javascript:", "data:", "vbscript:", "file:")):
            whatsapp_contact = raw_wa[:32]

    raw_form = str(payload.get("apply_form_url") or "").strip()
    apply_form_url: str | None = None
    if raw_form and is_safe_url(raw_form):
        apply_form_url = raw_form[:512]

    raw_board = str(payload.get("origin_board") or "").strip()
    origin_board: str | None = raw_board[:64] if raw_board else None

    return {
        "direct_email": direct_email,
        "whatsapp_contact": whatsapp_contact,
        "apply_form_url": apply_form_url,
        "origin_board": origin_board,
    }


class JobDetailDTO(JobSummaryDTO):
    description_text: str
    description_html: str | None
    eligibility_reason: str
    score_breakdown: dict[str, Any]
    match_reasons: list[str]
    skill_gaps: list[str]
    salary_min: float | None
    salary_max: float | None
    salary_currency: str | None
    salary_period: str | None


@router.get("", response_model=dict[str, Any])
async def list_jobs(
    db: DbSession,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    keyword: str | None = None,
    track: JobTrack | None = None,
    segment: str | None = None,
    is_social_post: bool | None = None,
    workplace_type: WorkplaceType | None = None,
    eligibility: GeographicEligibility | None = None,
    seniority: SeniorityLevel | None = None,
    min_score: float | None = Query(None, ge=0.0, le=100.0),
    source_name: str | None = None,
) -> dict[str, Any]:
    """Search and filter discovered opportunities."""
    filters = [Job.is_active == True]

    if track:
        filters.append(Job.job_track == track)
    if segment:
        seg_upper = segment.strip().upper()
        if seg_upper == "EGYPT":
            filters.append(
                or_(
                    Job.opportunity_segment == "EGYPT",
                    Job.job_track == JobTrack.FRONTEND_EGYPT,
                    and_(
                        Job.opportunity_segment == "OTHER",
                        or_(
                            Job.raw_location.ilike("%egypt%"),
                            Job.raw_location.ilike("%cairo%"),
                            Job.raw_location.ilike("%alexandria%"),
                            Job.raw_location.ilike("%giza%"),
                        ),
                    ),
                )
            )
        elif seg_upper in ("REMOTE_GCC_ABROAD", "GCC", "REMOTE_GCC", "REMOTE_ABROAD"):
            filters.append(
                or_(
                    Job.opportunity_segment == "REMOTE_GCC_ABROAD",
                    Job.job_track == JobTrack.FRONTEND_REMOTE_GCC,
                    and_(
                        Job.opportunity_segment == "OTHER",
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
            filters.append(Job.opportunity_segment == seg_upper)
    if is_social_post is not None:
        filters.append(Job.is_social_post == bool(is_social_post))
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

    # Fetch page (defer heavy body text/html blobs; explicitly load tracker)
    stmt = (
        select(Job)
        .options(
            defer(Job.description_text),
            defer(Job.description_html),
            selectinload(Job.tracker),
        )
        .where(and_(*filters))
        .order_by(Job.match_score.desc(), Job.first_seen_at.desc(), Job.id.desc())
        .offset(offset)
        .limit(limit)
    )
    result = await db.execute(stmt)
    jobs = result.scalars().all()

    items = []
    for j in jobs:
        safe_contacts = _extract_safe_job_contacts(j.raw_payload)
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
                **safe_contacts,
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
    db: DbSession,
) -> JobDetailDTO:
    """Get full details of a specific job opportunity."""
    stmt = select(Job).options(selectinload(Job.tracker)).where(Job.id == job_id)
    res = await db.execute(stmt)
    j = res.scalar_one_or_none()
    if not j:
        raise HTTPException(status_code=404, detail="Job not found")

    safe_contacts = _extract_safe_job_contacts(j.raw_payload)
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
        **safe_contacts,
    )


@router.get("/{job_id}/tailored-resume")
async def download_tailored_resume(
    job_id: int,
    db: DbSession,
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


@router.post("/{job_id}/outreach", response_model=dict[str, Any])
async def generate_outreach_messages(
    job_id: int,
    db: DbSession,
) -> dict[str, Any]:
    """Generate high-impact LinkedIn outreach note (<300 chars) and recruiter InMail/DM."""
    stmt = select(Job).where(Job.id == job_id)
    res = await db.execute(stmt)
    j = res.scalar_one_or_none()
    if not j:
        raise HTTPException(status_code=404, detail="Job not found")

    profile = await get_or_create_candidate_profile(db)
    job_id_val = j.id
    company = j.company
    title = j.title
    description_text = j.description_text or ""
    candidate_name = profile.full_name or "Abdelrahman Emam"
    candidate_title = profile.priority_target or "Frontend Developer (Angular)"
    skills = list(profile.confirmed_skills or [])

    # Release DB read transaction before external Gemini HTTP call
    await db.rollback()

    gemini = GeminiJobExtractor()
    outreach = await gemini.generate_linkedin_outreach(
        candidate_name=candidate_name,
        candidate_title=candidate_title,
        skills=skills,
        company=company,
        job_title=title,
        job_description=description_text,
    )

    return {
        "status": "success",
        "job_id": job_id_val,
        "company": company,
        "title": title,
        "connection_note": outreach.get("connection_note", ""),
        "inmail_dm": outreach.get("inmail_dm", ""),
        "follow_up_note": outreach.get("follow_up_note", ""),
    }


@router.post("/{job_id}/cover-letter", response_model=dict[str, Any])
async def generate_cover_letter(
    job_id: int,
    db: DbSession,
) -> dict[str, Any]:
    """Generate tailored AI cover letter for the specific job."""
    stmt = select(Job).where(Job.id == job_id)
    res = await db.execute(stmt)
    j = res.scalar_one_or_none()
    if not j:
        raise HTTPException(status_code=404, detail="Job not found")

    profile = await get_or_create_candidate_profile(db)
    job_id_val = j.id
    company = j.company
    title = j.title
    description_text = j.description_text or ""
    candidate_name = profile.full_name or "Abdelrahman Emam"
    candidate_title = profile.priority_target or "Frontend Developer (Angular)"
    skills = list(profile.confirmed_skills or [])
    projects = list(profile.projects or [])

    # Release DB read transaction before external Gemini HTTP call
    await db.rollback()

    gemini = GeminiJobExtractor()
    cover_letter = await gemini.generate_cover_letter(
        candidate_name=candidate_name,
        candidate_title=candidate_title,
        skills=skills,
        projects=projects,
        company=company,
        job_title=title,
        job_description=description_text,
    )

    return {
        "status": "success",
        "job_id": job_id_val,
        "cover_letter": cover_letter,
    }


@router.post("/verify-links", response_model=dict[str, Any])
async def verify_active_links(
    db: DbSession,
    limit: int = Query(30, ge=1, le=100),
) -> dict[str, Any]:
    """Run the Expiry & Ghost Posting detector across active opportunities."""
    metrics = await scan_and_mark_expired_jobs(db, limit=limit)
    return {
        "status": "success",
        "metrics": metrics,
    }


@router.post("/wipe-and-reset", response_model=dict[str, Any])
async def wipe_all_jobs(
    db: DbSession,
    x_admin_key: str | None = Header(None),
) -> dict[str, Any]:
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
