"""Daily run history and manual trigger endpoints."""

from typing import Any, Dict, List
from fastapi import APIRouter, BackgroundTasks, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import async_session_factory, get_db_session
from src.core.logging import logger
from src.models import DailyRun
from src.scheduler.runner import DailyPipelineRunner

router = APIRouter(prefix="/api/v1/runs", tags=["Runs"])
runner_instance = DailyPipelineRunner()


async def _execute_background_sweep(force: bool = False) -> None:
    """Execute daily sweep using its own fresh database session inside the background task."""
    async with async_session_factory() as session:
        try:
            await runner_instance.execute_daily_run(session, force=force)
        except Exception as exc:  # noqa: BLE001
            logger.error(f"Background pipeline trigger failed: {exc}", exc_info=True)


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


@router.post("/trigger", response_model=Dict[str, Any], status_code=status.HTTP_202_ACCEPTED)
async def trigger_run(
    background_tasks: BackgroundTasks,
    force: bool = False,
) -> Dict[str, Any]:
    """Dispatch daily ingestion and notification pipeline asynchronously."""
    background_tasks.add_task(_execute_background_sweep, force)
    return {
        "status": "accepted",
        "message": "Feed sweep queued for background execution.",
    }
