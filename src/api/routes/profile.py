"""Candidate profile management endpoints."""

import re
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import get_db_session
from src.core.security import sanitize_pii
from src.services.profile_service import (
    export_candidate_profile,
    get_or_create_candidate_profile,
    reset_candidate_profile,
    update_candidate_profile,
)

router = APIRouter(prefix="/api/v1/profile", tags=["Profile"])


class ProfileUpdateDTO(BaseModel):
    country: Optional[str] = None
    career_direction: Optional[str] = None
    priority_target: Optional[str] = None
    target_role_terms: Optional[List[str]] = None
    target_technology_terms: Optional[List[str]] = None
    confirmed_skills: Optional[List[str]] = None
    target_skills: Optional[List[str]] = None
    learning_or_exposure_skills: Optional[List[str]] = None
    linkedin_url: Optional[str] = None
    education_institution: Optional[str] = None
    degree_title: Optional[str] = None
    graduation_year: Optional[int] = None
    experience_years: Optional[float] = None
    github_url: Optional[str] = None
    portfolio_url: Optional[str] = None
    digest_enabled: Optional[int] = None
    digest_time: Optional[str] = None
    digest_threshold: Optional[float] = None


class CVParseRequestDTO(BaseModel):
    cv_raw_text: str
    consent_to_extract: bool = False


class CVParseResultDTO(BaseModel):
    sanitized_text: str
    detected_skills: List[str]
    detected_roles: List[str]
    detected_education: Optional[str] = None
    requires_user_confirmation: bool = True


@router.get("", response_model=Dict[str, Any])
async def get_profile(db: AsyncSession = Depends(get_db_session)) -> Dict[str, Any]:
    """Retrieve primary candidate profile."""
    profile = await get_or_create_candidate_profile(db)
    return {
        "id": profile.id,
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
        "digest_enabled": bool(profile.digest_enabled),
        "digest_time": profile.digest_time,
        "digest_threshold": profile.digest_threshold,
    }


@router.put("", response_model=Dict[str, Any])
async def update_profile(
    dto: ProfileUpdateDTO,
    db: AsyncSession = Depends(get_db_session),
) -> Dict[str, Any]:
    """Update profile attributes."""
    profile = await get_or_create_candidate_profile(db)
    updates = dto.model_dump(exclude_unset=True)
    updated = await update_candidate_profile(db, profile.id, updates)
    if not updated:
        raise HTTPException(status_code=404, detail="Profile update failed")
    return {"status": "success", "message": "Profile updated successfully"}


@router.get("/export", response_model=Dict[str, Any])
async def export_profile(db: AsyncSession = Depends(get_db_session)) -> Dict[str, Any]:
    """Export clean candidate profile configuration."""
    return await export_candidate_profile(db)


@router.post("/reset", response_model=Dict[str, Any])
async def reset_profile(db: AsyncSession = Depends(get_db_session)) -> Dict[str, Any]:
    """Reset candidate profile to baseline defaults."""
    await reset_candidate_profile(db)
    return {"status": "success", "message": "Profile reset to baseline defaults."}


@router.post("/import-cv", response_model=CVParseResultDTO)
async def import_cv_locally(
    req: CVParseRequestDTO,
) -> CVParseResultDTO:
    """
    Parse candidate CV locally without transmitting raw PII.
    Extracts candidate skills and education for user review before saving.
    """
    clean_text = sanitize_pii(req.cv_raw_text)
    lower_text = clean_text.lower()

    # Known technology terms heuristic parser
    known_tech = [
        "angular", "typescript", "javascript", "html", "css", "scss",
        "rxjs", "ngrx", "git", "rest", "python", "fastapi", "sql",
        "docker", "tailwind", "bootstrap", "node.js", "express"
    ]
    detected_skills: List[str] = []
    for tech in known_tech:
        if re.search(rf"\b{re.escape(tech)}\b", lower_text):
            detected_skills.append(tech.title() if len(tech) > 3 else tech.upper())

    # Detect education
    detected_edu = None
    if "e-learning university" in lower_text or "eelu" in lower_text:
        detected_edu = "Egyptian E-Learning University"

    return CVParseResultDTO(
        sanitized_text=clean_text[:500] + ("..." if len(clean_text) > 500 else ""),
        detected_skills=detected_skills,
        detected_roles=["Frontend Developer", "Angular Developer"],
        detected_education=detected_edu,
        requires_user_confirmation=True,
    )
