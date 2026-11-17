"""Unit tests for the 3 target job tracks classifier."""

import pytest
from src.engine.track_classifier import classify_job_track
from src.models.enums import EmploymentType, JobTrack, SeniorityLevel, WorkplaceType


def test_classify_track_1_web_angular():
    """Verify Track 1 (Web & Angular Frontend) classification."""
    # Explicit Angular in title
    track1 = classify_job_track(
        title="Angular Developer",
        description="Building enterprise web applications using Angular, TypeScript, and RxJS.",
    )
    assert track1 == JobTrack.WEB_ANGULAR

    # Frontend engineer
    track2 = classify_job_track(
        title="Senior Frontend Engineer",
        description="Modern web app development with TypeScript and component architecture.",
    )
    assert track2 == JobTrack.WEB_ANGULAR

    # Web developer with Angular in description
    track3 = classify_job_track(
        title="Web Developer",
        description="Our stack is Angular 17+, HTML5, CSS3, and REST APIs.",
    )
    assert track3 == JobTrack.WEB_ANGULAR


def test_classify_track_2_no_exp_remote():
    """Verify Track 2 (Remote No-Experience: Data Entry, Call Center, Customer Support) classification."""
    # Remote Data Entry Clerk
    track1 = classify_job_track(
        title="Remote Data Entry Clerk",
        description="Input customer records into spreadsheet. No prior experience required.",
        workplace_type=WorkplaceType.REMOTE,
        required_experience_years=0.0,
    )
    assert track1 == JobTrack.NO_EXP_REMOTE

    # Call Center Agent (Work from home)
    track2 = classify_job_track(
        title="Customer Support Representative - Work from Home",
        description="Handle customer inquiries via chat and phone. Entry-level, paid training provided.",
        workplace_type=WorkplaceType.REMOTE,
    )
    assert track2 == JobTrack.NO_EXP_REMOTE

    # Virtual Assistant
    track3 = classify_job_track(
        title="Virtual Assistant",
        description="Manage emails, schedule meetings, and perform data entry online.",
        remote_scope="Worldwide",
    )
    assert track3 == JobTrack.NO_EXP_REMOTE

    # Senior/Manager roles should NOT be classified as no-exp remote
    track_senior = classify_job_track(
        title="Customer Support Manager",
        description="Manage a team of 15 support agents.",
        workplace_type=WorkplaceType.REMOTE,
    )
    assert track_senior != JobTrack.NO_EXP_REMOTE


def test_classify_track_3_software_internships():
    """Verify Track 3 (Software & AI Internships across all disciplines) classification."""
    # AI / Machine Learning intern
    track_ai = classify_job_track(
        title="AI & Machine Learning Intern",
        description="Explore deep learning, LLMs, and Python data pipelines.",
        seniority=SeniorityLevel.INTERNSHIP,
    )
    assert track_ai == JobTrack.SOFTWARE_INTERN

    # Frontend web intern
    track_fe_intern = classify_job_track(
        title="Frontend Engineering Intern",
        description="Hands-on internship building web UIs with Angular and TypeScript.",
        employment_type=EmploymentType.INTERNSHIP,
    )
    assert track_fe_intern == JobTrack.SOFTWARE_INTERN

    # Backend intern
    track_be_intern = classify_job_track(
        title="Backend Software Developer Trainee",
        description="Learn Python, FastAPI, and PostgreSQL on real production microservices.",
    )
    assert track_be_intern == JobTrack.SOFTWARE_INTERN

    # General software engineer intern
    track_se_intern = classify_job_track(
        title="Software Engineering Intern - Summer 2026",
        description="Undergraduate or graduate co-op program across full-stack systems.",
    )
    assert track_se_intern == JobTrack.SOFTWARE_INTERN


def test_classify_other_unrelated_roles():
    """Verify roles outside the 3 tracks are classified as OTHER."""
    assert classify_job_track(title="Registered Nurse") == JobTrack.OTHER
    assert classify_job_track(title="Head Chef") == JobTrack.OTHER
    assert classify_job_track(title="Heavy Truck Driver") == JobTrack.OTHER
    assert classify_job_track(title="Senior Corporate Accountant") == JobTrack.OTHER
