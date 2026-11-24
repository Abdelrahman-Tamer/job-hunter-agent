"""Comprehensive unit tests for the specialized Frontend Engineering Opportunity Radar.

Validates:
1. Strict Frontend-Only Filtering (Accepts genuine frontend, rejects backend, mobile,
   devops, QA, data/AI, UI/UX design only, and balanced full-stack).
2. Regional & Work-Mode Taxonomy (Egypt On-site/Hybrid/Remote vs GCC/Abroad Remote-only vs non-remote rejection).
3. Social Hiring Intent Filter (Accepts authentic recruiter posts, strictly rejects #OpenToWork and job seekers).
4. LinkedIn Social Post Adapter normalization and resilient error handling.
5. Deduplication across job boards and social posts.
6. Job card presentation and UX metadata.
"""

from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import select

from src.bot.formatters import format_job_card
from src.engine.deduplication import DeduplicationEngine, compute_url_hash
from src.engine.eligibility import GeographicEligibilityEngine
from src.engine.frontend_filter import (
    is_frontend_opportunity,
    is_hiring_intent_social_post,
)
from src.engine.gemini_extractor import ExtractedJobAttributes
from src.engine.track_classifier import classify_job_track
from src.models import CandidateProfile, Job, Source
from src.models.enums import (
    EmploymentType,
    GeographicEligibility,
    JobTrack,
    OpportunitySegment,
    RunStatus,
    SeniorityLevel,
    WorkplaceType,
)
from src.scheduler.runner import DailyPipelineRunner
from src.sources.base import (
    BaseSourceAdapter,
    NormalizedJobData,
    RawJobData,
    SourceMetadata,
)
from src.sources.egypt_community import EgyptCommunityAdapter
from src.sources.linkedin_posts import LinkedInSocialAdapter
from src.sources.registry import SourceRegistry
from src.sources.workable import WorkableAdapter

# ===========================================================================
# 1. Strict Frontend-Only Filtering Tests
# ===========================================================================

def test_frontend_filter_accepts_genuine_frontend_roles():
    """Verify acceptance of diverse genuine Frontend roles (English + Arabic)."""
    valid_titles = [
        "Frontend Engineer",
        "Senior Front-End Developer",
        "Angular Developer",
        "React / Next.js Engineer",
        "Vue.js Frontend Specialist",
        "Nuxt Developer",
        "TypeScript Web Developer",
        "UI Engineer",
        "UI / Web Developer",
        "Web Frontend Developer",
        "Frontend Engineering Intern",
        "مطور فرونت اند",
        "مهندس واجهات أمامية",
        "مطور واجهات المستخدم",
        "متدرب فرونت اند",
    ]
    for title in valid_titles:
        is_fe, reason = is_frontend_opportunity(title=title)
        assert is_fe is True, f"Expected '{title}' to pass frontend filter, but failed: {reason}"


def test_frontend_filter_rejects_non_frontend_roles():
    """Verify rejection of pure backend, mobile, devops, QA, data/AI, design, and operations."""
    invalid_roles = [
        ("Backend Engineer", "Node.js and PostgreSQL API development"),
        ("Python / Django Developer", "REST API architecture with Celery"),
        ("Java Spring Boot Developer", "Enterprise backend microservices"),
        ("Golang Backend Specialist", "Distributed systems and gRPC"),
        (".NET Core Developer", "C# backend microservices"),
        ("Flutter Developer", "Cross-platform mobile application development"),
        ("Flutter Engineer", "Cross-platform mobile architecture with Flutter"),
        ("iOS Engineer", "Swift and UIKit mobile app architecture"),
        ("Android Developer", "Kotlin mobile development for Android"),
        ("Mobile Engineer", "Native mobile platform architecture"),
        ("DevOps Engineer", "Kubernetes, Terraform, and AWS CI/CD"),
        ("Cloud Infrastructure Architect", "Terraform, Azure, AWS, and GCP"),
        ("QA Automation Engineer", "Selenium, Cypress, and end-to-end testing"),
        ("Software Test Engineer", "Writing manual test cases and defect tracking"),
        ("Data Scientist", "Python, Pandas, Scikit-Learn, and predictive modeling"),
        ("Machine Learning Engineer", "Training PyTorch deep learning models"),
        ("Data Analyst", "SQL queries, Power BI dashboards, and reporting"),
        ("UI/UX Designer", "Figma wireframes, user personas, and visual design"),
        ("UI Designer", "Figma interface layouts and component design"),
        ("Product Designer", "User research and prototyping in Figma"),
        ("Remote Data Entry Clerk", "Input customer records into spreadsheet"),
        ("Customer Support Representative", "Handle inbound customer support tickets"),
        ("Call Center Agent", "Outbound calling and customer service"),
        ("Virtual Assistant", "Email management and administrative tasks"),
        ("Technical Recruiter", "Sourcing candidates on LinkedIn"),
        ("Corporate Accountant", "Financial reporting and bookkeeping"),
    ]
    for title, desc in invalid_roles:
        is_fe, reason = is_frontend_opportunity(title=title, description=desc)
        assert is_fe is False, f"Expected '{title}' to be rejected, but passed: {reason}"


def test_mobile_and_backend_engineers_with_frontend_in_description_rejected():
    """Verify that mobile and backend engineers are rejected even if their description mentions frontend frameworks."""
    deceptive_roles = [
        ("Flutter Engineer", "Develop mobile apps. Collaborate with our web frontend team using React and TypeScript."),
        ("Mobile Software Engineer", "Build native iOS and Android apps that connect to web views (Angular / Vue)."),
        ("iOS Engineer", "Swift developer; experience with frontend REST APIs and TypeScript is a plus."),
        ("Android Developer", "Kotlin mobile app development; will integrate with frontend web dashboards."),
        ("Python Engineer", "Django REST API backend microservices powering an Angular client application."),
        ("Java Software Engineer", "Enterprise Spring Boot services; collaborate with Angular and React frontend developers."),
        ("Golang Software Engineer", "Build high-throughput gRPC backends with some frontend React administration portals."),
        ("UI Designer", "Design Figma prototypes and collaborate with frontend engineers on design system components."),
    ]
    for title, desc in deceptive_roles:
        is_fe, reason = is_frontend_opportunity(title=title, description=desc)
        assert is_fe is False, f"Expected '{title}' with frontend in description to be rejected, but passed: {reason}"


def test_primary_reject_title_overrides_frontend_mention_in_title():
    """Verify title precedence: primary reject domain rejects; primary frontend domain accepts."""
    # Reject: primary title is mobile or backend
    assert is_frontend_opportunity("Flutter Developer (Frontend Web experience a plus)")[0] is False
    assert is_frontend_opportunity("Backend Engineer - React Web APIs")[0] is False
    assert is_frontend_opportunity("Mobile Engineer with Angular skills")[0] is False
    assert is_frontend_opportunity(".NET Developer (Angular a plus)")[0] is False
    assert is_frontend_opportunity("C# Developer (Angular a plus)")[0] is False

    # Accept: primary title is frontend
    assert is_frontend_opportunity("Frontend Engineer (Node.js backend experience a plus)")[0] is True
    assert is_frontend_opportunity("Senior Frontend Developer (Flutter knowledge helpful)")[0] is True
    assert is_frontend_opportunity("Frontend Engineer (.NET backend experience a plus)")[0] is True


def test_dotnet_and_csharp_boundary_handling_and_fullstack_evaluation():
    """Verify .NET Developer with secondary Angular is rejected as primary backend,
    and that full-stack roles count .NET and C# correctly in description analysis."""
    # 1. Primary backend role starting with .NET or C#
    is_fe_dotnet, reason_dotnet = is_frontend_opportunity(".NET Developer (Angular a plus)")
    assert is_fe_dotnet is False
    assert "Non-frontend domain detected" in reason_dotnet

    is_fe_csharp, reason_csharp = is_frontend_opportunity("C# Software Engineer (React experience helpful)")
    assert is_fe_csharp is False
    assert "Non-frontend domain detected" in reason_csharp

    # 2. Full-stack role where description mentions C# and .NET
    # Explicitly verifies standalone .net and c# in description are parsed and counted
    desc_backend_heavy = (
        "Full Stack Developer responsible for enterprise architectures. "
        "Extensive experience with C# and .NET 8 microservices, SQL database schemas, "
        "and advanced backend design patterns using .NET Core and C#. "
        "Occasional frontend dashboard maintenance using Angular and React."
    )
    is_fe_fs, reason_fs = is_frontend_opportunity(
        title="Full Stack Developer",
        description=desc_backend_heavy,
        skills=["C#", ".NET", "Angular"],
    )
    assert is_fe_fs is False
    assert "Full-stack role rejected" in reason_fs


def test_fullstack_filter_deterministic_rule():
    """Verify full-stack roles are rejected unless clearly frontend-heavy."""
    # Balanced or backend-heavy fullstack -> REJECT
    is_fe, _ = is_frontend_opportunity(
        title="Full Stack Developer",
        description="Node.js, Express, PostgreSQL, Redis, Docker, with some HTML/CSS.",
        skills=["Node.js", "PostgreSQL", "Docker"],
    )
    assert is_fe is False, "Balanced fullstack should be rejected"

    # Explicit frontend focus in title -> ACCEPT
    is_fe2, _ = is_frontend_opportunity(
        title="Full Stack Engineer (Frontend Focus)",
        description="Modern client-side development in Angular with Node BFF integration.",
        skills=["Angular", "TypeScript", "Node.js"],
    )
    assert is_fe2 is True, "Frontend-focused fullstack title should be accepted"

    # Frontend-heavy skills and description -> ACCEPT
    is_fe3, _ = is_frontend_opportunity(
        title="Full Stack Web Developer",
        description="Building interactive Angular and React frontends, Tailwind styling, and consuming microservices.",
        skills=["Angular", "React", "TypeScript", "Tailwind CSS"],
    )
    assert is_fe3 is True, "Frontend-heavy skills fullstack should be accepted"


def test_internship_filtering_frontend_vs_non_frontend():
    """Verify only Frontend internships are accepted."""
    assert is_frontend_opportunity("Frontend Intern")[0] is True
    assert is_frontend_opportunity("Web Development Trainee - Frontend")[0] is True
    assert is_frontend_opportunity("Angular Trainee")[0] is True
    assert is_frontend_opportunity("تدريب مطور فرونت اند")[0] is True

    # Non-frontend internships rejected
    assert is_frontend_opportunity("AI & Machine Learning Intern")[0] is False
    assert is_frontend_opportunity("Backend Software Developer Intern")[0] is False
    assert is_frontend_opportunity("Mobile Development Intern (Flutter)")[0] is False
    assert is_frontend_opportunity("DevOps Intern")[0] is False


# ===========================================================================
# 2. Regional & Work-Mode Taxonomy Tests
# ===========================================================================

def test_egypt_bucket_taxonomy():
    """Verify Egypt bucket accepts Cairo, Giza, Alexandria, and remote Egypt across On-site, Hybrid, Remote."""
    engine = GeographicEligibilityEngine(candidate_country="EG")

    egypt_test_cases = [
        ("Cairo, Egypt", WorkplaceType.ON_SITE),
        ("Giza, Egypt", WorkplaceType.HYBRID),
        ("Smart Village, 6th of October", WorkplaceType.ON_SITE),
        ("Maadi, Cairo", WorkplaceType.HYBRID),
        ("Nasr City, Cairo, Egypt", WorkplaceType.ON_SITE),
        ("Alexandria, Egypt", WorkplaceType.HYBRID),
        ("Remote - Egypt", WorkplaceType.REMOTE),
        ("القاهرة, مصر", WorkplaceType.ON_SITE),
        ("القرية الذكية, الجيزة", WorkplaceType.HYBRID),
    ]
    for loc, wp in egypt_test_cases:
        status, _ = engine.classify(raw_location=loc, workplace_type=wp)
        assert status == GeographicEligibility.EGYPT_ELIGIBLE, f"Eligibility failed for {loc} ({wp})"

        seg = engine.classify_segment(raw_location=loc, workplace_type=wp, eligibility=status)
        assert seg == OpportunitySegment.EGYPT, f"Segment failed for {loc} ({wp})"


def test_remote_abroad_gcc_bucket_taxonomy():
    """Verify GCC and Abroad bucket accepts Remote roles and strictly excludes on-site/hybrid."""
    engine = GeographicEligibilityEngine(candidate_country="EG")

    # Positive remote GCC / international cases (English + Arabic)
    remote_cases = [
        ("Remote - Riyadh, Saudi Arabia", WorkplaceType.REMOTE, "Saudi Arabia / GCC"),
        ("Dubai, UAE", WorkplaceType.REMOTE, "UAE"),
        ("Doha, Qatar", WorkplaceType.REMOTE, "Qatar"),
        ("Kuwait City, Kuwait", WorkplaceType.REMOTE, "Kuwait"),
        ("Manama, Bahrain", WorkplaceType.REMOTE, "Bahrain"),
        ("Muscat, Oman", WorkplaceType.REMOTE, "Oman"),
        ("Worldwide", WorkplaceType.REMOTE, "Worldwide"),
        ("Home based - EMEA", WorkplaceType.REMOTE, "EMEA"),
        ("الرياض, السعودية", WorkplaceType.REMOTE, None),
        ("دبي, الإمارات", WorkplaceType.REMOTE, None),
        ("الدوحة, قطر", WorkplaceType.REMOTE, None),
        ("مدينة الكويت, الكويت", WorkplaceType.REMOTE, None),
        ("المنامة, البحرين", WorkplaceType.REMOTE, None),
        ("مسقط, سلطنة عمان", WorkplaceType.REMOTE, None),
        ("نيوم, المملكة العربية السعودية", WorkplaceType.REMOTE, None),
    ]
    for loc, wp, scope in remote_cases:
        status, _ = engine.classify(raw_location=loc, workplace_type=wp, remote_scope=scope)
        assert status in (
            GeographicEligibility.EGYPT_ELIGIBLE,
            GeographicEligibility.REMOTE_WORLDWIDE,
            GeographicEligibility.REMOTE_REGION_POSSIBLE,
        ), f"Unexpected status {status} for remote {loc}"

        seg = engine.classify_segment(raw_location=loc, workplace_type=wp, remote_scope=scope, eligibility=status)
        assert seg == OpportunitySegment.REMOTE_GCC_ABROAD, f"Expected REMOTE_GCC_ABROAD for {loc}"

    # Negative non-remote roles outside Egypt MUST BE REJECTED
    onsite_abroad_cases = [
        ("Riyadh, Saudi Arabia", WorkplaceType.ON_SITE),
        ("Dubai, UAE", WorkplaceType.HYBRID),
        ("Doha, Qatar", WorkplaceType.ON_SITE),
        ("Berlin, Germany", WorkplaceType.ON_SITE),
        ("London, UK", WorkplaceType.HYBRID),
        ("New York, USA", WorkplaceType.ON_SITE),
    ]
    for loc, wp in onsite_abroad_cases:
        status, _ = engine.classify(raw_location=loc, workplace_type=wp)
        assert status == GeographicEligibility.NOT_ELIGIBLE, f"Expected NOT_ELIGIBLE for non-remote abroad {loc}"

        seg = engine.classify_segment(raw_location=loc, workplace_type=wp, eligibility=status)
        assert seg == OpportunitySegment.OTHER, f"Expected OTHER for non-remote abroad {loc}"


def test_ambiguous_locations_handled_deterministically():
    """Verify ambiguous or unknown locations are not silently misclassified as Remote Abroad."""
    engine = GeographicEligibilityEngine(candidate_country="EG")

    # Plain remote without scope
    status, _ = engine.classify(raw_location="Remote", workplace_type=WorkplaceType.REMOTE)
    assert status == GeographicEligibility.UNKNOWN
    seg = engine.classify_segment(raw_location="Remote", workplace_type=WorkplaceType.REMOTE, eligibility=status)
    assert seg == OpportunitySegment.OTHER, "Ambiguous remote without scope should not be Remote Abroad"


def test_onsite_outside_egypt_strictly_rejected_in_track_classifier():
    """Verify track classifier rejects non-remote roles outside Egypt as JobTrack.OTHER."""
    # Riyadh on-site
    assert classify_job_track(
        title="Frontend Developer",
        description="Developing Angular web components.",
        raw_location="Riyadh, Saudi Arabia",
        workplace_type=WorkplaceType.ON_SITE,
    ) == JobTrack.OTHER

    # Dubai hybrid
    assert classify_job_track(
        title="Senior React Developer",
        description="Modern web app development.",
        raw_location="Dubai, UAE",
        workplace_type=WorkplaceType.HYBRID,
    ) == JobTrack.OTHER

    # London on-site
    assert classify_job_track(
        title="Vue.js Developer",
        description="Vue 3 and TypeScript.",
        raw_location="London, UK",
        workplace_type=WorkplaceType.ON_SITE,
    ) == JobTrack.OTHER

    # Positive: Cairo on-site -> FRONTEND_EGYPT
    assert classify_job_track(
        title="Frontend Developer",
        description="Developing Angular web components.",
        raw_location="Cairo, Egypt",
        workplace_type=WorkplaceType.ON_SITE,
    ) == JobTrack.FRONTEND_EGYPT

    # Positive: Riyadh remote -> FRONTEND_REMOTE_GCC
    assert classify_job_track(
        title="Frontend Developer",
        description="Developing Angular web components.",
        raw_location="Riyadh, Saudi Arabia",
        workplace_type=WorkplaceType.REMOTE,
    ) == JobTrack.FRONTEND_REMOTE_GCC


# ===========================================================================
# 3. Social Hiring Intent vs Job-Seeker Filter Tests
# ===========================================================================

def test_social_hiring_intent_accepts_authentic_recruiting_posts():
    """Verify genuine hiring posts (English + Arabic) are accepted."""
    authentic_posts = [
        "We are hiring a Senior Frontend Developer (Angular 18) to join our fintech engineering team in Cairo! Send CV to jobs@fintech.eg",
        "Our team is expanding! We're looking for a React / Next.js Engineer (Remote). Apply at https://careers.company.com/fe",
        "Hiring alert 🚨 Paymob is looking for a Frontend Engineering Intern for Summer 2026. Drop your resume at tech@paymob.com",
        "Urgent hiring for a Vue.js Developer in Riyadh (Remote open to Egypt candidates). DM me your CV.",
        "مطلوب للتعيين فوراً في القاهرة: مطور فرونت اند Angular خبرة سنتين. برجاء ارسال السيرة الذاتية على careers@tech.com",
        "فرصة عمل ممتازة: بنبحث عن مهندس واجهات أمامية React للعمل ريموت في شركة سعودية. ارسل السي في في رسالة خاصة.",
    ]
    for post in authentic_posts:
        is_hiring, reason = is_hiring_intent_social_post(post)
        assert is_hiring is True, f"Expected authentic post to pass, but failed: {reason}\nPost: {post}"


def test_social_hiring_intent_rejects_job_seekers():
    """Verify job-seeker posts (#OpenToWork, self-promotion, seeking jobs) are strictly rejected."""
    job_seeker_posts = [
        "I'm excited to share that I'm #OpenToWork! Looking for a Frontend Developer role in Cairo or Remote. Here is my resume.",
        "I am looking for a frontend developer internship. Graduated from Computer Science in 2025. Please check out my portfolio!",
        "Seeking new opportunity as an Angular Developer. 1 year experience, available for immediate start. Hire me!",
        "Any frontend openings for fresh graduates? Can anyone refer me?",
        "Check out my new portfolio project built with React and Tailwind! Looking for entry-level frontend positions #jobhunt",
        "أنا مطور فرونت إند وابحث عن فرصة عمل أو تدريب في القاهرة. متاح للعمل فوراً.",
        "خريج جديد ابحث عن وظيفة فرونت اند. برجاء المساعدة في فرصة عمل #opentowork",
        "Angular Developer #OpenToWork — DM me",
    ]
    for post in job_seeker_posts:
        is_hiring, reason = is_hiring_intent_social_post(post)
        assert is_hiring is False, f"Expected job-seeker post to be rejected, but passed: {reason}\nPost: {post}"


def test_opentowork_boundary_rejects_job_seeker_post_with_dm():
    """Verify that #OpenToWork is rejected at boundaries despite containing recruiter phrases like 'DM me'."""
    expected_disqualification = "Disqualified: Post identified as job-seeker, self-promotion, or #OpenToWork."

    # 1. Mid-string hashtag with 'DM me'
    post_mid = "Angular Developer #OpenToWork — DM me"
    is_hiring_mid, reason_mid = is_hiring_intent_social_post(post_mid)
    assert is_hiring_mid is False
    assert reason_mid == expected_disqualification

    # 2. Start-of-string hashtag with 'DM me'
    post_start = "#OpenToWork Angular Developer — DM me"
    is_hiring_start, reason_start = is_hiring_intent_social_post(post_start)
    assert is_hiring_start is False
    assert reason_start == expected_disqualification

    # 3. Genuine recruiting post with 'DM me' to confirm no false rejection
    post_genuine = "We are hiring an Angular Developer in Cairo. DM me if interested!"
    is_hiring_genuine, reason_genuine = is_hiring_intent_social_post(post_genuine)
    assert is_hiring_genuine is True
    assert reason_genuine in (
        "Authentic hiring / recruiter intent detected.",
        "Hiring context detected via role title and contact/apply channel.",
    )


# ===========================================================================
# 4. LinkedIn Social Post Adapter Tests
# ===========================================================================

def test_linkedin_social_adapter_normalize():
    """Verify LinkedIn adapter normalizes social post payloads into standard NormalizedJobData."""
    adapter = LinkedInSocialAdapter()
    raw = RawJobData(
        source_name="linkedin_social",
        source_job_id="activity-7241892019201",
        source_url="https://www.linkedin.com/posts/sarah-recruiter_hiring-frontend-angular-activity-7241892019201?utm_source=share",
        payload={
            "title": "Sarah Connor on LinkedIn: 'We are hiring an Angular Developer at TechCorp...'",
            "snippet": "We are hiring an Angular Developer at TechCorp in Cairo, Egypt! Experience with TypeScript and RxJS required. Send CV to jobs@techcorp.com",
            "link": "https://www.linkedin.com/posts/sarah-recruiter_hiring-frontend-angular-activity-7241892019201?utm_source=share",
        },
    )

    norm = adapter.normalize(raw)

    assert norm.source_name == "linkedin_social"
    assert norm.is_social_post is True
    assert "Angular" in norm.title
    assert norm.company == "Sarah Connor" or "TechCorp" in norm.company
    assert norm.raw_location == "Cairo, Egypt"
    assert "Angular" in norm.required_skills
    assert "TypeScript" in norm.required_skills
    assert norm.raw_payload["source_category"] == "SOCIAL_POST"


# ===========================================================================
# 5. Deduplication and URL Normalization Tests
# ===========================================================================

@pytest.mark.asyncio
async def test_deduplication_between_job_board_and_social_post(db_session):
    """Verify duplicate opportunities (same canonical destination URL or matching company+role) are caught."""
    # 1. Insert an existing job from a traditional job board
    source_board = Source(
        name="workable_vodafone",
        source_type="workable",
        base_url="https://apply.workable.com/vodafone",
        doc_url="https://workable.com",
        is_enabled=True,
        attribution_text="Workable",
    )
    db_session.add(source_board)
    await db_session.commit()
    await db_session.refresh(source_board)

    board_url = "https://careers.vodafone.com/job/frontend-developer-123"
    job_board = Job(
        source_id=source_board.id,
        source_name="workable_vodafone",
        source_job_id="vodafone-123",
        source_url=board_url,
        canonical_url_hash=compute_url_hash(board_url),
        original_application_url=board_url,
        company="Vodafone",
        title="Frontend Developer",
        description_text="Angular and TypeScript web development in Cairo.",
        raw_location="Cairo, Egypt",
        workplace_type=WorkplaceType.HYBRID,
        eligibility=GeographicEligibility.EGYPT_ELIGIBLE,
        seniority=SeniorityLevel.MID,
        match_score=85.0,
    )
    db_session.add(job_board)
    await db_session.commit()
    await db_session.refresh(job_board)

    adapter = LinkedInSocialAdapter()

    # Case A: Social post with the same destination application URL
    raw_same_url = RawJobData(
        source_name="linkedin_social",
        source_job_id="post-url-dup-1",
        source_url="https://www.linkedin.com/posts/recruiter_job-1?utm_campaign=feed",
        payload={
            "title": "Hiring at Vodafone",
            "snippet": "Apply directly at our careers portal: https://careers.vodafone.com/job/frontend-developer-123",
            "link": "https://www.linkedin.com/posts/recruiter_job-1?utm_campaign=feed",
        },
    )
    norm_same_url = adapter.normalize(raw_same_url)
    norm_same_url.original_application_url = "https://careers.vodafone.com/job/frontend-developer-123?utm_source=linkedin&utm_campaign=hiring"

    existing_url, reason_url = await DeduplicationEngine.find_existing_job(db_session, norm_same_url)
    assert existing_url is not None, "Expected duplicate by canonical application URL"
    assert existing_url.id == job_board.id
    assert reason_url == "CANONICAL_URL_MATCH"

    # Case B: Social post with different URL but same company + normalized title + location
    raw_fuzzy = RawJobData(
        source_name="linkedin_social",
        source_job_id="post-fuzzy-dup-2",
        source_url="https://www.linkedin.com/posts/recruiter_job-2",
        payload={
            "title": "Ahmed on LinkedIn: Hiring at Vodafone",
            "snippet": "We are hiring a Frontend Developer at Vodafone in Cairo, Egypt! Send CV to jobs@vodafone.com",
            "link": "https://www.linkedin.com/posts/recruiter_job-2",
        },
    )
    norm_fuzzy = adapter.normalize(raw_fuzzy)
    norm_fuzzy.company = "Vodafone"
    norm_fuzzy.title = "Frontend Developer"
    norm_fuzzy.raw_location = "Cairo, Egypt"

    existing_fuzzy, reason_fuzzy = await DeduplicationEngine.find_existing_job(db_session, norm_fuzzy)
    assert existing_fuzzy is not None, "Expected duplicate by fuzzy company+title+location match"
    assert existing_fuzzy.id == job_board.id
    assert reason_fuzzy == "FUZZY_COMPANY_TITLE_LOCATION_MATCH"


def test_social_post_freshness_extraction_and_stale_rejection():
    """Verify social post adapter extracts publication timestamp from snippet and identifies stale posts."""
    adapter = LinkedInSocialAdapter()
    from datetime import datetime

    # 1. Fresh post (2 days ago)
    raw_fresh = RawJobData(
        source_name="linkedin_social",
        source_job_id="fresh-post-1",
        source_url="https://www.linkedin.com/posts/fresh-1",
        payload={
            "title": "Hiring React Engineer",
            "snippet": "2 days ago — We are looking for a React developer in Cairo.",
            "link": "https://www.linkedin.com/posts/fresh-1",
        },
    )
    norm_fresh = adapter.normalize(raw_fresh)
    assert norm_fresh.published_at is not None
    age_fresh = (datetime.now(UTC) - norm_fresh.published_at).days
    assert 1 <= age_fresh <= 3

    # 2. Stale post (3 months ago) -> Should be ~90 days old (> 30 days MAX_JOB_AGE_DAYS)
    raw_stale = RawJobData(
        source_name="linkedin_social",
        source_job_id="stale-post-2",
        source_url="https://www.linkedin.com/posts/stale-2",
        payload={
            "title": "Hiring Angular Engineer",
            "snippet": "3 months ago — Join our frontend engineering team.",
            "link": "https://www.linkedin.com/posts/stale-2",
        },
    )
    norm_stale = adapter.normalize(raw_stale)
    assert norm_stale.published_at is not None
    age_stale = (datetime.now(UTC) - norm_stale.published_at).days
    assert age_stale >= 80

    # 3. Arabic relative post (منذ أسبوع)
    raw_ar = RawJobData(
        source_name="linkedin_social",
        source_job_id="ar-post-3",
        source_url="https://www.linkedin.com/posts/ar-3",
        payload={
            "title": "مطلوب فرونت اند",
            "snippet": "منذ أسبوع — مطلوب مهندس واجهات أمامية للعمل في الرياض.",
            "link": "https://www.linkedin.com/posts/ar-3",
        },
    )
    norm_ar = adapter.normalize(raw_ar)
    assert norm_ar.published_at is not None
    age_ar = (datetime.now(UTC) - norm_ar.published_at).days
    assert 6 <= age_ar <= 8


# ===========================================================================
# 6. User-Facing Job Card Presentation Tests
# ===========================================================================

def test_format_job_card_social_post_vs_job_board():
    """Verify job card formatting displays proper source type, segment badge, and poster attribution."""
    # 1. Social Post in Egypt
    social_job = Job(
        id=1,
        source_name="linkedin_social",
        source_job_id="post-101",
        source_url="https://www.linkedin.com/posts/ahmed-recruiter_hiring-101",
        canonical_url_hash="hash101",
        original_application_url="https://www.linkedin.com/posts/ahmed-recruiter_hiring-101",
        company="Ahmed Recruiter",
        title="Angular Frontend Engineer",
        description_text="We are hiring an Angular Frontend Engineer in Smart Village, Cairo.",
        raw_location="Smart Village, Cairo, Egypt",
        workplace_type=WorkplaceType.HYBRID,
        seniority=SeniorityLevel.MID,
        employment_type=EmploymentType.FULL_TIME,
        eligibility=GeographicEligibility.EGYPT_ELIGIBLE,
        match_score=88.5,
        required_skills=["Angular", "TypeScript", "Tailwind CSS"],
        raw_payload={"is_social_post": True, "source_category": "SOCIAL_POST", "opportunity_segment": "EGYPT"},
    )
    card_text = format_job_card(social_job)

    assert "فرصة داخل مصر • Egypt Frontend" in card_text
    assert "Poster:" in card_text
    assert "Ahmed Recruiter" in card_text
    assert "Social Post (LinkedIn)" in card_text
    assert "Region & Work Mode:" in card_text

    # 2. Traditional Job Board in Remote GCC
    board_job = Job(
        id=2,
        source_name="workable_tamara",
        source_job_id="tamara-202",
        source_url="https://apply.workable.com/tamara/j/FE202/",
        canonical_url_hash="hash202",
        original_application_url="https://apply.workable.com/tamara/j/FE202/",
        company="Tamara",
        title="Senior Frontend Engineer (React/TypeScript)",
        description_text="Remote frontend role open to candidates in GCC and Egypt.",
        raw_location="Riyadh, Saudi Arabia",
        workplace_type=WorkplaceType.REMOTE,
        seniority=SeniorityLevel.SENIOR,
        employment_type=EmploymentType.FULL_TIME,
        eligibility=GeographicEligibility.EGYPT_ELIGIBLE,
        match_score=92.0,
        required_skills=["React", "TypeScript", "Next.js"],
        raw_payload={"is_social_post": False, "source_category": "JOB_BOARD", "opportunity_segment": "REMOTE_GCC_ABROAD"},
    )
    board_card = format_job_card(board_job)

    assert "ريموت خارج مصر • Remote Abroad / GCC" in board_card
    assert "Company:" in board_card
    assert "Tamara" in board_card
    assert "Job Board (workable_tamara)" in board_card
    assert "Remote" in board_card


# ===========================================================================
# 7. Surgical Bug Fix Verification Tests
# ===========================================================================

def test_react_native_roles_strictly_rejected():
    """Verify React Native roles are strictly rejected as mobile-only."""
    rn_roles = [
        "React Native Developer",
        "Senior React Native Engineer",
        "React Native Mobile Specialist",
        "Lead React Native Developer",
    ]
    for role in rn_roles:
        is_fe, reason = is_frontend_opportunity(role)
        assert is_fe is False, f"Expected '{role}' to be rejected as mobile, but passed: {reason}"


def test_dm_substring_false_positives_rejected():
    """Verify non-hiring posts with words like 'admin', 'roadmap', 'readme' are not falsely accepted."""
    non_hiring_posts = [
        "Check out our new Angular admin dashboard and Frontend roadmap! Feedback welcome on GitHub.",
        "Built a responsive React README viewer for developer documentation.",
        "Exploring the modern frontend roadmap for 2026. What do you think about Angular signals?",
    ]
    for post in non_hiring_posts:
        is_hiring, reason = is_hiring_intent_social_post(post)
        assert is_hiring is False, f"Expected non-hiring post to be rejected, but passed: {reason}\nPost: {post}"


def test_linkedin_snowflake_id_decoding_and_stale_rejection():
    """Verify LinkedIn snowflake ID (activity-7131820038516322304) decodes to 2023 and is identified as stale."""
    from datetime import datetime
    adapter = LinkedInSocialAdapter()
    raw_old = RawJobData(
        source_name="linkedin_social",
        source_job_id="activity-7131820038516322304",
        source_url="https://www.linkedin.com/posts/xorithm_we-are-hiring-the-following-positions-in-activity-7131820038516322304-Wa3-",
        payload={
            "title": "We are hiring Angular Developer",
            "snippet": "We are hiring an Angular developer in Cairo.",
            "link": "https://www.linkedin.com/posts/xorithm_we-are-hiring-the-following-positions-in-activity-7131820038516322304-Wa3-",
        },
    )
    norm = adapter.normalize(raw_old)
    assert norm.published_at is not None
    # 7131820038516322304 >> 22 = 1700354146051 ms -> November 19, 2023
    assert norm.published_at.year == 2023
    assert norm.published_at.month == 11
    assert norm.published_at.tzinfo == UTC

    # Verify freshness filter logic identifies it as older than 30 days
    age_days = (datetime.now(UTC) - norm.published_at).days
    assert age_days > 365, f"Expected > 1 year old, got {age_days} days"


def test_extract_role_title_preserves_seniority_and_internship():
    """Verify _extract_role_title preserves Senior, Junior, and Intern prefixes for framework titles."""
    adapter = LinkedInSocialAdapter()

    # Senior Angular
    title_sr = adapter._extract_role_title(
        raw_title="We are hiring a Senior Angular Developer at TechCorp",
        snippet="Looking for senior talent with 5+ years TypeScript experience.",
    )
    assert title_sr == "Senior Angular Frontend Developer"

    # Angular Intern
    title_intern = adapter._extract_role_title(
        raw_title="Paymob is hiring an Angular Intern for Summer 2026",
        snippet="Great opportunity for undergraduates to learn modern Angular.",
    )
    assert title_intern == "Angular Frontend Intern"

    # Junior React
    title_jr = adapter._extract_role_title(
        raw_title="Hiring Junior React Engineer",
        snippet="Entry level position for fresh graduates.",
    )
    assert title_jr == "Junior React / Next.js Frontend Engineer"

    # React Intern
    title_react_intern = adapter._extract_role_title(
        raw_title="Summer Trainee: React / Next.js Web Development",
        snippet="Internship program for web engineering students.",
    )
    assert title_react_intern == "React / Next.js Frontend Intern"


@pytest.mark.asyncio
async def test_explicit_serper_provider_does_not_fallback_to_duckduckgo(monkeypatch):
    """Verify that when SOCIAL_SEARCH_PROVIDER is explicitly 'serper', DuckDuckGo fallback is not executed."""
    from src.core.config import settings

    monkeypatch.setattr(settings, "SOCIAL_SEARCH_PROVIDER", "serper")
    monkeypatch.setattr(settings, "SOCIAL_SEARCH_API_KEY", "dummy-key")

    adapter = LinkedInSocialAdapter()

    # Mock _fetch_via_serper to return empty results
    async def mock_serper(api_key):
        return []

    ddg_called = False

    async def mock_ddg():
        nonlocal ddg_called
        ddg_called = True
        return []

    monkeypatch.setattr(adapter, "_fetch_via_serper", mock_serper)
    monkeypatch.setattr(adapter, "_fetch_via_duckduckgo", mock_ddg)

    items = await adapter.fetch_jobs()
    assert items == []
    assert ddg_called is False, "DuckDuckGo fallback should NOT run when provider='serper'"


def test_fullstack_linkedin_post_retains_fullstack_and_is_rejected_if_backend_heavy():
    """Verify LinkedIn full-stack post retains 'Full-Stack' in synthesized title and is evaluated by full-stack rule."""
    adapter = LinkedInSocialAdapter()
    raw = RawJobData(
        source_name="linkedin_social",
        source_job_id="activity-7523415398176796674",
        source_url="https://www.linkedin.com/posts/aya-kamal-8a130b229_were-hiring-senior-full-stack-developer-activity-7523415398176796674-ddsF",
        payload={
            "title": "We're Hiring: Senior Full-Stack Developer (Angular + .NET)",
            "snippet": "We are looking for a Senior Full-Stack Developer. Strong experience with .NET Core, C#, SQL Server, Docker, and Angular.",
            "link": "https://www.linkedin.com/posts/aya-kamal-8a130b229_were-hiring-senior-full-stack-developer-activity-7523415398176796674-ddsF",
        },
    )
    norm = adapter.normalize(raw)

    # 1. Must retain Full-Stack in title rather than being masked as pure Frontend
    assert "Full-Stack" in norm.title
    assert "Angular" in norm.title
    assert "Senior" in norm.title

    # 2. Must be evaluated by full-stack rule and rejected because backend technologies dominate
    is_fe, reason = is_frontend_opportunity(norm.title, norm.description_text, norm.required_skills)
    assert is_fe is False, f"Backend-heavy fullstack should be rejected, but passed: {reason}"
    assert "Full-stack role rejected" in reason


def test_extract_poster_rejects_generic_hiring_and_falls_back_to_url_handle():
    """Verify _extract_poster_or_company rejects 'We're Hiring' and extracts readable handle from post URL."""
    adapter = LinkedInSocialAdapter()

    # Case A: Title starts with "We're Hiring" -> falls back to URL handle "Aya Kamal"
    link_aya = "https://www.linkedin.com/posts/aya-kamal-8a130b229_were-hiring-senior-full-stack-developer-activity-7523415398176796674-ddsF"
    poster_aya = adapter._extract_poster_or_company(
        raw_title="We're Hiring: Senior Full-Stack Developer",
        snippet="Join our engineering team in Cairo.",
        link=link_aya,
    )
    assert poster_aya != "We're Hiring"
    assert poster_aya == "Aya Kamal"

    # Case B: Company handle in URL -> "Crosspointtalentsolutions"
    link_cross = "https://www.linkedin.com/posts/crosspointtalentsolutions_hiring-fullstackdeveloper-angular-activity-7527705974858592256--QwJ"
    poster_cross = adapter._extract_poster_or_company(
        raw_title="Hiring Alert: Angular Developer",
        snippet="Immediate opening in Cairo.",
        link=link_cross,
    )
    assert poster_cross != "Hiring Alert"
    assert poster_cross == "Crosspointtalentsolutions"

    # Case C: URL without handle -> falls back cleanly to "LinkedIn Hiring Network"
    link_generic = "https://www.linkedin.com/feed/update/urn:li:activity:7123456789"
    poster_gen = adapter._extract_poster_or_company(
        raw_title="We Are Hiring: Angular Engineer",
        snippet="Send resume to jobs@example.com",
        link=link_generic,
    )
    assert poster_gen != "We Are Hiring"
    assert poster_gen == "LinkedIn Hiring Network"


# ===========================================================================
# 7. Real End-to-End Pipeline Ingestion & DB Persistence Integration Test
# ===========================================================================

def create_mock_gemini():
    mock = AsyncMock()
    mock.extract_attributes.return_value = ExtractedJobAttributes()
    return mock


class MockRadarSourceAdapter(BaseSourceAdapter):
    """Source adapter serving realistic fixture jobs for ingestion integration verification."""

    def __init__(self, name: str, jobs: list[NormalizedJobData]):
        self._name = name
        self._jobs = jobs

    def source_metadata(self) -> SourceMetadata:
        return SourceMetadata(
            name=self._name,
            source_type="custom",
            base_url="https://example.com",
            doc_url="https://example.com",
            allowed_usage_summary="Mock pipeline integration test",
            rate_limit_req_per_minute=60,
            attribution_requirement="Mock",
            freshness_limitations="None",
            fields_provided=["title", "company", "description"],
        )

    async def health_check(self) -> bool:
        return True

    async def fetch_jobs(self, since=None, query_config=None) -> list[RawJobData]:
        return [
            RawJobData(
                source_name=self._name,
                source_job_id=j.source_job_id,
                source_url=j.source_url,
                payload={"id": j.source_job_id},
            )
            for j in self._jobs
        ]

    def normalize(self, raw_job: RawJobData) -> NormalizedJobData:
        for j in self._jobs:
            if j.source_job_id == raw_job.source_job_id:
                return j
        raise ValueError(f"Job not found: {raw_job.source_job_id}")


@pytest.mark.asyncio
async def test_end_to_end_frontend_pipeline_ingestion_and_segmentation(db_session, monkeypatch):
    """Real end-to-end integration test: executes DailyPipelineRunner with genuine SQLite persistence.

    Verifies that:
    1. Egypt job board listing is accepted, stored, and classified as Egypt segment.
    2. Egypt LinkedIn social hiring post is accepted, stored, and classified as Egypt segment (with is_social_post=True).
    3. GCC (Riyadh) Remote Frontend job is accepted, stored, and classified as Remote Abroad / GCC segment.
    4. GCC (Riyadh) On-site Frontend job is strictly excluded and neither saved to DB nor included in digest.
    5. Deserialization of Job properties (opportunity_segment, is_social_post) works cleanly from SQLite.
    6. Telegram digest partitions accurately into Egypt and Remote GCC sections without any unclassified fallback.
    """
    # Prevent background expiry detector from issuing live HTTP calls during test
    monkeypatch.setattr(
        "src.scheduler.runner.scan_and_mark_expired_jobs",
        AsyncMock(return_value={"checked": 3, "expired": 0, "active": 3}),
    )

    # Seed baseline CandidateProfile with verified frontend skills
    profile = CandidateProfile(
        country="EG",
        career_direction="Software Engineering / Frontend",
        priority_target="Frontend Engineering",
        confirmed_skills=["Angular", "React", "Vue.js", "TypeScript", "JavaScript", "HTML5", "CSS3"],
        digest_threshold=50.0,
        digest_enabled=1,
    )
    db_session.add(profile)
    await db_session.commit()

    now = datetime.now(UTC)

    # 1. Egypt Cairo Frontend job board listing
    job_cairo_board = NormalizedJobData(
        source_name="workable_cairo",
        source_job_id="cairo-fe-101",
        source_url="https://apply.workable.com/cairo-tech/j/FE101/",
        canonical_url="https://apply.workable.com/cairo-tech/j/FE101/",
        original_application_url="https://apply.workable.com/cairo-tech/j/FE101/",
        company="Cairo Tech Solutions",
        title="Senior Frontend Engineer (React/TypeScript)",
        description_text="We are hiring a Senior Frontend Engineer proficient in React, TypeScript, and modern web architectures in New Cairo, Egypt. Hybrid work schedule.",
        raw_location="New Cairo, Cairo, Egypt",
        workplace_type=WorkplaceType.HYBRID,
        seniority=SeniorityLevel.SENIOR,
        employment_type=EmploymentType.FULL_TIME,
        required_skills=["React", "TypeScript", "HTML5", "CSS3"],
        published_at=now,
        is_social_post=False,
    )

    # 2. Egypt LinkedIn social hiring post
    job_egypt_social = NormalizedJobData(
        source_name="linkedin_social",
        source_job_id="post-egypt-fe-202",
        source_url="https://www.linkedin.com/posts/recruiter-cairo_hiring-angular-developer-activity-7123456789012345678-abcD",
        canonical_url="https://www.linkedin.com/posts/recruiter-cairo_hiring-angular-developer-activity-7123456789012345678-abcD",
        original_application_url="https://www.linkedin.com/posts/recruiter-cairo_hiring-angular-developer-activity-7123456789012345678-abcD",
        company="Recruiter Cairo",
        title="Angular Frontend Developer",
        description_text="We're hiring an Angular Frontend Developer to join our team in Smart Village, Giza, Egypt! Strong experience with Angular, RxJS, and TypeScript required. Send your CV via DM or email to jobs@example.com",
        raw_location="Smart Village, Giza, Egypt",
        workplace_type=WorkplaceType.ON_SITE,
        seniority=SeniorityLevel.MID,
        employment_type=EmploymentType.FULL_TIME,
        required_skills=["Angular", "RxJS", "TypeScript"],
        published_at=now,
        is_social_post=True,
    )

    # 3. GCC (Riyadh) Remote Frontend job
    job_gcc_remote = NormalizedJobData(
        source_name="workable_gcc",
        source_job_id="riyadh-fe-303",
        source_url="https://apply.workable.com/riyadh-fintech/j/FE303/",
        canonical_url="https://apply.workable.com/riyadh-fintech/j/FE303/",
        original_application_url="https://apply.workable.com/riyadh-fintech/j/FE303/",
        company="Riyadh Fintech",
        title="Frontend Engineer (Vue / Nuxt)",
        description_text="Riyadh Fintech is looking for a Frontend Engineer with Vue.js and Nuxt experience. This is a 100% remote position open to engineers residing in Saudi Arabia, Arab Gulf, and Egypt.",
        raw_location="Riyadh, Saudi Arabia",
        workplace_type=WorkplaceType.REMOTE,
        remote_scope="GCC & Egypt Remote",
        seniority=SeniorityLevel.MID,
        employment_type=EmploymentType.FULL_TIME,
        required_skills=["Vue.js", "Nuxt", "TypeScript"],
        published_at=now,
        is_social_post=False,
    )

    # 4. GCC (Riyadh) On-site Frontend job (MUST BE STRICTLY EXCLUDED)
    job_gcc_onsite = NormalizedJobData(
        source_name="workable_gcc",
        source_job_id="riyadh-fe-404",
        source_url="https://apply.workable.com/al-rajhi/j/FE404/",
        canonical_url="https://apply.workable.com/al-rajhi/j/FE404/",
        original_application_url="https://apply.workable.com/al-rajhi/j/FE404/",
        company="Al-Rajhi Bank",
        title="Lead Frontend Developer",
        description_text="We are hiring a Lead Frontend Developer on-site at our head office in Riyadh, Saudi Arabia. Physical presence in Riyadh is mandatory.",
        raw_location="Riyadh, Saudi Arabia",
        workplace_type=WorkplaceType.ON_SITE,
        seniority=SeniorityLevel.LEAD,
        employment_type=EmploymentType.FULL_TIME,
        required_skills=["Angular", "TypeScript"],
        published_at=now,
        is_social_post=False,
    )

    # Set up registry with adapters
    registry = SourceRegistry()
    registry.register(MockRadarSourceAdapter("workable_cairo", [job_cairo_board]))
    registry.register(MockRadarSourceAdapter("linkedin_social", [job_egypt_social]))
    registry.register(MockRadarSourceAdapter("workable_gcc", [job_gcc_remote, job_gcc_onsite]))

    mock_telegram = AsyncMock()
    mock_telegram.send_message.return_value = {"ok": True, "result": {"message_id": 1001}}

    runner = DailyPipelineRunner(
        registry=registry,
        telegram_client=mock_telegram,
        gemini_extractor=create_mock_gemini(),
    )

    # Execute full pipeline against real in-memory SQLite DB
    daily_run = await runner.execute_daily_run(db_session, force=True, target_chat_id=123456)

    # 1. Pipeline status and counts
    assert daily_run.status == RunStatus.COMPLETED
    assert daily_run.jobs_new == 3
    assert daily_run.jobs_notified == 3

    # 2. Direct database query to verify persistence and exclusion
    stmt = select(Job).order_by(Job.id)
    saved_jobs = (await db_session.execute(stmt)).scalars().all()
    assert len(saved_jobs) == 3

    saved_source_ids = {j.source_job_id for j in saved_jobs}
    assert "riyadh-fe-404" not in saved_source_ids, "GCC on-site role must be strictly excluded from DB"
    assert "cairo-fe-101" in saved_source_ids
    assert "post-egypt-fe-202" in saved_source_ids
    assert "riyadh-fe-303" in saved_source_ids

    # 3. Clean deserialization and properties from SQLite
    cairo_job = next(j for j in saved_jobs if j.source_job_id == "cairo-fe-101")
    assert cairo_job.opportunity_segment == OpportunitySegment.EGYPT.value
    assert cairo_job.is_social_post is False
    assert cairo_job.source_category_label == "Job Board"

    social_job = next(j for j in saved_jobs if j.source_job_id == "post-egypt-fe-202")
    assert social_job.opportunity_segment == OpportunitySegment.EGYPT.value
    assert social_job.is_social_post is True
    assert social_job.source_category_label == "Social Post"

    remote_job = next(j for j in saved_jobs if j.source_job_id == "riyadh-fe-303")
    assert remote_job.opportunity_segment == OpportunitySegment.REMOTE_GCC_ABROAD.value
    assert remote_job.is_social_post is False
    assert remote_job.source_category_label == "Job Board"

    # 4. Telegram dispatch partitioning verification
    sent_texts = [call.kwargs.get("text", "") for call in mock_telegram.send_message.call_args_list]
    all_sent = "\n".join(sent_texts)

    # Intro header metrics
    assert "Daily Frontend Opportunity Radar" in all_sent
    assert "Discovered <b>3</b> new verified Frontend opportunities" in all_sent
    assert "فرص الواجهات الأمامية داخل مصر (Egypt):</b> 2" in all_sent
    assert "فرص ريموت الخليج والدولية (Remote Abroad / GCC):</b> 1" in all_sent
    assert "منشورات التوظيف (Social Posts):</b> 1" in all_sent
    assert "منصات التوظيف (Job Boards):</b> 2" in all_sent

    # Both section banners must be sent
    assert "القسم الأول: فرص الواجهات الأمامية داخل مصر" in all_sent
    assert "القسم الثاني: فرص ريموت الخليج والدولية" in all_sent
    # Fallback 'sec_other' section banner must NOT be present
    assert "فرص إضافية متوافقة" not in all_sent


def test_internship_and_interpreter_word_boundary_rules():
    """Verify word-boundary rules prevent false positive matching on words like 'Interpreter' or 'Build'."""
    # 1. Medical Interpreter with 'web' and 'ui' in description is rejected
    is_fe, reason = is_frontend_opportunity(
        title="Medical Interpreter (Remote)",
        description="Provide remote medical interpretation via web platform. Required skills include fast typing and user interface navigation.",
    )
    assert is_fe is False
    assert "Outside frontend engineering scope" in reason or "Non-frontend" in reason

    # 2. Non-frontend tech internship with words like 'Build', 'required', 'suites' does not match 'ui'
    is_fe, reason = is_frontend_opportunity(
        title="Tech Internship 2026",
        description="Build required enterprise suites. Candidates must maintain data pipelines and backend microservices.",
    )
    assert is_fe is False
    assert "Non-frontend internship" in reason

    # 3. Genuine Frontend UI Intern is accepted
    is_fe, reason = is_frontend_opportunity(
        title="Frontend UI Intern",
        description="Assist the UI team in developing responsive web components using modern HTML, CSS, and TypeScript.",
    )
    assert is_fe is True
    assert "Frontend Engineering internship" in reason or "Direct Frontend title match" in reason


def test_workable_and_egypt_community_return_none_published_at():
    """Verify Workable and Egypt community adapters return published_at=None when no upstream date is provided."""
    workable = WorkableAdapter(company_slug="integrant")
    raw_workable = RawJobData(
        source_name="workable_integrant",
        source_job_id="test-123",
        source_url="https://apply.workable.com/integrant/j/test-123/",
        payload={
            "title": "Lead Software Engineer - Angular/UI",
            "company_name": "Integrant",
            "shortcode": "test-123",
            "city": "Cairo",
            "country": "Egypt",
        },
    )
    norm_workable = workable.normalize(raw_workable)
    assert norm_workable.published_at is None, "Workable should return published_at=None instead of faking current time"

    egypt_comm = EgyptCommunityAdapter()
    raw_egypt = RawJobData(
        source_name="egypt_community",
        source_job_id="paymob-intern-1",
        source_url="https://paymob.com/jobs/1",
        payload={
            "company": "Paymob",
            "title": "Tech Internship 2026",
            "link": "https://paymob.com/jobs/1",
            "location": "Cairo, Egypt",
            "section": "## Internships 2026",
            "feed_name": "Software Internship Guide",
        },
    )
    norm_egypt = egypt_comm.normalize(raw_egypt)
    assert norm_egypt.published_at is None, "EgyptCommunityAdapter should return published_at=None instead of faking current time"


def test_parse_markdown_skips_internships_2025_and_accepts_2026():
    """Verify Egypt community adapter ignores archived ## Internships 2025 and accepts 2026 and Egypt sections."""
    adapter = EgyptCommunityAdapter()
    sample_md = """
# Guide
## Internships 2025
| Company | Internship Title | Link | Location |
|---|---|---|---|
| OldCompany2025 | Old Intern 2025 | [Link](https://old.example.com/2025) | Cairo, Egypt |

## Internships 2026
| Company | Internship Title | Link | Location |
|---|---|---|---|
| NewCompany2026 | Tech Intern 2026 | [Link](https://new.example.com/2026) | Cairo, Egypt |

## Internships in Egypt
| Company | Internship Title | Link | Location |
|---|---|---|---|
| EgyptCompany | Egypt Intern | [Link](https://egypt.example.com/intern) | Giza, Egypt |
"""
    parsed = adapter._parse_markdown(sample_md, "Guide")
    titles = [item["title"] for item in parsed]
    assert "Tech Intern 2026" in titles
    assert "Egypt Intern" in titles
    assert "Old Intern 2025" not in titles


def test_job_persistence_column_clamping_and_eligibility_classification():
    """Verify long raw_location (>260 chars) preserves eligibility detection before clamping to <= 255 for DB."""
    from src.engine.eligibility import GeographicEligibilityEngine
    from src.models.enums import GeographicEligibility, OpportunitySegment
    from src.scheduler.runner import _clamp

    engine = GeographicEligibilityEngine()
    # String with non-Gulf countries exceeding 255 chars, with 'Egypt' appearing after char 260
    long_prefix = "Argentina, Brazil, Canada, Denmark, Estonia, France, Germany, Greece, Hungary, Iceland, Ireland, Italy, Japan, Kenya, Latvia, Lithuania, Luxembourg, Mexico, Netherlands, Norway, Poland, Portugal, Romania, Spain, Sweden, Switzerland, Turkey, United Kingdom, United States, "
    long_location = long_prefix + "Egypt"
    assert len(long_location) > 255
    assert long_location.find("Egypt") > 255

    # 1. Classification works on full untruncated string
    elig, reason = engine.classify(raw_location=long_location, workplace_type=WorkplaceType.REMOTE)
    assert elig == GeographicEligibility.EGYPT_ELIGIBLE
    segment = engine.classify_segment(raw_location=long_location, workplace_type=WorkplaceType.REMOTE, eligibility=elig)
    assert segment == OpportunitySegment.EGYPT

    # 2. Clamping ensures string is safe for PostgreSQL String(255)
    clamped_loc = _clamp(long_location, 255)
    assert clamped_loc is not None
    assert len(clamped_loc) == 255
    assert len(clamped_loc) <= 255

    # 3. Job model accepts clamped string without error
    job = Job(
        source_id=1,
        source_name="himalayas",
        source_job_id="test-long-loc",
        source_url="https://example.com/job/1",
        canonical_url_hash="hash64",
        original_application_url="https://example.com/job/1",
        company="HimalayasCo",
        title="Frontend Engineer",
        description_text="Frontend",
        raw_location=clamped_loc,
        remote_scope=clamped_loc,
        eligibility=elig,
        eligibility_reason="Eligible",
    )
    assert job.raw_location is not None and len(job.raw_location) <= 255
    assert job.remote_scope is not None and len(job.remote_scope) <= 255





