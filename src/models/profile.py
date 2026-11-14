"""Candidate profile database model and seed defaults."""

from datetime import datetime, timezone
from typing import List, Optional
from sqlalchemy import Column, DateTime, Float, Integer, String, Text, JSON
from src.core.database import Base


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


DEFAULT_TARGET_ROLES: List[str] = [
    "Angular Developer",
    "Frontend Developer",
    "Software Engineer",
    "Software Developer",
    "Web Developer",
    "Full Stack Developer",
    "Backend Developer",
    "Graduate Software Engineer",
    "Software Engineering Intern",
]

DEFAULT_TARGET_TECH: List[str] = [
    "Angular",
    "TypeScript",
    "JavaScript",
]


class CandidateProfile(Base):
    """
    Candidate profile data model.
    Maintains strict separation between confirmed, target, and learning skills.
    """
    __tablename__ = "candidate_profiles"

    id = Column(Integer, primary_key=True, autoincrement=True)
    country = Column(String(10), default="EG", nullable=False)
    career_direction = Column(String(100), default="Software Engineering / Web Development", nullable=False)
    priority_target = Column(String(100), default="Angular / Frontend", nullable=False)

    target_role_terms = Column(JSON, default=DEFAULT_TARGET_ROLES, nullable=False)
    target_technology_terms = Column(JSON, default=DEFAULT_TARGET_TECH, nullable=False)

    # Critical skill separation
    confirmed_skills = Column(JSON, default=list, nullable=False)  # Verified skills only
    target_skills = Column(JSON, default=DEFAULT_TARGET_TECH, nullable=False)  # Skills being targeted
    learning_or_exposure_skills = Column(JSON, default=list, nullable=False)  # In progress or introductory

    linkedin_url = Column(String(255), default="https://www.linkedin.com/in/abd-el-rahman-emam", nullable=True)
    education_institution = Column(String(255), default="Egyptian E-Learning University", nullable=True)
    degree_title = Column(String(255), nullable=True)  # Kept null until user confirms
    graduation_year = Column(Integer, nullable=True)   # Kept null until user confirms
    experience_years = Column(Float, nullable=True)    # Kept null / unknown

    github_url = Column(String(255), nullable=True)
    portfolio_url = Column(String(255), nullable=True)

    # Structured CV Data
    full_name = Column(String(255), nullable=True)
    professional_summary = Column(Text, nullable=True)
    experiences = Column(JSON, default=list, nullable=True)
    educations = Column(JSON, default=list, nullable=True)
    projects = Column(JSON, default=list, nullable=True)
    certifications = Column(JSON, default=list, nullable=True)
    languages = Column(JSON, default=list, nullable=True)
    soft_skills = Column(JSON, default=list, nullable=True)
    raw_cv_text = Column(Text, nullable=True)

    # Preferences
    digest_enabled = Column(Integer, default=1, nullable=False)  # 1 = True, 0 = False
    digest_time = Column(String(10), default="09:00", nullable=False)
    digest_threshold = Column(Float, default=70.0, nullable=False)

    created_at = Column(DateTime(timezone=True), default=now_utc, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=now_utc, onupdate=now_utc, nullable=False)
