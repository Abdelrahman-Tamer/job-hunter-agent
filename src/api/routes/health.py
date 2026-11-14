"""Health and readiness check endpoints."""

from typing import Any, Dict
from fastapi import APIRouter, Depends, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.config import settings
from src.core.database import get_db_session

router = APIRouter(tags=["Health"])


@router.get("/health", status_code=status.HTTP_200_OK)
async def health_check() -> Dict[str, Any]:
    """Basic liveness probe."""
    return {
        "status": "healthy",
        "app_name": settings.APP_NAME,
        "environment": settings.APP_ENV,
        "timezone": settings.TIMEZONE,
    }


@router.get("/ready", status_code=status.HTTP_200_OK)
async def readiness_check(
    db: AsyncSession = Depends(get_db_session),
) -> Dict[str, Any]:
    """Readiness probe checking database connectivity."""
    db_ok = False
    try:
        res = await db.execute(text("SELECT 1"))
        db_ok = res.scalar() == 1
    except Exception:
        db_ok = False

    return {
        "status": "ready" if db_ok else "not_ready",
        "database_connected": db_ok,
    }


@router.get("/health/bot", status_code=status.HTTP_200_OK)
async def bot_health_check() -> Dict[str, Any]:
    """Inspect Telegram bot status and configuration."""
    from src.bot.telegram_client import TelegramClient
    client = TelegramClient()
    bot_info = {}
    webhook_info = {}
    if client.is_configured:
        try:
            bot_info = await client.get_me()
        except Exception as e:
            bot_info = {"error": str(e)}
    return {
        "is_configured": client.is_configured,
        "polling_enabled": settings.TELEGRAM_POLLING,
        "owner_id_configured": bool(settings.TELEGRAM_OWNER_ID),
        "bot_info": bot_info,
    }
