"""Unit and integration tests for source adapters."""

import httpx
import pytest
import respx

from src.core.security import is_safe_url
from src.models.enums import EmploymentType, SeniorityLevel, WorkplaceType
from src.sources.greenhouse import GreenhouseAdapter
from src.sources.himalayas import HimalayasAdapter
from src.sources.lever import LeverAdapter
from src.sources.remotive import RemotiveAdapter
from src.sources.rss import RSSAdapter

# Sample fixtures simulating actual provider schemas
HIMALAYAS_FIXTURE = {
    "comments": "cursor pagination enabled",
    "jobs": [
        {
            "guid": "https://himalayas.app/jobs/frontend-engineer",
            "title": "Senior Angular Developer",
            "companyName": "Acme Global",
            "description": "<p>We are seeking a <b>Senior Angular Developer</b> with TypeScript skills.</p>",
            "employmentType": "Full-time",
            "seniority": "Senior",
            "minSalary": 90000,
            "maxSalary": 120000,
            "currency": "USD",
            "salaryPeriod": "YEARLY",
            "locationRestrictions": ["Worldwide"],
            "applicationLink": "https://himalayas.app/jobs/frontend-engineer?utm_source=api",
            "pubDate": 1731500000,
            "categories": ["Angular", "TypeScript", "Frontend"],
        }
    ]
}

REMOTIVE_FIXTURE = {
    "job-count": 1,
    "jobs": [
        {
            "id": 889922,
            "url": "https://remotive.com/remote-jobs/software-dev/frontend-developer-889922?ref=tracker",
            "title": "Frontend Engineer (Angular)",
            "company_name": "Globex Corp",
            "job_type": "full_time",
            "publication_date": "2026-11-12T10:00:00Z",
            "candidate_required_location": "Worldwide",
            "description": "<p>Exciting opportunity for an Angular developer.</p>",
            "tags": ["angular", "typescript", "css"],
        }
    ]
}

GREENHOUSE_FIXTURE = {
    "jobs": [
        {
            "id": 998877,
            "title": "Web Software Engineer",
            "absolute_url": "https://job-boards.greenhouse.io/canonical/jobs/998877",
            "location": {"name": "Home based - EMEA"},
            "updated_at": "2026-11-10T12:00:00-05:00",
            "content": "<p>Canonical seeks an engineer working on web frontends.</p>",
        }
    ]
}

LEVER_FIXTURE = [
    {
        "id": "lever-1234",
        "text": "Full Stack Software Engineer",
        "hostedUrl": "https://jobs.lever.co/palantir/lever-1234?trk=test",
        "categories": {
            "commitment": "Full-time",
            "location": "Remote - Worldwide",
            "team": "Frontend",
        },
        "createdAt": 1731400000000,
        "descriptionPlain": "Develop responsive web apps using modern frameworks.",
        "description": "<p>Develop responsive web apps using modern frameworks.</p>",
    }
]

RSS_SAMPLE_XML = """<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Remote Jobs Feed</title>
    <link>https://weworkremotely.com</link>
    <description>Job listings</description>
    <item>
      <title>FrontEnd Inc: Senior Angular Specialist</title>
      <link>https://weworkremotely.com/jobs/12345?ref=rss</link>
      <description>&lt;p&gt;Looking for expert Angular and TypeScript engineer.&lt;/p&gt;</description>
      <guid>https://weworkremotely.com/jobs/12345</guid>
    </item>
  </channel>
</rss>
"""


def test_ssrf_safety_protection():
    """Verify that private IP ranges and localhost are blocked."""
    assert not is_safe_url("http://localhost:8000/api")
    assert not is_safe_url("http://127.0.0.1:8000/secret")
    assert not is_safe_url("http://192.168.1.10/jobs")
    assert not is_safe_url("http://10.0.0.5/jobs")
    assert not is_safe_url("http://172.16.0.1/admin")
    assert not is_safe_url("file:///etc/passwd")
    assert is_safe_url("https://himalayas.app/jobs/api")
    assert is_safe_url("https://remotive.com/api/remote-jobs")


@pytest.mark.asyncio
@respx.mock
async def test_himalayas_adapter_fetch_and_normalize():
    """Verify Himalayas adapter API request and normalization."""
    respx.get("https://himalayas.app/jobs/api").mock(
        return_value=httpx.Response(200, json=HIMALAYAS_FIXTURE)
    )

    adapter = HimalayasAdapter()
    meta = adapter.source_metadata()
    assert meta.name == "himalayas"
    assert "applicationLink" in meta.fields_provided

    health = await adapter.health_check()
    assert health is True

    raw_jobs = await adapter.fetch_jobs()
    assert len(raw_jobs) == 1

    norm = adapter.normalize(raw_jobs[0])
    assert norm.company == "Acme Global"
    assert norm.title == "Senior Angular Developer"
    assert norm.seniority == SeniorityLevel.SENIOR
    assert norm.employment_type == EmploymentType.FULL_TIME
    assert norm.workplace_type == WorkplaceType.REMOTE
    assert norm.salary_min == 90000.0
    assert norm.salary_max == 120000.0
    # Tracking parameter stripped from canonical url, original intact
    assert "utm_source" not in norm.canonical_url
    assert "utm_source=api" in norm.original_application_url


@pytest.mark.asyncio
@respx.mock
async def test_remotive_adapter_fetch_and_normalize():
    """Verify Remotive adapter respects 24h delayed terms and normalizes."""
    respx.get("https://remotive.com/api/remote-jobs").mock(
        return_value=httpx.Response(200, json=REMOTIVE_FIXTURE)
    )

    adapter = RemotiveAdapter()
    meta = adapter.source_metadata()
    assert meta.name == "remotive"
    assert "24 hours" in meta.freshness_limitations

    raw_jobs = await adapter.fetch_jobs()
    assert len(raw_jobs) == 1

    norm = adapter.normalize(raw_jobs[0])
    assert norm.company == "Globex Corp"
    assert norm.title == "Frontend Engineer (Angular)"
    assert norm.workplace_type == WorkplaceType.REMOTE
    assert "Worldwide" in norm.remote_scope
    assert "ref=tracker" not in norm.canonical_url


@pytest.mark.asyncio
@respx.mock
async def test_greenhouse_adapter_fetch_and_normalize():
    """Verify Greenhouse adapter parses board token and location properly."""
    respx.get("https://boards-api.greenhouse.io/v1/boards/canonical/jobs").mock(
        return_value=httpx.Response(200, json=GREENHOUSE_FIXTURE)
    )

    adapter = GreenhouseAdapter(board_token="canonical")
    raw_jobs = await adapter.fetch_jobs()
    assert len(raw_jobs) == 1

    norm = adapter.normalize(raw_jobs[0])
    assert norm.company == "Canonical"
    assert norm.workplace_type == WorkplaceType.REMOTE
    assert "EMEA" in norm.raw_location


@pytest.mark.asyncio
@respx.mock
async def test_lever_adapter_fetch_and_normalize():
    """Verify Lever adapter normalizes categories, createdAt, and commitment."""
    respx.get("https://api.lever.co/v0/postings/palantir?mode=json").mock(
        return_value=httpx.Response(200, json=LEVER_FIXTURE)
    )

    adapter = LeverAdapter(company_slug="palantir")
    raw_jobs = await adapter.fetch_jobs()
    assert len(raw_jobs) == 1

    norm = adapter.normalize(raw_jobs[0])
    assert norm.company == "Palantir"
    assert norm.employment_type == EmploymentType.FULL_TIME
    assert norm.workplace_type == WorkplaceType.REMOTE
    assert norm.published_at is not None


@pytest.mark.asyncio
@respx.mock
async def test_rss_adapter_fetch_and_normalize():
    """Verify RSS adapter parses XML feed items."""
    respx.get("https://weworkremotely.com/feed.rss").mock(
        return_value=httpx.Response(200, text=RSS_SAMPLE_XML, headers={"Content-Type": "application/xml"})
    )

    adapter = RSSAdapter(feed_url="https://weworkremotely.com/feed.rss", name="rss_wwr")
    raw_jobs = await adapter.fetch_jobs()
    assert len(raw_jobs) == 1

    norm = adapter.normalize(raw_jobs[0])
    assert norm.company == "FrontEnd Inc"
    assert norm.title == "Senior Angular Specialist"
    assert norm.remote_scope is None
    assert "Angular and TypeScript" in norm.description_text


@pytest.mark.asyncio
@respx.mock
async def test_egypt_community_adapter_parse_and_normalize():
    """Verify Egypt community adapter parses markdown tables and sets Egypt eligibility."""
    from src.sources.egypt_community import EgyptCommunityAdapter

    sample_md = """
# Guide
## Internships 2026
| Company | Internship Title | Link | Location |
|---|---|---|---|
| Paymob | Tech Internship 2026 | [Link](https://app.recruitera.ai/paymob/job1) | Cairo, Egypt |
| Siemens | SSP - R&D AI/ML Development Intern | [Link](https://jobs.siemens.com/504471) | Cairo, Egypt |
"""
    respx.get("https://raw.githubusercontent.com/dinaashraf20003/Software-Internship-Guide/main/README.md").mock(
        return_value=httpx.Response(200, text=sample_md)
    )

    adapter = EgyptCommunityAdapter()
    raw_jobs = await adapter.fetch_jobs()
    assert len(raw_jobs) == 2

    norm = adapter.normalize(raw_jobs[0])
    assert norm.company == "Paymob"
    assert norm.title == "Tech Internship 2026"
    assert "EG" in norm.country_codes
    assert norm.seniority == SeniorityLevel.INTERNSHIP
    assert norm.employment_type == EmploymentType.INTERNSHIP


@pytest.mark.asyncio
@respx.mock
async def test_jobicy_adapter_fetch_and_normalize():
    """Verify Jobicy adapter parses remote job payload."""
    from src.sources.jobicy import JobicyAdapter

    jobicy_sample = {
        "jobs": [
            {
                "id": "12345",
                "url": "https://jobicy.com/jobs/12345-frontend-developer",
                "jobTitle": "Frontend Engineer (Angular)",
                "companyName": "TechCo",
                "jobGeo": "EMEA",
                "jobType": "full-time",
                "jobDescription": "<p>Angular and TypeScript experience required.</p>",
            }
        ]
    }
    respx.get("https://jobicy.com/api/v2/remote-jobs").mock(
        return_value=httpx.Response(200, json=jobicy_sample)
    )

    adapter = JobicyAdapter()
    raw_jobs = await adapter.fetch_jobs()
    assert len(raw_jobs) >= 1

    norm = adapter.normalize(raw_jobs[0])
    assert norm.company == "TechCo"
    assert norm.workplace_type == WorkplaceType.REMOTE
    assert "Angular" in norm.required_skills


@pytest.mark.asyncio
@respx.mock
async def test_linkedin_social_adapter_serper_and_normalize():
    """Verify LinkedIn social post adapter fetches via search API and normalizes properly."""
    from src.core.config import settings
    from src.sources.linkedin_posts import LinkedInSocialAdapter

    serper_mock = {
        "organic": [
            {
                "title": "Kareem Recruiter on LinkedIn: 'We are hiring a Frontend Engineer at Swvl...'",
                "link": "https://www.linkedin.com/posts/kareem-recruiter_hiring-frontend-engineer-activity-72418001920?utm_source=share",
                "snippet": "We are hiring a Frontend Engineer at Swvl in Cairo, Egypt! Strong experience with Angular and TypeScript needed.",
            }
        ]
    }

    respx.post("https://google.serper.dev/search").mock(
        return_value=httpx.Response(200, json=serper_mock)
    )

    orig_key = getattr(settings, "SOCIAL_SEARCH_API_KEY", "")
    orig_prov = getattr(settings, "SOCIAL_SEARCH_PROVIDER", "auto")
    try:
        settings.SOCIAL_SEARCH_API_KEY = "test-serper-key"
        settings.SOCIAL_SEARCH_PROVIDER = "serper"

        adapter = LinkedInSocialAdapter()
        raw_jobs = await adapter.fetch_jobs()
        assert len(raw_jobs) >= 1

        norm = adapter.normalize(raw_jobs[0])
        assert norm.source_name == "linkedin_social"
        assert norm.is_social_post is True
        assert "Frontend" in norm.title or "Angular" in norm.title
        assert "Cairo" in norm.raw_location
        assert "Swvl" in norm.company or "Kareem" in norm.company
        assert "Angular" in norm.required_skills
    finally:
        settings.SOCIAL_SEARCH_API_KEY = orig_key
        settings.SOCIAL_SEARCH_PROVIDER = orig_prov


