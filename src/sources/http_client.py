"""Resilient HTTP client helper with exponential backoff and rate limit handling."""

import asyncio
from datetime import datetime
import email.utils
from typing import Any, Dict, Optional
import httpx

from src.core.config import settings
from src.core.logging import logger
from src.core.security import is_safe_url


class ResilientHttpClient:
    """Async HTTP wrapper with SSRF safety, timeout, retries, and exponential backoff."""

    def __init__(
        self,
        timeout: float = settings.DEFAULT_HTTP_TIMEOUT,
        max_retries: int = settings.SOURCE_RETRY_COUNT,
        concurrency: int = settings.MAX_CONCURRENT_SOURCE_REQUESTS,
    ):
        self.timeout = timeout
        self.max_retries = max_retries
        self.semaphore = asyncio.Semaphore(concurrency)
        self.headers = {
            "User-Agent": "JobHunterAgent/1.0 (+https://github.com/abd-el-rahman-emam/job-hunter-agent)",
            "Accept": "application/json, application/xml, text/xml, */*",
        }

    async def get(
        self,
        url: str,
        params: Optional[Dict[str, Any]] = None,
        headers: Optional[Dict[str, str]] = None,
    ) -> httpx.Response:
        """Execute a safe GET request with retries and backoff."""
        if not is_safe_url(url):
            raise ValueError(f"Blocked unsafe or private host URL: {url}")

        merged_headers = {**self.headers, **(headers or {})}

        async with self.semaphore:
            last_exception: Optional[Exception] = None
            for attempt in range(1, self.max_retries + 1):
                try:
                    async with httpx.AsyncClient(timeout=self.timeout) as client:
                        response = await client.get(url, params=params, headers=merged_headers)

                        # Handle 429 Too Many Requests
                        if response.status_code == 429:
                            retry_after = response.headers.get("Retry-After")
                            wait_time = 2.0 ** attempt
                            if retry_after:
                                try:
                                    wait_time = max(wait_time, float(retry_after))
                                except ValueError:
                                    # Could be HTTP date
                                    pass
                            logger.warning(
                                f"Rate limited on {url} (HTTP 429). Waiting {wait_time:.1f}s before attempt {attempt}/{self.max_retries}"
                            )
                            await asyncio.sleep(wait_time)
                            continue

                        # Raise for 5xx server errors to trigger retry
                        if response.status_code >= 500:
                            response.raise_for_status()

                        return response

                except (httpx.RequestError, httpx.HTTPStatusError) as exc:
                    last_exception = exc
                    wait_time = 2.0 ** attempt
                    logger.warning(
                        f"HTTP request error ({url}): {exc}. Retrying in {wait_time:.1f}s (attempt {attempt}/{self.max_retries})"
                    )
                    await asyncio.sleep(wait_time)

            if last_exception:
                raise last_exception
            raise RuntimeError(f"HTTP request failed after {self.max_retries} attempts: {url}")
