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
