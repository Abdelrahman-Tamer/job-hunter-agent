"""Unit tests for Frontend Opportunity Radar track classification."""

import pytest
from src.engine.track_classifier import classify_job_track
from src.models.enums import EmploymentType, JobTrack, SeniorityLevel, WorkplaceType


def test_classify_track_1_web_angular():
    """Verify Web & Angular Frontend classification."""
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


def test_classify_frontend_regional_tracks():
    """Verify Egypt vs GCC Remote Frontend track segmentation and non-remote abroad rejection."""
    # Egypt Frontend
    track_eg = classify_job_track(
        title="Frontend Developer",
        description="Developing client web interfaces in Angular.",
        raw_location="Cairo, Egypt",
        workplace_type=WorkplaceType.HYBRID,
    )
    assert track_eg == JobTrack.FRONTEND_EGYPT

    # Arabic Egypt Frontend
    track_eg_ar = classify_job_track(
        title="مطور واجهات أمامية",
        description="تطوير واجهات المستخدم باستخدام أنجلر.",
        raw_location="القاهرة, مصر",
        workplace_type=WorkplaceType.ON_SITE,
    )
    assert track_eg_ar == JobTrack.FRONTEND_EGYPT

    # Remote GCC Frontend
    track_gcc = classify_job_track(
        title="Senior React Developer",
        description="Remote web platform development.",
        raw_location="Riyadh, Saudi Arabia",
        workplace_type=WorkplaceType.REMOTE,
    )
    assert track_gcc == JobTrack.FRONTEND_REMOTE_GCC

    # Arabic Remote GCC Frontend
    track_gcc_ar = classify_job_track(
        title="مهندس فرونت اند",
        description="تطوير تطبيقات الويب عن بعد.",
        raw_location="الرياض, السعودية",
        workplace_type=WorkplaceType.REMOTE,
    )
    assert track_gcc_ar == JobTrack.FRONTEND_REMOTE_GCC

    # Non-remote roles outside Egypt must be strictly rejected as OTHER
    assert classify_job_track(
        title="Frontend Developer",
        description="Developing client web interfaces.",
        raw_location="Riyadh, Saudi Arabia",
        workplace_type=WorkplaceType.ON_SITE,
    ) == JobTrack.OTHER

    assert classify_job_track(
        title="Senior Frontend Engineer",
        description="Modern web app development.",
        raw_location="Dubai, UAE",
        workplace_type=WorkplaceType.HYBRID,
    ) == JobTrack.OTHER

    assert classify_job_track(
        title="Frontend Developer",
        description="Client web engineering.",
        raw_location="Berlin, Germany",
        workplace_type=WorkplaceType.ON_SITE,
    ) == JobTrack.OTHER


def test_classify_frontend_internships():
    """Verify Frontend internships are accepted while non-frontend internships are rejected."""
    # Frontend intern is accepted
    track_fe_intern = classify_job_track(
        title="Frontend Engineering Intern",
        description="Hands-on internship building web UIs with Angular and TypeScript.",
        employment_type=EmploymentType.INTERNSHIP,
    )
    assert track_fe_intern == JobTrack.FRONTEND_INTERN

    # Non-frontend internships must be strictly rejected (classified as OTHER)
    assert classify_job_track(
        title="AI & Machine Learning Intern",
        description="Explore deep learning, LLMs, and Python data pipelines.",
        seniority=SeniorityLevel.INTERNSHIP,
    ) == JobTrack.OTHER

    assert classify_job_track(
        title="Backend Software Developer Trainee",
        description="Learn Python, FastAPI, and PostgreSQL on real production microservices.",
    ) == JobTrack.OTHER


def test_classify_rejection_of_non_frontend_and_operations():
    """Verify non-frontend domains (Data Entry, Call Center, DevOps, QA) are rejected as OTHER."""
    assert classify_job_track(
        title="Remote Data Entry Clerk",
        description="Input customer records into spreadsheet.",
        workplace_type=WorkplaceType.REMOTE,
    ) == JobTrack.OTHER

    assert classify_job_track(
        title="Customer Support Representative - Work from Home",
        description="Handle customer inquiries via chat and phone.",
        workplace_type=WorkplaceType.REMOTE,
    ) == JobTrack.OTHER

    assert classify_job_track(
        title="DevOps Engineer",
        description="Kubernetes, Terraform, and CI/CD pipelines.",
    ) == JobTrack.OTHER

    assert classify_job_track(
        title="QA Automation Tester",
        description="Selenium and Cypress test automation.",
    ) == JobTrack.OTHER

    assert classify_job_track(title="Registered Nurse") == JobTrack.OTHER
    assert classify_job_track(title="Head Chef") == JobTrack.OTHER
