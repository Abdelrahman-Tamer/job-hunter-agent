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
        self._client: Optional[httpx.AsyncClient] = None

    async def get_client(self) -> httpx.AsyncClient:
        """Reuse persistent HTTP client session across requests."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=self.timeout, follow_redirects=True)
        return self._client

    async def close(self) -> None:
        """Close persistent HTTP client session."""
        if self._client and not self._client.is_closed:
            await self._client.aclose()

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
            client = await self.get_client()
            for attempt in range(1, self.max_retries + 1):
                try:
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

    async def post(
        self,
        url: str,
        data: Optional[Dict[str, Any]] = None,
        json: Optional[Dict[str, Any]] = None,
        headers: Optional[Dict[str, str]] = None,
    ) -> httpx.Response:
        """Execute a safe POST request with retries and backoff."""
        if not is_safe_url(url):
            raise ValueError(f"Blocked unsafe or private host URL: {url}")

        merged_headers = {**self.headers, **(headers or {})}

        async with self.semaphore:
            last_exception: Optional[Exception] = None
            client = await self.get_client()
            for attempt in range(1, self.max_retries + 1):
                try:
                    response = await client.post(url, data=data, json=json, headers=merged_headers)

                    if response.status_code == 429:
                        wait_time = 2.0 ** attempt
                        logger.warning(
                            f"Rate limited on {url} (HTTP 429). Waiting {wait_time:.1f}s before attempt {attempt}/{self.max_retries}"
                        )
                        await asyncio.sleep(wait_time)
                        continue

                    if response.status_code >= 500:
                        response.raise_for_status()

                    return response

                except (httpx.RequestError, httpx.HTTPStatusError) as exc:
                    last_exception = exc
                    wait_time = 2.0 ** attempt
                    logger.warning(
                        f"HTTP POST error ({url}): {exc}. Retrying in {wait_time:.1f}s (attempt {attempt}/{self.max_retries})"
                    )
                    await asyncio.sleep(wait_time)

            if last_exception:
                raise last_exception
            raise RuntimeError(f"HTTP POST request failed after {self.max_retries} attempts: {url}")
