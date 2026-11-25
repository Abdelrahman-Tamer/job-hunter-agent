"""Asynchronous Job Expiry and Ghost Posting Detector."""

import asyncio
from datetime import datetime, timezone
import re
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urljoin
import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.logging import logger
from src.core.security import is_safe_url
from src.models.job import Job


DEAD_JOB_PHRASES = [
    "this job has expired",
    "job is no longer available",
    "position has been filled",
    "no longer accepting applications",
    "this job posting is no longer active",
    "the job you are trying to view is no longer available",
    "job posting expired",
    "the listing has expired",
    "this vacancy is closed",
    "this role has closed",
    "this listing is closed",
    "job closed",
    "application closed",
    "404 not found",
    "page not found",
]

COMMON_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}


async def check_job_url(url: str, client: httpx.AsyncClient) -> Tuple[bool, str]:
    """
    Verify if a job posting URL is still live and actively accepting candidates.
    Validates initial URL and each redirect hop against SSRF rules.
    Returns (is_expired, reason).
    """
    if not url or not is_safe_url(url):
        return False, "Blocked unsafe or invalid URL"

    max_redirects = 3
    current_url = url

    try:
        for hop in range(max_redirects + 1):
            # Disable automatic redirects so each Location target is validated with is_safe_url()
            async with client.stream("GET", current_url, headers=COMMON_HEADERS, follow_redirects=False, timeout=7.0) as resp:
                if resp.status_code in (301, 302, 303, 307, 308):
                    location = resp.headers.get("location")
                    if not location:
                        return False, f"HTTP {resp.status_code} redirect missing Location"
                    next_url = urljoin(current_url, location)
                    if not is_safe_url(next_url):
                        return False, "Blocked unsafe redirect target"
                    if hop >= max_redirects:
                        return False, "Too many redirects (max 3 hops)"
                    current_url = next_url
                    continue

                # Direct dead status codes
                if resp.status_code in (404, 410):
                    return True, f"HTTP {resp.status_code} Page Not Found"
                if resp.status_code >= 500:
                    # Temporary server error; do not expire prematurely
                    return False, f"Server HTTP {resp.status_code}"
                if resp.status_code >= 400:
                    return True, f"HTTP {resp.status_code} Client Error"

                # Inspect redirect target (e.g. redirected to careers homepage)
                final_url = str(resp.url).lower()
                if final_url.rstrip("/") in ("https://remoteok.com", "https://himalayas.app/jobs", "https://remotive.com"):
                    return True, "Redirected to generic job directory homepage"

                # Read first 30KB of content to scan for dead job keywords
                body_chunks = []
                bytes_read = 0
                async for chunk in resp.aiter_bytes():
                    body_chunks.append(chunk)
                    bytes_read += len(chunk)
                    if bytes_read >= 30000:
                        break

                content_text = b"".join(body_chunks).decode("utf-8", errors="ignore").lower()

                for phrase in DEAD_JOB_PHRASES:
                    if phrase in content_text:
                        return True, f"Dead posting marker detected: '{phrase}'"

                return False, "Active (200 OK)"

        return False, "Too many redirects (max 3 hops)"

    except httpx.TimeoutException:
        # Do not expire jobs on transient timeout
        return False, "Connection timeout (kept active)"
    except Exception as exc:
        logger.debug(f"Link check failed for {url}: {exc}")
        return False, f"Check error: {str(exc)[:50]}"


async def scan_and_mark_expired_jobs(session: AsyncSession, limit: int = 40) -> Dict[str, Any]:
    """
    Scan active job opportunities in the database and cull expired or ghost listings.
    Releases read transaction before issuing concurrent HTTP checks.
    """
    now = datetime.now(timezone.utc)
    stmt = (
        select(
            Job.id,
            Job.title,
            Job.company,
            Job.original_application_url,
            Job.source_url,
        )
        .where(Job.is_active == True, Job.is_expired == False)
        .order_by(Job.last_verified_at.asc().nullsfirst(), Job.first_seen_at.desc())
        .limit(limit)
    )
    res = await session.execute(stmt)
    targets = [
        (row.id, row.title, row.company, row.original_application_url or row.source_url)
        for row in res.all()
    ]

    # End read-only transaction before slow external HTTP checks without expiring caller objects
    await session.commit()

    if not targets:
        return {"checked": 0, "expired": 0, "active": 0}

    semaphore = asyncio.Semaphore(8)

    async with httpx.AsyncClient() as client:
        async def _check_single(
            job_id: int, title: str, company: str, url: str
        ) -> Tuple[int, str, str, bool, str]:
            async with semaphore:
                is_expired, reason = await check_job_url(url, client)
                return job_id, title, company, is_expired, reason

        results = await asyncio.gather(
            *(_check_single(jid, t, c, u) for jid, t, c, u in targets),
            return_exceptions=False,
        )

    expired_count = 0
    active_count = 0
    job_ids = [r[0] for r in results]
    jobs_res = await session.execute(select(Job).where(Job.id.in_(job_ids)))
    jobs_by_id = {j.id: j for j in jobs_res.scalars().all()}

    for job_id, title, company, is_expired, reason in results:
        job = jobs_by_id.get(job_id)
        if not job:
            continue
        job.last_verified_at = now
        if is_expired:
            job.is_expired = True
            job.is_active = False
            job.expiry_reason = reason
            expired_count += 1
            logger.info(f"Marked Job #{job_id} ({title} at {company}) as EXPIRED: {reason}")
        else:
            active_count += 1

    await session.commit()
    logger.info(f"Expiry scan completed: checked={len(results)}, expired={expired_count}, active={active_count}")
    return {
        "checked": len(results),
        "expired": expired_count,
        "active": active_count,
    }
