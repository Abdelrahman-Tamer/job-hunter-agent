"""Application tracker and notes endpoints."""

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import joinedload
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import get_db_session
from src.models import ApplicationNote, ApplicationStatus, Job, JobStatusTracker

router = APIRouter(prefix="/api/v1/tracker", tags=["Tracker"])


class TrackerUpdateDTO(BaseModel):
    status: ApplicationStatus
    follow_up_at: Optional[datetime] = None


class NoteCreateDTO(BaseModel):
    note_text: str


@router.get("", response_model=List[Dict[str, Any]])
async def list_tracked_jobs(
    status_filter: Optional[ApplicationStatus] = None,
    db: AsyncSession = Depends(get_db_session),
) -> List[Dict[str, Any]]:
    """List tracked opportunities."""
    stmt = (
        select(JobStatusTracker)
        .options(joinedload(JobStatusTracker.job))
        .join(Job)
    )
    if status_filter:
        stmt = stmt.where(JobStatusTracker.status == status_filter)
    stmt = stmt.order_by(JobStatusTracker.updated_at.desc())

    res = await db.execute(stmt)
    trackers = res.scalars().all()

    items = []
    for t in trackers:
        j = t.job
        items.append({
            "job_id": j.id,
            "title": j.title,
            "company": j.company,
            "match_score": j.match_score,
            "status": t.status,
            "applied_at": t.applied_at.isoformat() if t.applied_at else None,
            "follow_up_at": t.follow_up_at.isoformat() if t.follow_up_at else None,
            "follow_up_sent": t.follow_up_sent,
            "follow_up_note": t.follow_up_note,
            "updated_at": t.updated_at.isoformat() if t.updated_at else None,
            "original_application_url": j.original_application_url,
        })
    return items


@router.put("/{job_id}/status", response_model=Dict[str, Any])
async def update_job_status(
    job_id: int,
    dto: TrackerUpdateDTO,
    db: AsyncSession = Depends(get_db_session),
) -> Dict[str, Any]:
    """Update application tracking status."""
    stmt = select(JobStatusTracker).where(JobStatusTracker.job_id == job_id)
    res = await db.execute(stmt)
    tracker = res.scalar_one_or_none()

    if not tracker:
        tracker = JobStatusTracker(job_id=job_id, status=dto.status)
        db.add(tracker)
    else:
        tracker.status = dto.status

    if dto.status == ApplicationStatus.APPLIED:
        if not tracker.applied_at:
            tracker.applied_at = datetime.now(timezone.utc)
        if dto.follow_up_at:
            tracker.follow_up_at = dto.follow_up_at
            tracker.follow_up_sent = False
        elif not tracker.follow_up_at:
            tracker.follow_up_at = datetime.now(timezone.utc) + timedelta(days=5)
            tracker.follow_up_sent = False

    await db.commit()
    return {
        "status": "success",
        "new_status": tracker.status.value,
        "follow_up_at": tracker.follow_up_at.isoformat() if tracker.follow_up_at else None,
    }


@router.post("/{job_id}/notes", response_model=Dict[str, Any])
async def add_note(
    job_id: int,
    dto: NoteCreateDTO,
    db: AsyncSession = Depends(get_db_session),
) -> Dict[str, Any]:
    """Attach candidate note to job."""
    note = ApplicationNote(job_id=job_id, note_text=dto.note_text)
    db.add(note)
    await db.commit()
    return {"status": "success", "note_id": note.id}


@router.get("/{job_id}/notes", response_model=List[Dict[str, Any]])
async def get_notes(
    job_id: int,
    db: AsyncSession = Depends(get_db_session),
) -> List[Dict[str, Any]]:
    """Fetch candidate notes for a job."""
    stmt = select(ApplicationNote).where(ApplicationNote.job_id == job_id).order_by(ApplicationNote.created_at.desc())
    res = await db.execute(stmt)
    notes = res.scalars().all()
    return [
        {"id": n.id, "note_text": n.note_text, "created_at": n.created_at.isoformat()}
        for n in notes
    ]
