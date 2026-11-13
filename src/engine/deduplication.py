"""Deduplication and canonicalization engine for job opportunities."""

import hashlib
import re
from typing import Optional, Tuple
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.security import canonicalize_url
from src.models.job import Job
from src.sources.base import NormalizedJobData


def compute_url_hash(url: str) -> str:
    """Compute deterministic SHA-256 hash of canonicalized URL."""
    canonical = canonicalize_url(url)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def normalize_string_key(text: str) -> str:
    """Normalize text for fuzzy matching by removing punctuation and extra whitespace."""
    clean = re.sub(r"[^\w\s]", " ", text.lower())
    return " ".join(clean.split())


class DeduplicationEngine:
    """Detects existing job opportunities and classifies new vs modified requisitions."""

    @staticmethod
    async def find_existing_job(
        session: AsyncSession,
        normalized: NormalizedJobData,
    ) -> Tuple[Optional[Job], str]:
        """
        Check for duplicates against active database records:
        1. Exact match on source_name + source_job_id
        2. Exact match on canonical_url_hash
        3. Strict fuzzy match on normalized company + normalized title + raw_location

        Returns (Job or None, match_type_reason).
        """
        # 1. Source + Source Job ID match
        stmt = select(Job).where(
            Job.source_name == normalized.source_name,
            Job.source_job_id == normalized.source_job_id,
        )
        res = await session.execute(stmt)
        job = res.scalar_one_or_none()
        if job:
            return job, "SOURCE_AND_ID_MATCH"

        # 2. Canonical URL Hash match
        url_hash = compute_url_hash(normalized.original_application_url or normalized.source_url)
        stmt_hash = select(Job).where(Job.canonical_url_hash == url_hash)
        res_hash = await session.execute(stmt_hash)
        job_hash = res_hash.scalar_one_or_none()
        if job_hash:
            return job_hash, "CANONICAL_URL_MATCH"

        # 3. Fuzzy match: same company + exact normalized title + location
        norm_company = normalize_string_key(normalized.company)
        norm_title = normalize_string_key(normalized.title)
        stmt_fuzzy = select(Job).where(
            Job.company.ilike(f"%{norm_company}%"),
            Job.title.ilike(f"%{norm_title}%"),
        )
        res_fuzzy = await session.execute(stmt_fuzzy)
        candidates = res_fuzzy.scalars().all()
        for cand in candidates:
            # Check if locations are identical or both remote
            cand_loc = normalize_string_key(cand.raw_location or "")
            new_loc = normalize_string_key(normalized.raw_location or "")
            if cand_loc == new_loc or ("remote" in cand_loc and "remote" in new_loc):
                return cand, "FUZZY_COMPANY_TITLE_LOCATION_MATCH"

        return None, "NOT_FOUND"
