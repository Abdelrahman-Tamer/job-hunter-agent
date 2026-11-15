"""Typed asynchronous Telegram Bot API client."""

import asyncio
import json
from typing import Any, Dict, List, Optional
import httpx

from src.core.config import settings
from src.core.logging import logger


class TelegramClient:
    """Async client for Telegram Bot API using httpx."""

    API_BASE = "https://api.telegram.org/bot"

    def __init__(self, token: Optional[str] = None):
        self.token = token or settings.TELEGRAM_BOT_TOKEN
        self.base_url = f"{self.API_BASE}{self.token}" if self.token else ""

    @property
    def is_configured(self) -> bool:
        return bool(self.token and not self.token.startswith("123456789:"))

    async def _request(
        self,
        method: str,
        endpoint: str,
        payload: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Execute request to Telegram Bot API with retry on 429."""
        if not self.is_configured:
            logger.debug(f"Telegram client not configured; simulated {endpoint}")
            return {"ok": True, "result": {"message_id": 1}}

        url = f"{self.base_url}/{endpoint}"
        async with httpx.AsyncClient(timeout=30.0) as client:
            for attempt in range(1, 4):
                try:
                    if method.upper() == "POST":
                        resp = await client.post(url, json=payload)
                    else:
                        resp = await client.get(url, params=payload)

                    if resp.status_code == 429:
                        retry_after = float(resp.json().get("parameters", {}).get("retry_after", 3.0))
                        logger.warning(f"Telegram 429 rate limit. Waiting {retry_after}s...")
                        await asyncio.sleep(retry_after)
                        continue

                    data = resp.json()
                    if not data.get("ok"):
                        logger.error(f"Telegram API error ({endpoint}): {data.get('description')}")
                    return data
                except Exception as exc:
                    logger.warning(f"Telegram request failed (attempt {attempt}/3): {exc}")
                    await asyncio.sleep(1.0 * attempt)

            return {"ok": False, "description": "Request failed after 3 attempts"}

    async def send_message(
        self,
        chat_id: int,
        text: str,
        parse_mode: str = "HTML",
        disable_web_page_preview: bool = True,
        reply_markup: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Send a text message to a specific chat."""
        payload: Dict[str, Any] = {
            "chat_id": chat_id,
            "text": text,
            "parse_mode": parse_mode,
            "disable_web_page_preview": disable_web_page_preview,
        }
        if reply_markup:
            payload["reply_markup"] = reply_markup
        return await self._request("POST", "sendMessage", payload)

    async def send_chat_action(
        self,
        chat_id: int,
        action: str = "typing",
    ) -> Dict[str, Any]:
        """Broadcast chat action indicator (typing, find_location, etc.)."""
        payload: Dict[str, Any] = {
            "chat_id": chat_id,
            "action": action,
        }
        return await self._request("POST", "sendChatAction", payload)

    async def edit_message_text(
        self,
        chat_id: int,
        message_id: int,
        text: str,
        parse_mode: str = "HTML",
        reply_markup: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Edit an existing message."""
        payload: Dict[str, Any] = {
            "chat_id": chat_id,
            "message_id": message_id,
            "text": text,
            "parse_mode": parse_mode,
        }
        if reply_markup:
            payload["reply_markup"] = reply_markup
        return await self._request("POST", "editMessageText", payload)

    async def answer_callback_query(
        self,
        callback_query_id: str,
        text: Optional[str] = None,
        show_alert: bool = False,
    ) -> Dict[str, Any]:
        """Acknowledge a callback query from an inline button."""
        payload: Dict[str, Any] = {
            "callback_query_id": callback_query_id,
            "show_alert": show_alert,
        }
        if text:
            payload["text"] = text
        return await self._request("POST", "answerCallbackQuery", payload)

    async def get_updates(
        self,
        offset: Optional[int] = None,
        limit: int = 100,
        timeout: int = 10,
    ) -> List[Dict[str, Any]]:
        """Fetch incoming updates via long polling."""
        payload: Dict[str, Any] = {"limit": limit, "timeout": timeout}
        if offset is not None:
            payload["offset"] = offset
        res = await self._request("GET", "getUpdates", payload)
        return res.get("result", [])

    async def set_my_commands(self, commands: List[Dict[str, str]]) -> Dict[str, Any]:
        """Register official command menu with Telegram Bot API."""
        return await self._request("POST", "setMyCommands", {"commands": commands})

    async def send_document(
        self,
        chat_id: int,
        document_bytes: bytes,
        filename: str,
        caption: Optional[str] = None,
        parse_mode: str = "HTML",
        reply_markup: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Send a document or binary file (e.g. Tailored PDF Resume) to a chat."""
        if not self.is_configured:
            logger.debug(f"Telegram client not configured; simulated sendDocument {filename}")
            return {"ok": True, "result": {"message_id": 1}}

        url = f"{self.base_url}/sendDocument"
        data: Dict[str, Any] = {"chat_id": str(chat_id), "parse_mode": parse_mode}
        if caption:
            data["caption"] = caption
        if reply_markup:
            data["reply_markup"] = json.dumps(reply_markup)

        files = {"document": (filename, document_bytes, "application/pdf")}
        async with httpx.AsyncClient(timeout=45.0) as client:
            try:
                resp = await client.post(url, data=data, files=files)
                return resp.json()
            except Exception as exc:
                logger.error(f"Failed to send Telegram document {filename}: {exc}")
                return {"ok": False, "description": str(exc)}

    async def get_me(self) -> Dict[str, Any]:
        """Fetch bot identity information from Telegram Bot API."""
        return await self._request("GET", "getMe")
