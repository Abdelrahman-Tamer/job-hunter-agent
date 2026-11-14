"""FastAPI application entrypoint for Job Hunter Agent."""

import asyncio
import pathlib
from contextlib import asynccontextmanager
from typing import AsyncGenerator
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from src.api.routes import health, jobs, profile, runs, sources, tracker
from src.bot.bot_service import TelegramBotService
from src.core.config import settings
from src.core.logging import logger
from src.scheduler.cron import JobSchedulerService


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifecycle: initialize scheduler and background Telegram polling."""
    logger.info("Initializing Job Hunter Agent backend services...")

    # Start APScheduler (09:00 Africa/Cairo)
    scheduler_service = JobSchedulerService()
    scheduler_service.start()
    app.state.scheduler = scheduler_service

    # Check for missed morning run if starting up past 09:00 Cairo time
    asyncio.create_task(scheduler_service.check_and_run_missed_catchup())

    # Start Telegram bot polling if enabled and configured
    polling_task = None
    if settings.TELEGRAM_POLLING:
        bot_service = TelegramBotService()
        app.state.bot_service = bot_service
        polling_task = asyncio.create_task(bot_service.start_polling())

    yield

    logger.info("Shutting down Job Hunter Agent backend services...")
    scheduler_service.shutdown()
    if polling_task:
        polling_task.cancel()


def create_app() -> FastAPI:
    """Application factory."""
    app = FastAPI(
        title=settings.APP_NAME,
        version="1.0.0",
        description="Production personal job discovery and matching agent for Software Engineering and Frontend roles.",
        lifespan=lifespan,
    )

    # CORS configuration for Angular frontend
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # Adjust for production domains
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Register routers
    app.include_router(health.router)
    app.include_router(jobs.router)
    app.include_router(profile.router)
    app.include_router(tracker.router)
    app.include_router(sources.router)
    app.include_router(runs.router)

    # Mount Angular production SPA when built
    dist_dir = pathlib.Path("frontend/dist/frontend/browser")
    if dist_dir.exists():
        @app.get("/{full_path:path}", include_in_schema=False)
        async def serve_spa(full_path: str):
            candidate = dist_dir / full_path
            if candidate.is_file():
                return FileResponse(candidate)
            return FileResponse(dist_dir / "index.html")

    return app


app = create_app()
