"""Telegram polling service background worker."""

import asyncio
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession

from src.bot.handlers import TelegramBotDispatcher
from src.bot.telegram_client import TelegramClient
from src.core.config import settings
from src.core.database import async_session_factory
from src.core.logging import logger


class TelegramBotService:
    """Long-polling service for receiving updates."""

    def __init__(
        self,
        client: Optional[TelegramClient] = None,
        dispatcher: Optional[TelegramBotDispatcher] = None,
    ):
        self.client = client or TelegramClient()
        self.dispatcher = dispatcher or TelegramBotDispatcher(self.client)
        self.is_running = False
        self._offset: Optional[int] = None

    async def start_polling(self) -> None:
        """Start long-polling loop."""
        if not self.client.is_configured:
            logger.info("Telegram bot token not configured or default placeholder; polling disabled.")
            return

        self.is_running = True
        logger.info("Starting Telegram Bot long-polling service...")

        # Register official Telegram bot command menu
        try:
            await self.client.set_my_commands([
                {"command": "start", "description": "🎛️ لوحة التحكم الرئيسية | Control Center"},
                {"command": "today", "description": "📋 أفضل فرص متطابقة مع الـ CV اليوم"},
                {"command": "run", "description": "🚀 فحص فوري للمصادر العالمية والمحلية"},
                {"command": "filters", "description": "🔍 تصفية سريعة (Angular / Junior / Remote)"},
                {"command": "search", "description": "🔎 بحث مخصص في الوظائف المتاحة"},
                {"command": "profile", "description": "👤 استعراض مهاراتك والـ CV المعتمد"},
                {"command": "saved", "description": "⭐ الوظائف المحفوظة في قائمتك المفضلة"},
                {"command": "applied", "description": "📝 سجل التقديمات والمتابعة"},
                {"command": "settings", "description": "⚙️ إعدادات النشرة اليومية والتنبيهات"},
                {"command": "help", "description": "📖 دليل استخدام البوت والأوامر"},
            ])
            logger.info("Registered Telegram command menu successfully.")
        except Exception as exc:
            logger.warning(f"Could not auto-register Telegram bot commands: {exc}")

        while self.is_running:
            try:
                updates = await self.client.get_updates(offset=self._offset, timeout=20)
                for update in updates:
                    update_id = update.get("update_id")
                    if update_id is not None:
                        self._offset = update_id + 1

                    # Process update concurrently so long runs never freeze the bot
                    asyncio.create_task(self._safe_handle_update(update))

            except asyncio.CancelledError:
                logger.info("Telegram polling loop cancelled.")
                break
            except Exception as exc:
                logger.error(f"Error in Telegram polling loop: {exc}")
                await asyncio.sleep(5.0)

    async def _safe_handle_update(self, update: dict) -> None:
        """Process an individual update in an isolated async task."""
        try:
            async with async_session_factory() as session:
                await self.dispatcher.handle_update(update, session)
        except Exception as exc:
            logger.error(f"Error handling Telegram update: {exc}", exc_info=True)

    def stop(self) -> None:
        """Signal polling loop to terminate."""
        self.is_running = False
