"""Resilient HTTP client helper with exponential backoff and rate limit handling."""

import asyncio
from datetime import datetime
import email.utils
from typing import Any, Dict, Optional
from urllib.parse import urljoin
import httpx

from src.core.config import settings
from src.core.logging import logger
from src.core.security import is_safe_url

MAX_RETRY_AFTER_SECONDS = 30.0
MAX_REDIRECT_HOPS = 5


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
            self._client = httpx.AsyncClient(timeout=self.timeout, follow_redirects=False)
        return self._client

    async def close(self) -> None:
        """Close persistent HTTP client session."""
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    @staticmethod
    def _compute_retry_wait(attempt: int, retry_after: Optional[str] = None) -> float:
        wait_time = 2.0 ** attempt
        if retry_after:
            try:
                wait_time = max(wait_time, float(retry_after))
            except ValueError:
                pass
        return min(max(wait_time, 0.0), MAX_RETRY_AFTER_SECONDS)

    async def _request_with_safe_redirects(
        self,
        client: httpx.AsyncClient,
        method: str,
        url: str,
        params: Optional[Dict[str, Any]] = None,
        data: Optional[Dict[str, Any]] = None,
        json: Optional[Dict[str, Any]] = None,
        headers: Optional[Dict[str, str]] = None,
    ) -> httpx.Response:
        """Send an HTTP request and manually validate every redirect Location against is_safe_url()."""
        current_method = method.upper()
        current_url = url
        current_params = params
        current_data = data
        current_json = json

        for hop in range(MAX_REDIRECT_HOPS + 1):
            if not is_safe_url(current_url):
                raise ValueError(f"Blocked unsafe or private host URL: {current_url}")

            if current_method == "GET":
                response = await client.get(current_url, params=current_params, headers=headers)
            else:
                response = await client.post(
                    current_url,
                    data=current_data,
                    json=current_json,
                    headers=headers,
                )

            if response.status_code in (301, 302, 303, 307, 308):
                location = response.headers.get("location")
                if not location:
                    return response
                next_url = urljoin(current_url, location)
                if not is_safe_url(next_url):
                    raise ValueError(f"Blocked unsafe redirect target URL: {next_url}")
                if hop >= MAX_REDIRECT_HOPS:
                    raise httpx.TooManyRedirects(
                        f"Exceeded maximum {MAX_REDIRECT_HOPS} redirects",
                        request=response.request,
                    )
                if response.status_code in (301, 302, 303) and current_method == "POST":
                    current_method = "GET"
                    current_data = None
                    current_json = None
                current_params = None
                current_url = next_url
                continue

            return response

        raise RuntimeError(f"Redirect handling terminated unexpectedly for {url}")

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
                    response = await self._request_with_safe_redirects(
                        client,
                        "GET",
                        url,
                        params=params,
                        headers=merged_headers,
                    )

                    # Handle 429 Too Many Requests
                    if response.status_code == 429:
                        wait_time = self._compute_retry_wait(attempt, response.headers.get("Retry-After"))
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
                    wait_time = self._compute_retry_wait(attempt)
                    logger.warning(
                        f"HTTP request error ({url}): {exc}. Retrying in {wait_time:.1f}s (attempt {attempt}/{self.max_retries})"
                    )
                    await asyncio.sleep(wait_time)

            if last_exception:
                raise last_exception
            raise RuntimeError(f"HTTP GET request failed after {self.max_retries} attempts: {url}")

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
                    response = await self._request_with_safe_redirects(
                        client,
                        "POST",
                        url,
                        data=data,
                        json=json,
                        headers=merged_headers,
                    )

                    if response.status_code == 429:
                        wait_time = self._compute_retry_wait(attempt, response.headers.get("Retry-After"))
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
                    wait_time = self._compute_retry_wait(attempt)
                    logger.warning(
                        f"HTTP POST error ({url}): {exc}. Retrying in {wait_time:.1f}s (attempt {attempt}/{self.max_retries})"
                    )
                    await asyncio.sleep(wait_time)

            if last_exception:
                raise last_exception
            raise RuntimeError(f"HTTP POST request failed after {self.max_retries} attempts: {url}")
