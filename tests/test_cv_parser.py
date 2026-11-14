"""Tests for local CV parsing, validation, profile updates, and privacy protections."""

import io
from datetime import datetime, timezone
import pytest
from httpx import AsyncClient, ASGITransport

from src.api.main import app
from src.core.database import get_db_session
from src.core.security import sanitize_pii
from src.models.profile import CandidateProfile
from src.models.enums import EmploymentType, GeographicEligibility, SeniorityLevel
from src.services.cv_parser_service import CVParserService, ParsedCVResult
from src.engine.matching import MatchingEngine


SAMPLE_CV_TEXT = """
Abdelrahman Emam
Junior Frontend Developer | Angular Developer
Cairo, Egypt | +20 1122615864 | abdelrahmanacc84@gmail.com | https://www.linkedin.com/in/abd-el-rahman-emam

PROFESSIONAL SUMMARY
Junior Frontend Developer specializing in Angular and responsive web development.
Delivered 5+ projects across e-commerce, healthcare, and productivity domains.

TECHNICAL SKILLS
Frontend: HTML5, CSS3, JavaScript, TypeScript, Angular, RxJS, Angular Router, Reactive Forms
Styling: Bootstrap 5, Tailwind CSS
API: REST APIs, JSON, JWT Authentication, HttpClient, Firebase Firestore
Tools: Git, GitHub, Postman, Chrome DevTools

PROJECTS
FreshCart E-commerce | Angular, TypeScript, Bootstrap 5 | Route Academy Final Project
• Built a full-featured Angular SPA with product catalog, search, cart, and checkout flow.
• Integrated REST APIs for products and cart; implemented JWT authentication with route guards.

Doccure - Healthcare Platform | HTML5, CSS3, Bootstrap 5, jQuery | NTI Final Project
• Built a multi-page healthcare platform with Doctor Dashboard and Profile views.
• Implemented responsive layouts using Bootstrap 5 grid.

EXPERIENCE
Frontend Developer Trainee | Route Academy, Cairo, Egypt Mar 2025 – Jul 2026
• Delivered 4+ frontend projects including a full Angular e-commerce SPA.
• Built reusable Angular components and standardized layouts to reduce code duplication.

Frontend Web Developer | Elevvo Pathways, Cairo, Egypt Aug 2025 – Sep 2025
• Built responsive pages and UI components across mobile and desktop screens.

EDUCATION
B.Sc. Computer and Information Technology | Egyptian E-Learning University (EELU), Cairo, Egypt
Feb 2022 – Jul 2026 | Relevant Coursework: Web Development, Data Structures, Operating Systems

CERTIFICATIONS
• NTI Web Designer (Digital Egypt Youth) – Score: 100%
• ALX AiCE – AI Career Essentials

SOFT SKILLS
Problem Solving | Communication | Teamwork | Time Management | Fast Learning
"""


def test_cv_parser_plain_text_extraction():
    """Verify local parsing of structured CV from plain text without external AI calls."""
    result: ParsedCVResult = CVParserService.parse_cv(SAMPLE_CV_TEXT)

    assert result.personal_info.full_name == "Abdelrahman Emam"
    assert result.personal_info.email == "abdelrahmanacc84@gmail.com"
    assert result.personal_info.phone == "+20 1122615864"
    assert result.personal_info.location == "Cairo, Egypt"
    assert result.personal_info.linkedin_url == "https://www.linkedin.com/in/abd-el-rahman-emam"

    assert "Junior Frontend Developer" in (result.professional_summary or "")

    # Confirmed technical skills
    expected_skills = ["Angular", "TypeScript", "JavaScript", "RxJS", "HttpClient", "Bootstrap 5", "Tailwind CSS", "Git", "REST APIs"]
    for s in expected_skills:
        assert s in result.confirmed_skills, f"Expected {s} in confirmed_skills"

    # Learning / Coursework skills separation
    assert "Data Structures & Algorithms" in result.learning_or_exposure_skills
    assert "Operating Systems" in result.learning_or_exposure_skills

    # Projects
    assert len(result.projects) == 2
    assert result.projects[0].name == "FreshCart E-commerce"
    assert "Angular" in result.projects[0].technologies or "TypeScript" in result.projects[0].technologies

    # Experience
    assert len(result.experiences) == 2
    assert result.experiences[0].role == "Frontend Developer Trainee"
    assert "Route Academy" in result.experiences[0].company

    # Education
    assert len(result.educations) >= 1
    assert result.educations[0].institution == "Egyptian E-Learning University"
    assert result.educations[0].graduation_year == 2026

    # Certifications & Languages
    assert len(result.certifications) == 2
    assert any("NTI" in c.name for c in result.certifications)
    assert "Arabic (Native)" in result.languages
    assert "Problem Solving" in result.soft_skills
    assert result.requires_user_confirmation is True


def test_cv_parser_skill_separation_and_no_hallucination():
    """Verify confirmed skills, target skills, and exposure skills remain strictly separated."""
    sparse_cv = """
    Jane Doe
    Cairo, Egypt
    Summary: Enthusiastic learner interested in web development.
    Skills: HTML5, CSS3, JavaScript
    Education: Faculty of Engineering, Cairo University
    """
    result = CVParserService.parse_cv(sparse_cv)

    # Only skills explicitly verified in CV text are confirmed
    assert "HTML5" in result.confirmed_skills
    assert "CSS3" in result.confirmed_skills
    assert "JavaScript" in result.confirmed_skills
    assert "Angular" not in result.confirmed_skills  # NOT invented

    # Target skills remain baseline targets, not confirmed
    assert "Angular" in result.target_skills
    assert result.experience_years is None  # Never invented without dates or verified roles


def test_cv_parser_privacy_and_pii_redaction():
    """Verify that email, phone numbers, and addresses are redacted before any external payload."""
    raw_with_pii = "Contact me at user@example.com or phone +20 100 987 6543 at 123 Nile St, Giza."
    sanitized = sanitize_pii(raw_with_pii)

    assert "user@example.com" not in sanitized
    assert "[EMAIL_REDACTED]" in sanitized
    assert "+20 100 987 6543" not in sanitized
    assert "[PHONE_REDACTED]" in sanitized


def test_cv_parser_docx_support():
    """Verify DOCX document parsing using python-docx in memory."""
    import docx

    doc = docx.Document()
    doc.add_paragraph("Abdelrahman Emam")
    doc.add_paragraph("Cairo, Egypt | abdelrahman@example.com | +20 1122615864")
    doc.add_heading("TECHNICAL SKILLS", level=1)
    doc.add_paragraph("Angular, TypeScript, JavaScript, RxJS, Git")
    doc.add_heading("EDUCATION", level=1)
    doc.add_paragraph("Egyptian E-Learning University, Class of 2026")

    buf = io.BytesIO()
    doc.save(buf)
    docx_bytes = buf.getvalue()

    result = CVParserService.parse_cv_bytes(docx_bytes, "sample_resume.docx")
    assert result.personal_info.full_name == "Abdelrahman Emam"
    assert "Angular" in result.confirmed_skills
    assert "TypeScript" in result.confirmed_skills
    assert result.educations[0].institution == "Egyptian E-Learning University"


@pytest.mark.asyncio
async def test_cv_upload_and_review_api(db_session):
    """Test POST /api/v1/profile/cv/upload endpoint returning structured preview with confirmation flag."""
    app.dependency_overrides[get_db_session] = lambda: db_session

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # 1. Upload via form text
        resp = await ac.post(
            "/api/v1/profile/cv/upload",
            data={"cv_text": SAMPLE_CV_TEXT},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["personal_info"]["full_name"] == "Abdelrahman Emam"
        assert "Angular" in data["confirmed_skills"]
        assert data["requires_user_confirmation"] is True
        assert len(data["projects"]) == 2
        assert len(data["experiences"]) == 2

        # 2. Upload via multipart file
        file_bytes = SAMPLE_CV_TEXT.encode("utf-8")
        resp_file = await ac.post(
            "/api/v1/profile/cv/upload",
            files={"file": ("candidate_resume.txt", file_bytes, "text/plain")},
        )
        assert resp_file.status_code == 200
        data_file = resp_file.json()
        assert data_file["personal_info"]["full_name"] == "Abdelrahman Emam"
        assert "Angular" in data_file["confirmed_skills"]

    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_cv_confirm_and_profile_update(db_session):
    """Test POST /api/v1/profile/cv/confirm saves reviewed data into candidate profile."""
    app.dependency_overrides[get_db_session] = lambda: db_session

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # Confirm payload (simulating user review modal submission)
        confirm_payload = {
            "full_name": "Abdelrahman Emam",
            "professional_summary": "Junior Frontend Developer specializing in Angular and TypeScript.",
            "confirmed_skills": ["Angular", "TypeScript", "JavaScript", "RxJS", "Bootstrap 5"],
            "target_skills": ["Angular", "TypeScript", "JavaScript"],
            "learning_or_exposure_skills": ["Data Structures & Algorithms"],
            "experience_years": 1.0,
            "experiences": [
                {
                    "role": "Frontend Developer Trainee",
                    "company": "Route Academy",
                    "location": "Cairo, Egypt",
                    "start_date": "Mar 2025",
                    "end_date": "Jul 2026",
                    "bullets": ["Built responsive Angular SPAs"]
                }
            ],
            "educations": [
                {
                    "degree": "B.Sc. Computer and Information Technology",
                    "institution": "Egyptian E-Learning University",
                    "location": "Cairo, Egypt",
                    "graduation_year": 2026,
                    "coursework": ["Web Development", "Algorithms"]
                }
            ],
            "projects": [
                {
                    "name": "FreshCart E-commerce",
                    "technologies": ["Angular 17", "TypeScript", "Bootstrap 5"],
                    "bullets": ["Integrated REST APIs and route guards"]
                }
            ],
            "certifications": [
                {
                    "name": "NTI Web Designer",
                    "score": "100%"
                }
            ],
            "languages": ["Arabic (Native)", "English (Professional Working)"],
            "soft_skills": ["Problem Solving", "Teamwork"],
            "linkedin_url": "https://www.linkedin.com/in/abd-el-rahman-emam",
            "github_url": "https://github.com/abdelrahman-emam",
            "portfolio_url": "https://abdelrahman-emam.dev"
        }

        resp = await ac.post("/api/v1/profile/cv/confirm", json=confirm_payload)
        assert resp.status_code == 200
        saved = resp.json()

        assert saved["full_name"] == "Abdelrahman Emam"
        assert saved["confirmed_skills"] == ["Angular", "TypeScript", "JavaScript", "RxJS", "Bootstrap 5"]
        assert saved["experience_years"] == 1.0
        assert len(saved["projects"]) == 1
        assert saved["projects"][0]["name"] == "FreshCart E-commerce"
        assert len(saved["educations"]) == 1
        assert saved["educations"][0]["graduation_year"] == 2026
        assert saved["github_url"] == "https://github.com/abdelrahman-emam"

        # Verify reading profile returns the saved profile
        resp_get = await ac.get("/api/v1/profile")
        assert resp_get.status_code == 200
        profile_data = resp_get.json()
        assert profile_data["full_name"] == "Abdelrahman Emam"
        assert "Angular" in profile_data["confirmed_skills"]
        assert len(profile_data["experiences"]) == 1

    app.dependency_overrides.clear()


def test_matching_engine_boost_with_confirmed_skills():
    """Verify that confirming skills boosts match score by awarding full confirmed skill points."""
    engine = MatchingEngine()

    # Profile BEFORE CV upload (0 confirmed skills)
    empty_profile = CandidateProfile(
        country="EG",
        priority_target="Angular / Frontend",
        target_role_terms=["Angular Developer", "Frontend Developer"],
        target_technology_terms=["Angular", "TypeScript", "JavaScript"],
        confirmed_skills=[],  # None yet!
        target_skills=["Angular", "TypeScript", "JavaScript"],
        learning_or_exposure_skills=[],
        experience_years=None,
    )

    res_before = engine.evaluate(
        job_title="Junior Angular Frontend Developer",
        job_description="We are seeking an Angular Developer with experience in TypeScript, RxJS, and Bootstrap.",
        job_skills=["Angular", "TypeScript", "RxJS"],
        seniority=SeniorityLevel.JUNIOR,
        employment_type=EmploymentType.FULL_TIME,
        eligibility=GeographicEligibility.EGYPT_ELIGIBLE,
        published_at=datetime.now(timezone.utc),
        required_experience_years=1.0,
        profile=empty_profile,
    )
    assert res_before.breakdown.confirmed_skills == 0.0
    assert res_before.score < 75.0

    # Profile AFTER CV upload and confirmation
    confirmed_profile = CandidateProfile(
        country="EG",
        priority_target="Angular / Frontend",
        target_role_terms=["Angular Developer", "Frontend Developer"],
        target_technology_terms=["Angular", "TypeScript", "JavaScript"],
        confirmed_skills=["Angular", "TypeScript", "JavaScript", "RxJS", "Bootstrap 5"],
        target_skills=["Angular", "TypeScript", "JavaScript"],
        learning_or_exposure_skills=["Data Structures & Algorithms"],
        experience_years=1.0,
    )

    res_after = engine.evaluate(
        job_title="Junior Angular Frontend Developer",
        job_description="We are seeking an Angular Developer with experience in TypeScript, RxJS, and Bootstrap.",
        job_skills=["Angular", "TypeScript", "RxJS"],
        seniority=SeniorityLevel.JUNIOR,
        employment_type=EmploymentType.FULL_TIME,
        eligibility=GeographicEligibility.EGYPT_ELIGIBLE,
        published_at=datetime.now(timezone.utc),
        required_experience_years=1.0,
        profile=confirmed_profile,
    )
    assert res_after.breakdown.confirmed_skills == 25.0  # Max confirmed skill score!
    assert res_after.score >= 85.0                      # High-priority match!
    assert res_after.score > res_before.score
