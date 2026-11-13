"""APScheduler cron job orchestrator for 09:00 Africa/Cairo daily digest."""

import asyncio
from datetime import datetime, timezone
import zoneinfo
from typing import Optional
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from src.core.config import settings
from src.core.database import async_session_factory
from src.core.logging import logger
from src.scheduler.runner import DailyPipelineRunner


class JobSchedulerService:
    """Manages scheduled periodic tasks and catch-up execution."""

    def __init__(self, runner: Optional[DailyPipelineRunner] = None):
        self.runner = runner or DailyPipelineRunner()
        self.scheduler: Optional[AsyncIOScheduler] = None
        self.timezone_name = settings.TIMEZONE or "Africa/Cairo"

    def _scheduled_job_wrapper(self) -> None:
        """Helper to schedule async coroutine inside APScheduler."""
        asyncio.create_task(self.run_daily_job())

    async def run_daily_job(self, force: bool = False) -> None:
        """Execute daily job discovery and notification pass."""
        logger.info(f"Triggering scheduled daily pipeline pass ({self.timezone_name})...")
        async with async_session_factory() as session:
            try:
                await self.runner.execute_daily_run(session, force=force)
            except Exception as exc:
                logger.error(f"Scheduled daily run encountered an unhandled error: {exc}", exc_info=True)

    async def check_and_run_missed_catchup(self) -> None:
        """
        Check if the 09:00 digest for today in Africa/Cairo was missed due to downtime.
        If current Cairo time is >= 09:00 and no completed run exists today, catch up safely.
        """
        cairo_tz = zoneinfo.ZoneInfo(self.timezone_name)
        now_cairo = datetime.now(cairo_tz)

        # Check if current time is past 09:00
        if now_cairo.hour >= 9:
            logger.info("Current time is past 09:00 Africa/Cairo. Checking for missed morning run...")
            await self.run_daily_job(force=False)

    def start(self) -> None:
        """Initialize APScheduler with Cairo IANA timezone."""
        if self.scheduler and self.scheduler.running:
            return

        cairo_tz = zoneinfo.ZoneInfo(self.timezone_name)
        self.scheduler = AsyncIOScheduler(timezone=cairo_tz)

        # Parse digest time e.g. "09:00"
        parts = settings.DAILY_DIGEST_TIME.split(":")
        hour = int(parts[0]) if len(parts) > 0 else 9
        minute = int(parts[1]) if len(parts) > 1 else 0

        trigger = CronTrigger(
            hour=hour,
            minute=minute,
            timezone=cairo_tz,
        )

        self.scheduler.add_job(
            self._scheduled_job_wrapper,
            trigger=trigger,
            id="daily_job_digest",
            name="Daily Job Hunter Digest (09:00 Africa/Cairo)",
            replace_existing=True,
            misfire_grace_time=3600,  # 1 hour grace time
        )

        self.scheduler.start()
        logger.info(f"JobScheduler started: configured for {hour:02d}:{minute:02d} {self.timezone_name}")

    def shutdown(self) -> None:
        """Gracefully stop scheduler."""
        if self.scheduler and self.scheduler.running:
            self.scheduler.shutdown(wait=False)
            logger.info("JobScheduler stopped.")
