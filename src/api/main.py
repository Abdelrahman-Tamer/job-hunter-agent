"""FastAPI application entrypoint for Job Hunter Agent."""

import asyncio
import pathlib
from contextlib import asynccontextmanager
from typing import AsyncGenerator
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from src.api.routes import health, jobs, profile, runs, sources, tracker
from src.bot.bot_service import TelegramBotService
from src.core.config import settings
from src.core.database import async_session_factory, engine
from src.core.logging import logger
from src.scheduler.cron import JobSchedulerService
from src.services.profile_service import apply_verified_cv_to_profile, get_or_create_candidate_profile


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifecycle: initialize scheduler and background Telegram polling."""
    logger.info("Initializing Job Hunter Agent backend services...")

    # Ensure database is primed with verified CV facts if empty
    try:
        async with async_session_factory() as session:
            p = await get_or_create_candidate_profile(session)
            if not p.confirmed_skills or not p.full_name:
                await apply_verified_cv_to_profile(session)
                logger.info("Primed database with verified candidate profile (Abdelrahman Emam).")
    except Exception as exc:
        logger.warning(f"Failed to auto-prime profile on startup: {exc}")

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
    await engine.dispose()


def create_app() -> FastAPI:
    """Application factory."""
    app = FastAPI(
        title=settings.APP_NAME,
        version="1.0.0",
        description="Production personal job discovery and matching agent for Software Engineering and Frontend roles.",
        lifespan=lifespan,
    )

    # CORS configuration for Angular frontend
    allowed_origins: list[str] = []
    if settings.APP_ENV == "development":
        allowed_origins.extend([
            "http://localhost:4200",
            "http://localhost:8000",
            "http://127.0.0.1:4200",
            "http://127.0.0.1:8000",
        ])
    if settings.FRONTEND_ORIGIN:
        origin = settings.FRONTEND_ORIGIN.rstrip("/")
        if origin not in allowed_origins:
            allowed_origins.append(origin)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def add_security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        return response

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
        dist_root = dist_dir.resolve()
        no_cache_headers = {
            "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0",
        }
        immutable_headers = {
            "Cache-Control": "public, max-age=31536000, immutable",
        }

        @app.api_route("/{full_path:path}", methods=["GET", "HEAD"], include_in_schema=False)
        async def serve_spa(full_path: str):
            try:
                candidate = (dist_dir / full_path).resolve()
            except (OSError, ValueError):
                raise HTTPException(status_code=404, detail="Not found")
            if not candidate.is_relative_to(dist_root):
                raise HTTPException(status_code=404, detail="Not found")
            if candidate.is_file() and candidate.name != "index.html":
                # Static hashed assets (.js, .css, images, fonts) are safe to cache forever
                if candidate.suffix in {".js", ".css", ".woff2", ".png", ".jpg", ".jpeg", ".svg", ".ico"}:
                    return FileResponse(candidate, headers=immutable_headers)
                return FileResponse(candidate)
            # index.html MUST never be cached so Telegram & browsers pick up new deploys immediately
            return FileResponse(dist_root / "index.html", headers=no_cache_headers)

    return app


app = create_app()
