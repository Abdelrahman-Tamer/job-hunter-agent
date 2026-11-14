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


VERIFIED_CV_SKILLS = [
    "Angular", "Angular Router", "Bootstrap 5", "CSS Grid", "CSS3",
    "Chrome DevTools", "DOM Manipulation", "Firebase", "Firebase Firestore",
    "Flexbox", "Font Awesome", "Form Validation", "Git", "GitHub", "HTML5",
    "HttpClient", "JSON", "JWT Authentication", "JavaScript", "Postman",
    "REST APIs", "Reactive Forms", "RegEx", "RxJS", "Stripe", "Tailwind CSS",
    "TypeScript", "html2canvas", "jQuery", "jsPDF", "localStorage", "npm"
]

VERIFIED_EXPERIENCES = [
    {
        "role": "Frontend Developer Trainee",
        "company": "Route Academy",
        "location": "Cairo, Egypt",
        "start_date": "Mar 2025",
        "end_date": "Jul 2026",
        "bullets": [
            "Delivered 4+ frontend projects including a full Angular e-commerce SPA and a multi-page healthcare platform.",
            "Implemented client-side form validation for 10+ fields using RegEx with clear user-facing error messages.",
            "Built reusable Angular components and standardized layouts to reduce duplicated code across project pages.",
            "Maintained version-controlled repositories on GitHub with branching and structured commit history."
        ]
    },
    {
        "role": "Frontend Web Developer",
        "company": "Elevvo Pathways",
        "location": "Cairo, Egypt",
        "start_date": "Aug 2025",
        "end_date": "Sep 2025",
        "bullets": [
            "Built 5+ responsive pages and UI components with consistent layouts across mobile and desktop screens.",
            "Resolved styling and layout issues to improve UI consistency before client delivery."
        ]
    },
    {
        "role": "Internship Trainee",
        "company": "CIB Egypt",
        "location": "Cairo, Egypt",
        "start_date": "Sep 2025",
        "end_date": "Sep 2025",
        "bullets": [
            "Completed a structured 1-week banking internship with task documentation and review."
        ]
    }
]

VERIFIED_PROJECTS = [
    {
        "name": "Receipta Pro - Electronic Receipt Management System",
        "technologies": ["HTML5", "CSS3", "JavaScript ES6+", "Firebase", "jsPDF"],
        "context": "Confidential Client Project - Waad Rent Cars",
        "bullets": [
            "Built a full Arabic receipt management system for Waad Rent Cars, covering create, edit, delete, search, and payment status tracking.",
            "Integrated Firebase Firestore for real-time cloud sync across devices using a unique company key, with localStorage offline fallback.",
            "Implemented PDF export using jsPDF and html2canvas for high-quality printable receipts.",
            "Delivered a fully responsive RTL UI supporting mobile, tablet, and desktop."
        ]
    },
    {
        "name": "FreshCart E-commerce",
        "technologies": ["Angular 17", "TypeScript", "Bootstrap 5"],
        "context": "Route Academy Final Project",
        "bullets": [
            "Built a full-featured Angular SPA with product catalog, search, category/brand filters, cart, wishlist, and checkout flow.",
            "Integrated REST APIs for products, cart, and orders; implemented JWT authentication with Angular route guards.",
            "Integrated Stripe payment flow with success/failure state handling and real-time cart total recalculation.",
            "Applied lazy loading for feature modules to reduce initial bundle size."
        ]
    },
    {
        "name": "Doccure - Healthcare Appointment Platform",
        "technologies": ["HTML5", "CSS3", "Bootstrap 5", "jQuery", "Font Awesome"],
        "context": "NTI Final Project",
        "bullets": [
            "Built a multi-page healthcare platform with Doctor Dashboard, Doctor Profile, and Profile Settings views.",
            "Implemented responsive layouts using Bootstrap 5 grid with Slick Carousel for featured doctor listings.",
            "Designed a clean dashboard UI with appointment management sections and patient record views."
        ]
    }
]

VERIFIED_EDUCATIONS = [
    {
        "degree": "B.Sc. Computer and Information Technology",
        "institution": "Egyptian E-Learning University (EELU)",
        "location": "Cairo, Egypt",
        "start_date": "Feb 2022",
        "end_date": "Jul 2026",
        "graduation_year": 2026,
        "coursework": ["Web Development", "Data Structures", "Algorithms", "Operating Systems", "Databases"]
    }
]

VERIFIED_CERTIFICATIONS = [
    {
        "name": "NTI Web Designer (Digital Egypt Youth) – Score: 100%",
        "issuer": "NTI",
        "score": "100%"
    },
    {
        "name": "ALX AiCE – AI Career Essentials",
        "issuer": "ALX",
        "score": None
    }
]


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


async def apply_verified_cv_to_profile(session: AsyncSession) -> CandidateProfile:
    """
    Applies Abdelrahman Emam's verified CV to the candidate profile in the database.
    """
    profile = await get_or_create_candidate_profile(session)
    logger.info("Applying verified CV data for Abdelrahman Emam (Egypt)...")
    profile.full_name = "Abdelrahman Emam"
    profile.professional_summary = "Junior Frontend Developer specializing in Angular and responsive web development. Experienced in building SPAs with authentication, REST API integration, route guards, and reactive forms. Delivered 5+ projects across e-commerce, healthcare, and productivity domains, including a live client project."
    profile.confirmed_skills = list(VERIFIED_CV_SKILLS)
    profile.target_skills = list(DEFAULT_TARGET_TECH)
    profile.learning_or_exposure_skills = ["Data Structures & Algorithms", "Operating Systems"]
    profile.education_institution = "Egyptian E-Learning University (EELU)"
    profile.degree_title = "B.Sc. Computer and Information Technology"
    profile.graduation_year = 2026
    profile.experience_years = 1.0
    profile.experiences = list(VERIFIED_EXPERIENCES)
    profile.educations = list(VERIFIED_EDUCATIONS)
    profile.projects = list(VERIFIED_PROJECTS)
    profile.certifications = list(VERIFIED_CERTIFICATIONS)
    profile.languages = ["Arabic (Native)", "English (Professional Working)"]
    profile.soft_skills = ["Problem Solving", "Communication", "Teamwork", "Time Management", "Attention to Detail", "Fast Learning"]
    profile.linkedin_url = "https://www.linkedin.com/in/abd-el-rahman-emam"
    profile.github_url = "https://github.com/Abdelrahman-Tamer"
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
