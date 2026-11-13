"""Daily run history and manual trigger endpoints."""

from typing import Any, Dict, List
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import get_db_session
from src.models import DailyRun
from src.scheduler.runner import DailyPipelineRunner

router = APIRouter(prefix="/api/v1/runs", tags=["Runs"])
runner_instance = DailyPipelineRunner()


@router.get("", response_model=List[Dict[str, Any]])
async def list_runs(
    db: AsyncSession = Depends(get_db_session),
    limit: int = Query(10, ge=1, le=50),
) -> List[Dict[str, Any]]:
    """Get history of daily scheduled ingestion runs."""
    stmt = select(DailyRun).order_by(DailyRun.started_at.desc()).limit(limit)
    res = await db.execute(stmt)
    runs = res.scalars().all()

    return [
        {
            "id": r.id,
            "run_date": r.run_date,
            "run_key": r.run_key,
            "status": r.status.value,
            "started_at": r.started_at.isoformat(),
            "completed_at": r.completed_at.isoformat() if r.completed_at else None,
            "jobs_discovered": r.jobs_discovered,
            "jobs_new": r.jobs_new,
            "jobs_notified": r.jobs_notified,
            "metrics": r.metrics or {},
            "error_message": r.error_message,
        }
        for r in runs
    ]


@router.post("/trigger", response_model=Dict[str, Any])
async def trigger_run(
    force: bool = False,
    db: AsyncSession = Depends(get_db_session),
) -> Dict[str, Any]:
    """Manually trigger daily ingestion and notification pipeline."""
    daily_run = await runner_instance.execute_daily_run(db, force=force)
    return {
        "status": "success",
        "run_key": daily_run.run_key,
        "run_status": daily_run.status.value,
        "jobs_new": daily_run.jobs_new,
        "jobs_notified": daily_run.jobs_notified,
    }
