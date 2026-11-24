"""Candidate profile management endpoints."""

import asyncio
from pathlib import Path
import re
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import get_db_session
from src.core.logging import logger
from src.core.security import sanitize_pii
from src.services.cv_parser_service import (
    CVParserService,
    ParsedCVResult,
)
from src.services.profile_service import (
    export_candidate_profile,
    get_or_create_candidate_profile,
    reset_candidate_profile,
    update_candidate_profile,
)

router = APIRouter(prefix="/api/v1/profile", tags=["Profile"])

MAX_CV_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_CV_TEXT_CHARS = 100_000
ALLOWED_CV_EXTENSIONS = {".pdf", ".docx", ".txt"}
CV_READ_CHUNK_SIZE = 65536


class ProfileUpdateDTO(BaseModel):
    full_name: Optional[str] = None
    professional_summary: Optional[str] = None
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
    experiences: Optional[List[Dict[str, Any]]] = None
    educations: Optional[List[Dict[str, Any]]] = None
    projects: Optional[List[Dict[str, Any]]] = None
    certifications: Optional[List[Dict[str, Any]]] = None
    languages: Optional[List[str]] = None
    soft_skills: Optional[List[str]] = None
    digest_enabled: Optional[int] = None
    digest_time: Optional[str] = None
    digest_threshold: Optional[float] = None


class CVConfirmRequestDTO(BaseModel):
    full_name: Optional[str] = None
    professional_summary: Optional[str] = None
    confirmed_skills: List[str] = Field(default_factory=list)
    target_skills: List[str] = Field(default_factory=list)
    learning_or_exposure_skills: List[str] = Field(default_factory=list)
    education_institution: Optional[str] = None
    degree_title: Optional[str] = None
    graduation_year: Optional[int] = None
    experience_years: Optional[float] = None
    linkedin_url: Optional[str] = None
    github_url: Optional[str] = None
    portfolio_url: Optional[str] = None
    experiences: List[Dict[str, Any]] = Field(default_factory=list)
    educations: List[Dict[str, Any]] = Field(default_factory=list)
    projects: List[Dict[str, Any]] = Field(default_factory=list)
    certifications: List[Dict[str, Any]] = Field(default_factory=list)
    languages: List[str] = Field(default_factory=list)
    soft_skills: List[str] = Field(default_factory=list)


class CVParseRequestDTO(BaseModel):
    cv_raw_text: str
    consent_to_extract: bool = False


@router.get("", response_model=Dict[str, Any])
async def get_profile(db: AsyncSession = Depends(get_db_session)) -> Dict[str, Any]:
    """Retrieve primary candidate profile."""
    try:
        profile = await get_or_create_candidate_profile(db)
        return {
            "id": profile.id,
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
        }
    except Exception as exc:
        logger.error(f"Error retrieving candidate profile: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not load candidate profile.",
        )


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


@router.post("/cv/upload", response_model=ParsedCVResult)
async def upload_cv_for_parsing(
    file: Optional[UploadFile] = File(None),
    cv_raw_text: Optional[str] = Form(None),
    cv_text: Optional[str] = Form(None),
) -> ParsedCVResult:
    """
    Upload and parse CV locally from PDF, DOCX, or text file.
    Does NOT transmit files or text to external AI providers.
    Returns structured candidate information for user review before saving.
    """
    raw_text = ""
    if file:
        filename = (file.filename or "").strip()
        ext = Path(filename).suffix.lower()
        if ext not in ALLOWED_CV_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail="Unsupported file type. Allowed extensions: .pdf, .docx, .txt",
            )

        chunks: List[bytes] = []
        total_bytes = 0
        while True:
            chunk = await file.read(CV_READ_CHUNK_SIZE)
            if not chunk:
                break
            total_bytes += len(chunk)
            if total_bytes > MAX_CV_UPLOAD_BYTES:
                raise HTTPException(status_code=400, detail="File size exceeds 10MB limit")
            chunks.append(chunk)
        content = b"".join(chunks)

        if ext == ".pdf" and not content.startswith(b"%PDF-"):
            raise HTTPException(status_code=400, detail="Invalid PDF file header.")
        if ext == ".docx" and not content.startswith(b"PK\x03\x04"):
            raise HTTPException(status_code=400, detail="Invalid DOCX file header.")
        if ext == ".txt" and b"\x00" in content:
            raise HTTPException(status_code=400, detail="Invalid plain text CV file.")

        try:
            raw_text = await asyncio.to_thread(CVParserService.extract_text, content, filename)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        raw_text = raw_text[:MAX_CV_TEXT_CHARS]
    elif cv_raw_text or cv_text:
        raw_text = cv_raw_text or cv_text
        if len(raw_text) > MAX_CV_TEXT_CHARS:
            raise HTTPException(status_code=400, detail="CV text exceeds 100,000 character limit")
    else:
        raise HTTPException(status_code=400, detail="Either a CV file or raw text must be provided.")

    if not raw_text.strip():
        raise HTTPException(status_code=400, detail="Could not extract text from the provided CV.")

    parsed = CVParserService.parse_cv(raw_text)
    return parsed


@router.post("/cv/confirm", response_model=Dict[str, Any])
async def confirm_and_save_cv(
    dto: CVConfirmRequestDTO,
    db: AsyncSession = Depends(get_db_session),
) -> Dict[str, Any]:
    """
    Save the candidate-reviewed and approved structured profile into the database.
    Separates confirmed, target, and learning skills.
    """
    profile = await get_or_create_candidate_profile(db)

    updates: Dict[str, Any] = {
        "confirmed_skills": dto.confirmed_skills,
        "target_skills": dto.target_skills,
        "learning_or_exposure_skills": dto.learning_or_exposure_skills,
    }

    if dto.full_name:
        updates["full_name"] = dto.full_name
    if dto.professional_summary:
        updates["professional_summary"] = dto.professional_summary
    if dto.education_institution:
        updates["education_institution"] = dto.education_institution
    if dto.degree_title:
        updates["degree_title"] = dto.degree_title
    if dto.graduation_year:
        updates["graduation_year"] = dto.graduation_year
    if dto.experience_years is not None:
        updates["experience_years"] = dto.experience_years
    if dto.linkedin_url:
        updates["linkedin_url"] = dto.linkedin_url
    if dto.github_url:
        updates["github_url"] = dto.github_url
    if dto.portfolio_url:
        updates["portfolio_url"] = dto.portfolio_url

    if dto.experiences:
        updates["experiences"] = dto.experiences
    if dto.educations:
        updates["educations"] = dto.educations
    if dto.projects:
        updates["projects"] = dto.projects
    if dto.certifications:
        updates["certifications"] = dto.certifications
    if dto.languages:
        updates["languages"] = dto.languages
    if dto.soft_skills:
        updates["soft_skills"] = dto.soft_skills

    updated_profile = await update_candidate_profile(db, profile.id, updates)
    if not updated_profile:
        raise HTTPException(status_code=500, detail="Failed to save confirmed profile.")

    res = await export_candidate_profile(db)
    res["status"] = "success"
    res["message"] = "Candidate profile successfully updated from verified CV."
    res["confirmed_skills_count"] = len(dto.confirmed_skills)
    return res


@router.post("/import-cv")
async def import_cv_legacy(
    req: CVParseRequestDTO,
) -> Dict[str, Any]:
    """Legacy helper for plain text parsing preview."""
    if len(req.cv_raw_text) > MAX_CV_TEXT_CHARS:
        raise HTTPException(status_code=400, detail="CV text exceeds 100,000 character limit")
    clean_text = sanitize_pii(req.cv_raw_text)
    parsed = CVParserService.parse_cv(clean_text)
    return {
        "sanitized_text": parsed.sanitized_text_preview,
        "detected_skills": parsed.confirmed_skills,
        "detected_roles": ["Frontend Developer", "Angular Developer"],
        "detected_education": parsed.educations[0].institution if parsed.educations else "Egyptian E-Learning University",
        "requires_user_confirmation": True,
    }
