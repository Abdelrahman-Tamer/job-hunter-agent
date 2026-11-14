"""Candidate profile service: seed, read, update, export, and reset."""

from typing import Any, Dict, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.profile import (
    CandidateProfile,
    DEFAULT_TARGET_ROLES,
    DEFAULT_TARGET_TECH,
)
from src.core.logging import logger


async def get_or_create_candidate_profile(session: AsyncSession) -> CandidateProfile:
    """
    Fetch the primary candidate profile or initialize it with approved baseline settings.
    """
    stmt = select(CandidateProfile).limit(1)
    result = await session.execute(stmt)
    profile = result.scalar_one_or_none()

    if profile is None:
        logger.info("Initializing baseline candidate profile for Abd El-Rahman Emam (Egypt)...")
        profile = CandidateProfile(
            country="EG",
            career_direction="Software Engineering / Web Development",
            priority_target="Angular / Frontend",
            target_role_terms=list(DEFAULT_TARGET_ROLES),
            target_technology_terms=list(DEFAULT_TARGET_TECH),
            confirmed_skills=[],  # Critical: empty until verified from CV or explicit user input
            target_skills=list(DEFAULT_TARGET_TECH),
            learning_or_exposure_skills=[],
            linkedin_url="https://www.linkedin.com/in/abd-el-rahman-emam",
            education_institution="Egyptian E-Learning University",
            degree_title=None,
            graduation_year=None,
            experience_years=None,
            github_url=None,
            portfolio_url=None,
            digest_enabled=1,
            digest_time="09:00",
            digest_threshold=70.0,
        )
        session.add(profile)
        await session.commit()
        await session.refresh(profile)

    return profile


async def update_candidate_profile(
    session: AsyncSession,
    profile_id: int,
    updates: Dict[str, Any],
) -> Optional[CandidateProfile]:
    """Apply validated updates to candidate profile."""
    stmt = select(CandidateProfile).where(CandidateProfile.id == profile_id)
    result = await session.execute(stmt)
    profile = result.scalar_one_or_none()
    if not profile:
        return None

    allowed_fields = {
        "full_name",
        "professional_summary",
        "country",
        "career_direction",
        "priority_target",
        "target_role_terms",
        "target_technology_terms",
        "confirmed_skills",
        "target_skills",
        "learning_or_exposure_skills",
        "linkedin_url",
        "education_institution",
        "degree_title",
        "graduation_year",
        "experience_years",
        "github_url",
        "portfolio_url",
        "experiences",
        "educations",
        "projects",
        "certifications",
        "languages",
        "soft_skills",
        "raw_cv_text",
        "digest_enabled",
        "digest_time",
        "digest_threshold",
    }

    for key, value in updates.items():
        if key in allowed_fields:
            setattr(profile, key, value)

    await session.commit()
    await session.refresh(profile)
    return profile


async def export_candidate_profile(session: AsyncSession) -> Dict[str, Any]:
    """Export profile as clean JSON dictionary without database internals."""
    profile = await get_or_create_candidate_profile(session)
    return {
        "full_name": profile.full_name,
        "professional_summary": profile.professional_summary,
        "country": profile.country,
        "career_direction": profile.career_direction,
        "priority_target": profile.priority_target,
        "target_role_terms": profile.target_role_terms,
        "target_technology_terms": profile.target_technology_terms,
        "confirmed_skills": profile.confirmed_skills,
        "target_skills": profile.target_skills,
        "learning_or_exposure_skills": profile.learning_or_exposure_skills,
        "linkedin_url": profile.linkedin_url,
        "education_institution": profile.education_institution,
        "degree_title": profile.degree_title,
        "graduation_year": profile.graduation_year,
        "experience_years": profile.experience_years,
        "github_url": profile.github_url,
        "portfolio_url": profile.portfolio_url,
        "experiences": profile.experiences or [],
        "educations": profile.educations or [],
        "projects": profile.projects or [],
        "certifications": profile.certifications or [],
        "languages": profile.languages or [],
        "soft_skills": profile.soft_skills or [],
        "digest_enabled": bool(profile.digest_enabled),
        "digest_time": profile.digest_time,
        "digest_threshold": profile.digest_threshold,
        "updated_at": profile.updated_at.isoformat() if profile.updated_at else None,
    }


async def reset_candidate_profile(session: AsyncSession) -> CandidateProfile:
    """Reset candidate profile to baseline defaults."""
    stmt = select(CandidateProfile).limit(1)
    result = await session.execute(stmt)
    profile = result.scalar_one_or_none()
    if profile:
        await session.delete(profile)
        await session.commit()
    return await get_or_create_candidate_profile(session)
