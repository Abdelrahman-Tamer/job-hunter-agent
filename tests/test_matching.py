"""Unit tests for deterministic matching engine and scoring rules."""

from datetime import datetime, timezone
import pytest
from src.engine.matching import MatchingEngine
from src.models.enums import (
    EmploymentType,
    GeographicEligibility,
    MatchBand,
    SeniorityLevel,
)
from src.models.profile import CandidateProfile, DEFAULT_TARGET_ROLES, DEFAULT_TARGET_TECH


@pytest.fixture
def base_profile():
    return CandidateProfile(
        country="EG",
        career_direction="Software Engineering / Web Development",
        priority_target="Angular / Frontend",
        target_role_terms=list(DEFAULT_TARGET_ROLES),
        target_technology_terms=list(DEFAULT_TARGET_TECH),
        confirmed_skills=[],  # Baseline: no verified skills yet
        target_skills=["Angular", "TypeScript", "JavaScript"],
        learning_or_exposure_skills=[],
        education_institution="Egyptian E-Learning University",
        experience_years=None,
    )


def test_target_skills_do_not_earn_confirmed_skill_points(base_profile):
    """
    CRITICAL TEST: Target skills like Angular must NOT earn confirmed-skill points.
    When confirmed_skills is empty, confirmed_skills score must be 0.0.
    """
    engine = MatchingEngine()
    result = engine.evaluate(
        job_title="Senior Angular Developer",
        job_description="Requires deep knowledge of Angular, TypeScript, and RxJS.",
        job_skills=["Angular", "TypeScript"],
        seniority=SeniorityLevel.SENIOR,
        employment_type=EmploymentType.FULL_TIME,
        eligibility=GeographicEligibility.REMOTE_WORLDWIDE,
        published_at=datetime.now(timezone.utc),
        required_experience_years=5.0,
        profile=base_profile,
    )

    # Confirmed skills must be 0.0 because candidate has not verified skills yet
    assert result.breakdown.confirmed_skills == 0.0
    # But role relevance recognizes the title
    assert result.breakdown.role_relevance == 20.0
    # Check that reasons honestly distinguish target interest from confirmed skill
    assert any("learning/target interest" in r for r in result.reasons)
    assert any("no confirmed skills verified" in g for g in result.skill_gaps)


def test_confirmed_skills_earn_points_when_verified(base_profile):
    """When candidate adds verified confirmed skills, they earn skill points."""
    base_profile.confirmed_skills = ["Angular", "TypeScript"]

    engine = MatchingEngine()
    result = engine.evaluate(
        job_title="Angular Developer",
        job_description="We need Angular and TypeScript.",
        job_skills=["Angular", "TypeScript"],
        seniority=SeniorityLevel.JUNIOR,
        employment_type=EmploymentType.FULL_TIME,
        eligibility=GeographicEligibility.REMOTE_WORLDWIDE,
        published_at=datetime.now(timezone.utc),
        required_experience_years=1.0,
        profile=base_profile,
    )

    assert result.breakdown.confirmed_skills > 15.0
    assert result.score >= 80.0
    assert result.band in (MatchBand.EXCELLENT, MatchBand.STRONG)


def test_student_only_conflict_flagged_for_graduate(base_profile):
    """Graduate candidate applying to student-only internship is flagged."""
    engine = MatchingEngine()
    result = engine.evaluate(
        job_title="Software Engineering Intern (Current Students Only)",
        job_description="Must be currently enrolled in an accredited university program.",
        job_skills=["JavaScript"],
        seniority=SeniorityLevel.INTERNSHIP,
        employment_type=EmploymentType.INTERNSHIP,
        eligibility=GeographicEligibility.EGYPT_ELIGIBLE,
        published_at=datetime.now(timezone.utc),
        required_experience_years=0.0,
        profile=base_profile,
    )

    assert result.is_student_conflict is True
    assert any("currently-enrolled students" in g for g in result.skill_gaps)


def test_ineligible_jobs_capped_below_digest_threshold(base_profile):
    """Jobs that are NOT_ELIGIBLE receive 0 for eligibility and are capped."""
    engine = MatchingEngine()
    result = engine.evaluate(
        job_title="Lead Angular Developer",
        job_description="US citizens located in California only.",
        job_skills=["Angular", "TypeScript"],
        seniority=SeniorityLevel.LEAD,
        employment_type=EmploymentType.FULL_TIME,
        eligibility=GeographicEligibility.NOT_ELIGIBLE,
        published_at=datetime.now(timezone.utc),
        required_experience_years=8.0,
        profile=base_profile,
    )

    assert result.breakdown.work_eligibility == 0.0
    assert result.score <= 40.0
    assert result.band == MatchBand.LOW


def test_java_and_javascript_are_not_conflated(base_profile):
    """Candidate with JavaScript must not match Java backend skills."""
    base_profile.confirmed_skills = ["JavaScript", "HTML5", "CSS3"]
    engine = MatchingEngine()
    result = engine.evaluate(
        job_title="Core Java Backend Engineer",
        job_description="Seeking experienced Java Spring Boot developer.",
        job_skills=["Java", "Spring Boot"],
        seniority=SeniorityLevel.MID,
        employment_type=EmploymentType.FULL_TIME,
        eligibility=GeographicEligibility.EGYPT_ELIGIBLE,
        published_at=datetime.now(timezone.utc),
        required_experience_years=2.0,
        profile=base_profile,
    )
    assert not any("Java" in r for r in result.reasons if "Confirmed skills matched" in r)
    assert result.breakdown.confirmed_skills == 3.0  # fallback minimal when no skills match


def test_no_exp_remote_track_scoring(base_profile):
    """Remote entry-level jobs (Data Entry / Call Center) achieve high score without code skills."""
    engine = MatchingEngine()
    result = engine.evaluate(
        job_title="Remote Data Entry Clerk",
        job_description="Enter customer records, verify data, communicate with team online.",
        job_skills=["Data Entry", "Excel", "English"],
        seniority=SeniorityLevel.ENTRY,
        employment_type=EmploymentType.FULL_TIME,
        eligibility=GeographicEligibility.REMOTE_WORLDWIDE,
        published_at=datetime.now(timezone.utc),
        required_experience_years=0.0,
        profile=base_profile,
    )

    assert result.breakdown.role_relevance == 20.0
    assert result.breakdown.experience_seniority == 20.0
    assert result.breakdown.confirmed_skills >= 20.0
    assert result.score >= 80.0
    assert result.band in (MatchBand.EXCELLENT, MatchBand.STRONG)


def test_software_and_ai_internship_scoring(base_profile):
    """Software & AI internships achieve high match score across the tech stack."""
    engine = MatchingEngine()
    result = engine.evaluate(
        job_title="AI & Machine Learning Research Intern",
        job_description="Python, PyTorch, and NLP models exploration.",
        job_skills=["Python", "Machine Learning"],
        seniority=SeniorityLevel.INTERNSHIP,
        employment_type=EmploymentType.INTERNSHIP,
        eligibility=GeographicEligibility.EGYPT_ELIGIBLE,
        published_at=datetime.now(timezone.utc),
        required_experience_years=0.0,
        profile=base_profile,
    )

    assert result.breakdown.role_relevance == 20.0
    assert result.breakdown.experience_seniority == 20.0
    assert result.score >= 75.0
    assert result.band in (MatchBand.EXCELLENT, MatchBand.STRONG)
