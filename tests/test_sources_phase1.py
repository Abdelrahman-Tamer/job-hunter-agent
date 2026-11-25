"""Phase 1 TDD tests: LinkedIn Posts v2, Wuzzuf Egypt, Global ATS Dorking, and Direct Contact Formatting."""

import json
from datetime import UTC, datetime
from urllib.parse import urlparse

import httpx
import pytest
import respx

from src.bot.formatters import format_job_card
from src.core.config import Settings, settings
from src.engine.frontend_filter import is_hiring_intent_social_post
from src.models import (
    EmploymentType,
    GeographicEligibility,
    Job,
    SeniorityLevel,
    WorkplaceType,
)
from src.sources.http_client import ResilientHttpClient

# ---------------------------------------------------------------------------
# 1. LinkedIn Posts v2 Tests
# ---------------------------------------------------------------------------


def test_linkedin_v2_query_matrix_budget_and_surfaces():
    """Verify LinkedInSocialAdapter searches /posts and /feed/update within <= 8 bilingual queries."""
    from src.sources.linkedin_posts import LinkedInSocialAdapter

    adapter = LinkedInSocialAdapter()
    queries = adapter.queries
    assert 6 <= len(queries) <= 8

    joined = "\n".join(queries)
    assert "site:linkedin.com/posts" in joined
    assert "site:linkedin.com/feed/update" in joined

    # Must cover English Egypt, Remote/GCC/EMEA, Direct Email, and Arabic MENA
    assert any("egypt" in q.lower() and "angular" in q.lower() for q in queries)
    assert any(("gcc" in q.lower() or "emea" in q.lower()) and "remote" in q.lower() for q in queries)
    assert any("send your cv" in q.lower() or "hr@" in q.lower() for q in queries)
    assert any("مطلوب" in q and "فرونت" in q for q in queries)


def test_linkedin_v2_url_validation_posts_and_feed_update():
    """Verify _is_linkedin_url accepts /posts/ and /feed/update/ and rejects lookalikes."""
    from src.sources.linkedin_posts import LinkedInSocialAdapter

    assert LinkedInSocialAdapter._is_linkedin_url(
        "https://www.linkedin.com/posts/recruiter-cairo_hiring-angular-activity-7241892019201-abcd"
    )
    assert LinkedInSocialAdapter._is_linkedin_url(
        "https://www.linkedin.com/feed/update/urn:li:activity:7241892019201"
    )
    assert LinkedInSocialAdapter._is_linkedin_url(
        "https://linkedin.com/feed/update/urn:li:ugcPost:7241892019201/"
    )

    # Rejected URLs
    assert not LinkedInSocialAdapter._is_linkedin_url("https://www.linkedin.com/posts-evil/123")
    assert not LinkedInSocialAdapter._is_linkedin_url("https://www.linkedin.com/in/candidate-profile")
    assert not LinkedInSocialAdapter._is_linkedin_url("https://evil.com/?next=https://www.linkedin.com/feed/update/1")
    assert not LinkedInSocialAdapter._is_linkedin_url("https://www.linkedin.com@evil.com/posts/123")
    assert not LinkedInSocialAdapter._is_linkedin_url("http://127.0.0.1/posts/123")


@pytest.mark.asyncio
@respx.mock
async def test_linkedin_v2_serper_uses_freshness_tbs_and_accepts_feed_update(monkeypatch):
    """Verify Serper calls include tbs=qdr:d3, stay <= 8 calls, and ingest /feed/update/ posts."""
    from src.sources.linkedin_posts import LinkedInSocialAdapter

    captured_payloads = []

    def serper_handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content.decode("utf-8"))
        captured_payloads.append(body)
        return httpx.Response(
            200,
            json={
                "organic": [
                    {
                        "title": "Nadia HR on LinkedIn: We are hiring Angular Frontend Developer",
                        "link": "https://www.linkedin.com/feed/update/urn:li:activity:7527705974858592256?utm_source=share",
                        "snippet": "We are hiring an Angular Frontend Developer in Cairo, Egypt. Send your CV to talent@nadiacorp.eg",
                    },
                    {
                        "title": "Job Seeker Post",
                        "link": "https://www.linkedin.com/posts/seeker-ahmed_opentowork-activity-7527705974858592257",
                        "snippet": "أبحث عن عمل كمطور فرونت اند متاح للعمل فوراً #OpenToWork",
                    },
                ]
            },
        )

    respx.post("https://google.serper.dev/search").mock(side_effect=serper_handler)
    monkeypatch.setattr(settings, "SOCIAL_SEARCH_API_KEY", "test-serper-key")
    monkeypatch.setattr(settings, "SOCIAL_SEARCH_PROVIDER", "serper")
    monkeypatch.setattr(settings, "SERPER_FRESHNESS_TBS", "qdr:d3")

    adapter = LinkedInSocialAdapter()
    try:
        raw_jobs = await adapter.fetch_jobs()
    finally:
        await adapter.http_client.close()

    assert 6 <= len(captured_payloads) <= 8
    for payload in captured_payloads:
        assert payload.get("tbs") == "qdr:d3"

    # Deduplicated across queries and job-seeker post filtered out
    assert len(raw_jobs) == 1
    assert "/feed/update/" in raw_jobs[0].source_url

    norm = adapter.normalize(raw_jobs[0])
    assert norm.is_social_post is True
    assert norm.raw_payload.get("direct_email") == "talent@nadiacorp.eg"


def test_linkedin_v2_arabic_and_english_hiring_intent_classifier():
    """Verify Arabic + English hiring signals pass while Arabic + English job-seeker posts fail."""
    hiring_posts = [
        "مطلوب مطور فرونت اند Angular للعمل في القاهرة",
        "بنوظف حالياً مهندس واجهات أمامية React عن بعد",
        "فرصة عمل لمطوري Angular في شركة تقنية بالتجمع الخامس",
        "مطلوب للعمل Frontend Developer خبرة سنتين في TypeScript",
        "للتقديم على وظيفة Angular Frontend Developer يرجى ملء الفورم",
        "ابعت الـ cv على الايميل careers@cairodev.io لو عندك خبرة Angular",
        "ارسل السيرة الذاتية على hr@techmenafirm.com لو مهتم بوظيفة Frontend",
        "We are hiring a Senior Angular Developer in Cairo! Send CV to jobs@fintech.eg",
    ]
    for post in hiring_posts:
        ok, reason = is_hiring_intent_social_post(post)
        assert ok is True, f"Expected Arabic/English hiring post to pass, got False ({reason}): {post}"

    seeker_posts = [
        "أبحث عن عمل كـ Frontend Developer في القاهرة",
        "ابحث عن عمل مطور ويب Angular",
        "بدور على شغل فرونت اند خبرة سنة",
        "محتاج شغل React أو Angular ريموت",
        "خريج أبحث عن فرصة في مجال تطوير الواجهات الأمامية",
        "متاح للعمل فوراً كمطور Angular و TypeScript",
        "أبحث عن فرصة تدريب أو شغل Frontend Developer",
        "I am #OpenToWork looking for a frontend developer job in Cairo",
    ]
    for post in seeker_posts:
        ok, reason = is_hiring_intent_social_post(post)
        assert ok is False, f"Expected job-seeker post to be rejected, got True ({reason}): {post}"


def test_linkedin_v2_direct_contact_extraction_and_validation():
    """Verify direct_email, whatsapp_contact, and safe apply_form_url extraction into raw_payload."""
    from src.sources.linkedin_posts import LinkedInSocialAdapter

    adapter = LinkedInSocialAdapter()

    # Case 1: Valid recruiter email (ignoring noreply@ and example.com), wa.me link, and Google Form
    raw_1 = adapter.normalize(
        adapter._build_raw_job(
            title="Heba HR on LinkedIn: Hiring Angular Dev",
            snippet=(
                "Ignore noreply@linkedin.com and demo@example.com. "
                "We are hiring an Angular Developer in Cairo! Send CV to careers@paymob-talent.eg "
                "or message us via https://wa.me/201001234567?text=angular "
                "or fill https://forms.gle/abc123XYZ."
            ),
            link="https://www.linkedin.com/posts/heba-hr_hiring-angular-activity-7527705974858592256-xyz",
            provider="serper",
        )
    )
    assert raw_1.raw_payload.get("direct_email") == "careers@paymob-talent.eg"
    assert raw_1.raw_payload.get("whatsapp_contact") == "https://wa.me/201001234567?text=angular"
    assert raw_1.raw_payload.get("apply_form_url") == "https://forms.gle/abc123XYZ"
    assert raw_1.is_social_post is True

    # Case 2: Arabic WhatsApp phone adjacent to واتساب + Tally form + no-reply excluded
    raw_2 = adapter.normalize(
        adapter._build_raw_job(
            title="مطلوب فرونت اند Angular",
            snippet=(
                "لا ترسل إلى no-reply@company.com. ابعت الـ cv على واتساب 01098765432 "
                "أو التقديم عبر https://tally.so/r/wxyz12"
            ),
            link="https://www.linkedin.com/feed/update/urn:li:activity:7527705974858592258",
            provider="serper",
        )
    )
    assert raw_2.raw_payload.get("direct_email") is None
    assert raw_2.raw_payload.get("whatsapp_contact") == "01098765432"
    assert raw_2.raw_payload.get("apply_form_url") == "https://tally.so/r/wxyz12"

    # Case 3: Plain phone without WhatsApp keyword & spoofed form URL must NOT be extracted
    raw_3 = adapter.normalize(
        adapter._build_raw_job(
            title="Hiring Frontend Engineer",
            snippet=(
                "Office landline +201001112233. Bad form https://forms.gle.evil.com/phish "
                "and https://docs.google.com/document/d/123 and https://api.whatsapp.com/send?phone=971501234567."
            ),
            link="https://www.linkedin.com/posts/recruiter_hiring-activity-7527705974858592259",
            provider="serper",
        )
    )
    assert raw_3.raw_payload.get("whatsapp_contact") == "https://api.whatsapp.com/send?phone=971501234567"
    assert raw_3.raw_payload.get("apply_form_url") is None

    # Case 4: GCC phone adjacent to WhatsApp + docs.google.com/forms / airtable / typeform
    raw_4 = adapter.normalize(
        adapter._build_raw_job(
            title="Hiring Angular Engineer",
            snippet=(
                "WhatsApp: +966 50 123 4567. Apply: https://docs.google.com/forms/d/e/1FAIpQLSdTest/viewform"
            ),
            link="https://www.linkedin.com/posts/recruiter_hiring-activity-7527705974858592260",
            provider="serper",
        )
    )
    assert raw_4.raw_payload.get("whatsapp_contact") == "+966501234567"
    assert raw_4.raw_payload.get("apply_form_url") == "https://docs.google.com/forms/d/e/1FAIpQLSdTest/viewform"

    raw_5 = adapter.normalize(
        adapter._build_raw_job(
            title="Hiring Frontend Dev",
            snippet="Apply via https://company.typeform.com/to/abc123 or https://airtable.com/shrXYZ",
            link="https://www.linkedin.com/posts/recruiter_hiring-activity-7527705974858592261",
            provider="serper",
        )
    )
    assert raw_5.raw_payload.get("apply_form_url") == "https://company.typeform.com/to/abc123"


# ---------------------------------------------------------------------------
# 2. Wuzzuf Egypt Adapter Tests
# ---------------------------------------------------------------------------


def _build_wuzzuf_ssr_html(
    path_key: str,
    jobs_list: list[dict],
    companies_dict: dict[str, dict],
    total_count: int = 25,
) -> str:
    """Construct realistic Wuzzuf SSR HTML embedding Wuzzuf.initialStoreState."""
    job_collection = {j["id"]: j for j in jobs_list}
    results_set = {
        j["id"]: {
            "id": j["id"],
            "type": "jobSearch",
            "attributes": {
                "computedFields": [
                    {
                        "name": "company_name",
                        "value": [companies_dict.get(j["relationships"]["company"]["data"]["id"], {}).get("attributes", {}).get("name", "")],
                    }
                ]
            },
        }
        for j in jobs_list
    }
    state = {
        "browsingPage": {
            "sets": {
                path_key: {
                    "start": 0,
                    "totalResultsCount": total_count,
                    "resultsSet": results_set,
                }
            }
        },
        "entities": {
            "job": {"collection": job_collection},
            "company": {"collection": companies_dict},
        },
    }
    return f"""<!DOCTYPE html>
<html>
<head><title>Frontend Jobs in Egypt - Wuzzuf</title></head>
<body>
<script>
(function(){{
    var Wuzzuf = window.Wuzzuf = window.Wuzzuf || {{}};
    Wuzzuf.initialStoreState = {json.dumps(state)};
}})();
</script>
</body>
</html>"""


@pytest.mark.asyncio
@respx.mock
async def test_wuzzuf_adapter_fetch_dedup_and_normalize():
    """Verify WuzzufAdapter parses real SSR store structure, deduplicates, and normalizes all fields."""
    from src.sources.wuzzuf import WuzzufAdapter

    companies = {
        "101": {"id": "101", "type": "company", "attributes": {"name": "Paymob Egypt"}},
        "102": {"id": "102", "type": "company", "attributes": {"name": "Bosta"}},
    }
    fe_page0_jobs = [
        {
            "id": "wuzzuf-uuid-1",
            "type": "job",
            "attributes": {
                "jobType": "job",
                "title": "Senior Angular Frontend Developer",
                "description": "<p>Build fintech dashboards in <b>Angular 18</b> and TypeScript.</p>",
                "requirements": "<ul><li>3+ years Angular and RxJS</li></ul>",
                "uri": "jobs/p/abc123-senior-angular-frontend-developer-paymob-cairo-egypt",
                "slug": "abc123-senior-angular-frontend-developer-paymob-cairo-egypt",
                "postedAt": "11/25/2026 12:00:00",
                "workplaceArrangement": {"id": 3, "displayedName": "Hybrid", "translations": {"displayedName": {"en": "hybrid"}}},
                "location": {
                    "country": {"name": "Egypt", "code": "EG"},
                    "city": {"name": "Cairo"},
                    "area": {"name": "Maadi"},
                },
                "careerLevel": {"id": 6, "name": "Experienced", "hint": "Non-Manager"},
                "workTypes": [{"id": 1, "name": "full_time", "displayedName": "Full Time"}],
                "workExperienceYears": {"min": 3, "max": 5},
                "keywords": [{"name": "Angular"}, {"name": "TypeScript"}, {"name": "RxJS"}],
                "hideCompany": False,
                "hideSalary": True,
                "salary": {"min": None, "max": None, "currency": None},
            },
            "relationships": {"company": {"data": {"id": "101", "type": "company"}}},
        },
        {
            "id": "wuzzuf-uuid-2",
            "type": "job",
            "attributes": {
                "jobType": "job",
                "title": "Frontend Engineer (Remote)",
                "description": "<p>React and TypeScript web platform.</p>",
                "requirements": "<p>2+ years frontend experience.</p>",
                "uri": "jobs/p/def456-frontend-engineer-bosta-cairo-egypt",
                "slug": "def456-frontend-engineer-bosta-cairo-egypt",
                "postedAt": "11/24/2026 10:30:00",
                "workplaceArrangement": {"id": 2, "displayedName": "Remote", "translations": {"displayedName": {"en": "remote"}}},
                "location": {
                    "country": {"name": "Egypt", "code": "EG"},
                    "city": {"name": "Cairo"},
                    "area": None,
                },
                "careerLevel": {"id": 5, "name": "Entry Level", "hint": "Junior Level / Fresh Grad"},
                "workTypes": [{"id": 1, "name": "full_time", "displayedName": "Full Time"}],
                "workExperienceYears": {"min": 1, "max": 3},
                "keywords": [{"name": "Frontend"}, {"name": "TypeScript"}],
                "hideCompany": False,
                "hideSalary": True,
                "salary": {"min": None, "max": None, "currency": None},
            },
            "relationships": {"company": {"data": {"id": "102", "type": "company"}}},
        },
    ]
    # Angular query returns overlapping job wuzzuf-uuid-1 + new on-site job wuzzuf-uuid-3
    angular_page0_jobs = [
        fe_page0_jobs[0],
        {
            "id": "wuzzuf-uuid-3",
            "type": "job",
            "attributes": {
                "jobType": "internship",
                "title": "Angular Frontend Intern",
                "description": "<p>Summer Angular training program in Alexandria.</p>",
                "requirements": "<p>HTML, CSS, JavaScript basics.</p>",
                "uri": "jobs/p/ghi789-angular-frontend-intern-bosta-alexandria-egypt",
                "slug": "ghi789-angular-frontend-intern-bosta-alexandria-egypt",
                "postedAt": "11/25/2026 09:00:00",
                "workplaceArrangement": {"id": 1, "displayedName": "On-site", "translations": {"displayedName": {"en": "on_site"}}},
                "location": {
                    "country": {"name": "Egypt", "code": "EG"},
                    "city": {"name": "Alexandria"},
                    "area": None,
                },
                "careerLevel": {"id": 4, "name": "Student", "hint": "Undergraduate"},
                "workTypes": [{"id": 4, "name": "internship", "displayedName": "Internship"}],
                "workExperienceYears": {"min": 0, "max": 1},
                "keywords": [{"name": "Angular"}, {"name": "JavaScript"}],
                "hideCompany": False,
                "hideSalary": True,
                "salary": {"min": None, "max": None, "currency": None},
            },
            "relationships": {"company": {"data": {"id": "102", "type": "company"}}},
        },
    ]

    respx.get("https://wuzzuf.net/a/Frontend-Jobs-in-Egypt").mock(
        return_value=httpx.Response(
            200,
            text=_build_wuzzuf_ssr_html("/a/Frontend-Jobs-in-Egypt", fe_page0_jobs, companies, total_count=2),
        )
    )
    respx.get("https://wuzzuf.net/a/Angular-Jobs-in-Egypt").mock(
        return_value=httpx.Response(
            200,
            text=_build_wuzzuf_ssr_html("/a/Angular-Jobs-in-Egypt", angular_page0_jobs, companies, total_count=2),
        )
    )

    adapter = WuzzufAdapter(http_client=ResilientHttpClient(max_retries=1))
    try:
        raw_jobs = await adapter.fetch_jobs()
    finally:
        await adapter.http_client.close()

    # Deduplicated: wuzzuf-uuid-1 appeared in both queries -> 3 unique total
    assert len(raw_jobs) == 3
    norms = [adapter.normalize(rj) for rj in raw_jobs]

    by_id = {n.source_job_id: n for n in norms}
    j1 = by_id["wuzzuf-uuid-1"]
    assert j1.source_name == "wuzzuf"
    assert j1.is_social_post is False
    assert j1.title == "Senior Angular Frontend Developer"
    assert j1.company == "Paymob Egypt"
    assert j1.raw_location == "Maadi, Cairo, Egypt"
    assert j1.workplace_type == WorkplaceType.HYBRID
    assert j1.seniority == SeniorityLevel.SENIOR
    assert j1.employment_type == EmploymentType.FULL_TIME
    assert j1.published_at is not None and j1.published_at.year == 2026
    assert "Angular" in j1.required_skills and "TypeScript" in j1.required_skills
    assert j1.original_application_url.startswith("https://wuzzuf.net/jobs/p/")

    j2 = by_id["wuzzuf-uuid-2"]
    assert j2.workplace_type == WorkplaceType.REMOTE
    assert j2.seniority == SeniorityLevel.JUNIOR

    j3 = by_id["wuzzuf-uuid-3"]
    assert j3.workplace_type == WorkplaceType.ON_SITE
    assert j3.seniority == SeniorityLevel.INTERNSHIP
    assert j3.employment_type == EmploymentType.INTERNSHIP


@pytest.mark.asyncio
@respx.mock
async def test_wuzzuf_adapter_bounds_pagination_to_2_pages_40_jobs_per_query():
    """Verify WuzzufAdapter never requests more than 2 pages / 40 jobs per query."""
    from src.sources.wuzzuf import WuzzufAdapter

    companies = {"1": {"id": "1", "type": "company", "attributes": {"name": "TechEg"}}}

    def make_batch(prefix: str, count: int) -> list[dict]:
        return [
            {
                "id": f"{prefix}-{i}",
                "type": "job",
                "attributes": {
                    "title": f"Frontend Dev {prefix}-{i}",
                    "description": "<p>Angular</p>",
                    "uri": f"jobs/p/{prefix}-{i}",
                    "postedAt": "11/25/2026 10:00:00",
                    "workplaceArrangement": {"displayedName": "Hybrid"},
                    "location": {"country": {"name": "Egypt", "code": "EG"}, "city": {"name": "Cairo"}},
                    "keywords": [{"name": "Angular"}],
                },
                "relationships": {"company": {"data": {"id": "1", "type": "company"}}},
            }
            for i in range(count)
        ]

    fe_route = respx.get("https://wuzzuf.net/a/Frontend-Jobs-in-Egypt").mock(
        side_effect=[
            httpx.Response(200, text=_build_wuzzuf_ssr_html("/a/Frontend-Jobs-in-Egypt", make_batch("fe0", 20), companies, total_count=120)),
            httpx.Response(200, text=_build_wuzzuf_ssr_html("/a/Frontend-Jobs-in-Egypt?start=1", make_batch("fe1", 25), companies, total_count=120)),
        ]
    )
    ang_route = respx.get("https://wuzzuf.net/a/Angular-Jobs-in-Egypt").mock(
        side_effect=[
            httpx.Response(200, text=_build_wuzzuf_ssr_html("/a/Angular-Jobs-in-Egypt", make_batch("ng0", 20), companies, total_count=80)),
            httpx.Response(200, text=_build_wuzzuf_ssr_html("/a/Angular-Jobs-in-Egypt?start=1", make_batch("ng1", 20), companies, total_count=80)),
        ]
    )

    adapter = WuzzufAdapter(http_client=ResilientHttpClient(max_retries=1))
    try:
        raw_jobs = await adapter.fetch_jobs()
    finally:
        await adapter.http_client.close()

    assert fe_route.call_count == 2
    assert ang_route.call_count == 2
    # Bounded to 40 per query -> 80 max across 2 queries
    assert len(raw_jobs) == 80


@pytest.mark.asyncio
@respx.mock
async def test_wuzzuf_adapter_graceful_fallback_on_403_500_or_changed_markup(monkeypatch):
    """Verify WuzzufAdapter returns [] gracefully on HTTP 403 Cloudflare (without Serper), HTTP 500, or changed HTML."""
    from src.sources.wuzzuf import WuzzufAdapter

    monkeypatch.setattr(settings, "SERPER_API_KEY", None)
    monkeypatch.setattr(settings, "SOCIAL_SEARCH_API_KEY", None)

    respx.get("https://wuzzuf.net/a/Frontend-Jobs-in-Egypt").mock(
        return_value=httpx.Response(403, text="<html><title>Just a moment...</title></html>")
    )
    respx.get("https://wuzzuf.net/a/Angular-Jobs-in-Egypt").mock(
        return_value=httpx.Response(500, text="Server Error")
    )

    adapter = WuzzufAdapter(http_client=ResilientHttpClient(max_retries=1))
    try:
        assert await adapter.fetch_jobs() == []
    finally:
        await adapter.http_client.close()

    # Changed HTML without initialStoreState
    respx.get("https://wuzzuf.net/a/Frontend-Jobs-in-Egypt").mock(
        return_value=httpx.Response(200, text="<html><body>No store state anymore</body></html>")
    )
    respx.get("https://wuzzuf.net/a/Angular-Jobs-in-Egypt").mock(
        return_value=httpx.Response(200, text="<html><body>Changed layout</body></html>")
    )
    adapter2 = WuzzufAdapter(http_client=ResilientHttpClient(max_retries=1))
    try:
        assert await adapter2.fetch_jobs() == []
    finally:
        await adapter2.http_client.close()


@pytest.mark.asyncio
async def test_wuzzuf_serper_fallback_on_403_normal_mode_and_url_validation(monkeypatch):
    """When Wuzzuf SSR returns HTTP 403 and SERPER_API_KEY is set, run <= 2 Serper queries with strict URL validation."""
    from src.sources.wuzzuf import WuzzufAdapter

    monkeypatch.setattr(settings, "SERPER_API_KEY", "test-wuzzuf-serper-key")
    monkeypatch.setattr(settings, "SERPER_FRESHNESS_TBS", "qdr:d3")

    captured_serper: list[dict] = []

    def serper_handler(request: httpx.Request) -> httpx.Response:
        assert request.headers.get("X-API-KEY") == "test-wuzzuf-serper-key"
        body = json.loads(request.content.decode("utf-8"))
        captured_serper.append(body)
        return httpx.Response(
            200,
            json={
                "organic": [
                    {
                        "title": "Frontend Developer job at Paymob in Cairo - Wuzzuf",
                        "link": "https://wuzzuf.net/jobs/p/xyz123-frontend-developer-paymob-cairo-egypt?utm_source=google",
                        "snippet": "Build Angular and TypeScript fintech apps in Maadi, Cairo. Hybrid role. 2 days ago.",
                        "date": "2 days ago",
                    },
                    {
                        "title": "Junior Angular Developer job at Integrant in Alexandria - Wuzzuf",
                        "link": "https://wuzzuf.net/jobs/p/abc999-junior-angular-integrant-alexandria-egypt",
                        "snippet": "Looking for Junior Angular Frontend engineer.",
                        "date": "1 day ago",
                    },
                    # Spoofed / non-job / SSRF URLs that must be dropped
                    {
                        "title": "Spoofed Subdomain",
                        "link": "https://wuzzuf.net.evil.com/jobs/p/fake1",
                        "snippet": "Angular Cairo",
                    },
                    {
                        "title": "Open Redirect",
                        "link": "https://evil.com/?next=https://wuzzuf.net/jobs/p/fake2",
                        "snippet": "Angular Cairo",
                    },
                    {
                        "title": "Userinfo Phish",
                        "link": "https://wuzzuf.net@evil.com/jobs/p/fake3",
                        "snippet": "Angular Cairo",
                    },
                    {
                        "title": "Category Browse Page Not Job Post",
                        "link": "https://wuzzuf.net/a/Frontend-Jobs-in-Egypt",
                        "snippet": "Frontend jobs list",
                    },
                    {
                        "title": "Loopback SSRF",
                        "link": "http://127.0.0.1/jobs/p/internal",
                        "snippet": "Angular",
                    },
                    {
                        "title": "XSS Scheme",
                        "link": "javascript:alert(1)",
                        "snippet": "Angular",
                    },
                ]
            },
        )

    with respx.mock(assert_all_called=True) as mock_router:
        mock_router.get("https://wuzzuf.net/a/Frontend-Jobs-in-Egypt").mock(
            return_value=httpx.Response(403, text="<html><title>Just a moment...</title></html>")
        )
        mock_router.get("https://wuzzuf.net/a/Angular-Jobs-in-Egypt").mock(
            return_value=httpx.Response(403, text="<html><title>Just a moment...</title></html>")
        )
        mock_router.post("https://google.serper.dev/search").mock(side_effect=serper_handler)

        adapter = WuzzufAdapter(http_client=ResilientHttpClient(max_retries=1))
        try:
            raw_jobs = await adapter.fetch_jobs()
        finally:
            await adapter.http_client.close()

    assert 1 <= len(captured_serper) <= 2
    assert len(captured_serper) == 2
    for payload in captured_serper:
        assert payload.get("tbs") == "qdr:d3"
        assert "site:wuzzuf.net/jobs/p" in payload.get("q", "")

    # Deduplicated across 2 queries -> only 2 valid /jobs/p/ URLs
    assert len(raw_jobs) == 2
    norms = [adapter.normalize(rj) for rj in raw_jobs]

    first = norms[0]
    assert first.source_name == "wuzzuf"
    assert first.is_social_post is False
    assert first.title == "Frontend Developer"
    assert first.company == "Paymob"
    assert first.raw_location == "Cairo"
    assert first.country_codes == ["EG"]
    assert first.eligible_countries == ["EG"]
    assert first.raw_payload.get("origin_board") == "Wuzzuf"
    assert first.raw_payload.get("fetch_via") == "serper_fallback"
    assert first.raw_payload.get("is_social_post") is False
    assert first.workplace_type == WorkplaceType.HYBRID
    assert "Angular" in first.required_skills and "TypeScript" in first.required_skills
    assert first.source_job_id

    second = norms[1]
    assert second.title == "Junior Angular Developer"
    assert second.company == "Integrant"
    assert second.raw_location == "Alexandria"
    assert second.seniority == SeniorityLevel.JUNIOR
    assert second.raw_payload.get("fetch_via") == "serper_fallback"


@pytest.mark.asyncio
async def test_wuzzuf_serper_fallback_fast_mode_uses_1_query_and_qdr_d(monkeypatch):
    """When WAF blocks SSR in fast_mode=True, WuzzufAdapter runs at most 1 Serper query with tbs=qdr:d."""
    from src.sources.wuzzuf import WuzzufAdapter

    monkeypatch.setattr(settings, "SERPER_API_KEY", "test-wuzzuf-fast-key")
    monkeypatch.setattr(settings, "SERPER_FRESHNESS_TBS", "qdr:d3")

    captured_serper: list[dict] = []

    def serper_handler(request: httpx.Request) -> httpx.Response:
        captured_serper.append(json.loads(request.content.decode("utf-8")))
        return httpx.Response(
            200,
            json={
                "organic": [
                    {
                        "title": "Angular Engineer at Tamara in Remote - Wuzzuf",
                        "link": "https://wuzzuf.net/jobs/p/fast777-angular-engineer-tamara-egypt",
                        "snippet": "Remote Angular & TypeScript role open to Egypt candidates. 3 hours ago.",
                        "date": "3 hours ago",
                    }
                ]
            },
        )

    with respx.mock(assert_all_called=True) as mock_router:
        # HTTP 200 Cloudflare challenge -> 0 jobs due to WAF block
        mock_router.get("https://wuzzuf.net/a/Frontend-Jobs-in-Egypt").mock(
            return_value=httpx.Response(
                200,
                text="<html><head><title>Just a moment...</title></head><body>challenges.cloudflare.com</body></html>",
            )
        )
        mock_router.get("https://wuzzuf.net/a/Angular-Jobs-in-Egypt").mock(
            return_value=httpx.Response(403, text="Forbidden")
        )
        mock_router.post("https://google.serper.dev/search").mock(side_effect=serper_handler)

        adapter = WuzzufAdapter(http_client=ResilientHttpClient(max_retries=1))
        try:
            raw_jobs = await adapter.fetch_jobs(fast_mode=True)
        finally:
            await adapter.http_client.close()

    assert len(captured_serper) == 1
    assert captured_serper[0].get("tbs") == "qdr:d"
    assert "site:wuzzuf.net/jobs/p" in captured_serper[0].get("q", "")
    assert len(raw_jobs) == 1

    norm = adapter.normalize(raw_jobs[0])
    assert norm.source_name == "wuzzuf"
    assert norm.is_social_post is False
    assert norm.raw_payload.get("origin_board") == "Wuzzuf"
    assert norm.raw_payload.get("fetch_via") == "serper_fallback"
    assert norm.title == "Angular Engineer"
    assert norm.company == "Tamara"
    assert norm.workplace_type == WorkplaceType.REMOTE


@pytest.mark.asyncio
async def test_wuzzuf_skips_serper_when_ssr_succeeds_or_api_key_missing(monkeypatch):
    """Verify Serper is NOT called when SSR yields jobs, and 403 without SERPER_API_KEY makes zero Serper calls."""
    from src.sources.wuzzuf import WuzzufAdapter

    companies = {"1": {"id": "1", "type": "company", "attributes": {"name": "Paymob"}}}
    sample_job = [
        {
            "id": "ssr-1",
            "type": "job",
            "attributes": {
                "title": "Frontend Developer",
                "uri": "jobs/p/ssr-1-frontend",
                "postedAt": "11/25/2026 12:00:00",
                "location": {"country": {"name": "Egypt", "code": "EG"}, "city": {"name": "Cairo"}},
                "keywords": [{"name": "Angular"}],
            },
            "relationships": {"company": {"data": {"id": "1", "type": "company"}}},
        }
    ]

    # Case 1: SSR succeeds even with SERPER_API_KEY configured -> 0 Serper calls
    monkeypatch.setattr(settings, "SERPER_API_KEY", "should-not-be-used")
    with respx.mock(assert_all_called=False) as mock_router:
        mock_router.get("https://wuzzuf.net/a/Frontend-Jobs-in-Egypt").mock(
            return_value=httpx.Response(
                200,
                text=_build_wuzzuf_ssr_html("/a/Frontend-Jobs-in-Egypt", sample_job, companies, total_count=1),
            )
        )
        mock_router.get("https://wuzzuf.net/a/Angular-Jobs-in-Egypt").mock(
            return_value=httpx.Response(403, text="Forbidden")
        )
        serper_route = mock_router.post("https://google.serper.dev/search").mock(
            return_value=httpx.Response(200, json={"organic": []})
        )

        adapter = WuzzufAdapter(http_client=ResilientHttpClient(max_retries=1))
        try:
            raw_jobs = await adapter.fetch_jobs()
        finally:
            await adapter.http_client.close()

        assert len(raw_jobs) == 1
        assert not serper_route.called

    # Case 2: SSR 403 with missing SERPER_API_KEY -> 0 Serper calls, returns []
    monkeypatch.setattr(settings, "SERPER_API_KEY", "")
    with respx.mock(assert_all_called=False) as mock_router:
        mock_router.get("https://wuzzuf.net/a/Frontend-Jobs-in-Egypt").mock(
            return_value=httpx.Response(403, text="Blocked")
        )
        mock_router.get("https://wuzzuf.net/a/Angular-Jobs-in-Egypt").mock(
            return_value=httpx.Response(403, text="Blocked")
        )
        serper_route2 = mock_router.post("https://google.serper.dev/search").mock(
            return_value=httpx.Response(200, json={"organic": []})
        )

        adapter2 = WuzzufAdapter(http_client=ResilientHttpClient(max_retries=1))
        try:
            raw_jobs2 = await adapter2.fetch_jobs()
        finally:
            await adapter2.http_client.close()

        assert raw_jobs2 == []
        assert not serper_route2.called


# ---------------------------------------------------------------------------
# 3. Global ATS Dorking Adapter Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_ats_dork_returns_empty_cleanly_when_api_key_missing(monkeypatch):
    """Verify GlobalAtsDorkAdapter skips cleanly and makes zero requests when SERPER_API_KEY is missing."""
    from src.sources.ats_dork import GlobalAtsDorkAdapter

    monkeypatch.setattr(settings, "SERPER_API_KEY", "")
    monkeypatch.setattr(settings, "SOCIAL_SEARCH_API_KEY", "")

    with respx.mock(assert_all_called=False) as mock_router:
        serper_route = mock_router.post("https://google.serper.dev/search").mock(
            return_value=httpx.Response(200, json={"organic": []})
        )
        adapter = GlobalAtsDorkAdapter(http_client=ResilientHttpClient(max_retries=1))
        try:
            items = await adapter.fetch_jobs()
            assert items == []
            assert not serper_route.called
        finally:
            await adapter.http_client.close()


@pytest.mark.asyncio
@respx.mock
async def test_ats_dork_query_matrix_tbs_and_strict_hostname_allowlist(monkeypatch):
    """Verify GlobalAtsDorkAdapter sends tbs freshness, enforces ATS domain allowlist + is_safe_url, and emits NormalizedJobData."""
    from src.sources.ats_dork import GlobalAtsDorkAdapter

    captured_requests = []

    def serper_handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content.decode("utf-8"))
        captured_requests.append(body)
        return httpx.Response(
            200,
            json={
                "organic": [
                    {
                        "title": "Senior Angular Engineer at Linear",
                        "link": "https://jobs.ashbyhq.com/linear/1111-2222-3333?utm_source=google",
                        "snippet": "Remote - EMEA / Worldwide. Angular and TypeScript.",
                        "date": "2 days ago",
                    },
                    {
                        "title": "Tamara - Frontend Engineer (Angular)",
                        "link": "https://boards.greenhouse.io/tamara/jobs/998877",
                        "snippet": "Remote - Dubai, UAE / Saudi Arabia GCC.",
                    },
                    {
                        "title": "Frontend Developer | Lever",
                        "link": "https://jobs.lever.co/paymob-eg/abcd-efgh",
                        "snippet": "Cairo, Egypt - Hybrid frontend role.",
                    },
                    {
                        "title": "Angular Developer at Integrant",
                        "link": "https://apply.workable.com/integrant/j/A1B2C3D4/",
                        "snippet": "Cairo, Egypt - On-site / Hybrid.",
                    },
                    {
                        "title": "Frontend Engineer - Acme Cloud",
                        "link": "https://acme-cloud.breezy.hr/p/12345-frontend-engineer",
                        "snippet": "Remote Worldwide TypeScript React Angular.",
                    },
                    {
                        "title": "Senior Frontend Engineer at Foodics",
                        "link": "https://jobs.smartrecruiters.com/Foodics/744000123-senior-frontend-engineer",
                        "snippet": "Remote - Riyadh, Saudi Arabia.",
                    },
                    # Spoofed / lookalike / unsafe URLs that MUST be rejected
                    {
                        "title": "Spoofed Ashby",
                        "link": "https://evil-ashbyhq.com/linear/999",
                        "snippet": "Frontend Angular",
                    },
                    {
                        "title": "Subdomain Spoof",
                        "link": "https://boards.greenhouse.io.evil.com/tamara/jobs/123",
                        "snippet": "Frontend Angular",
                    },
                    {
                        "title": "Open Redirect Spoof",
                        "link": "https://evil.com/?next=https://jobs.lever.co/co/1",
                        "snippet": "Frontend Angular",
                    },
                    {
                        "title": "Userinfo Spoof",
                        "link": "https://jobs.lever.co@evil.com/co/1",
                        "snippet": "Frontend Angular",
                    },
                    {
                        "title": "Private IP SSRF",
                        "link": "http://127.0.0.1/boards.greenhouse.io/1",
                        "snippet": "Frontend Angular",
                    },
                ]
            },
        )

    respx.post("https://google.serper.dev/search").mock(side_effect=serper_handler)
    monkeypatch.setattr(settings, "SERPER_API_KEY", "test-ats-key")
    monkeypatch.setattr(settings, "SERPER_FRESHNESS_TBS", "qdr:d3")

    adapter = GlobalAtsDorkAdapter(http_client=ResilientHttpClient(max_retries=1))
    try:
        raw_jobs = await adapter.fetch_jobs()
    finally:
        await adapter.http_client.close()

    # 3-4 compact queries
    assert 3 <= len(captured_requests) <= 4
    for req in captured_requests:
        assert req.get("tbs") == "qdr:d3"
        assert "site:jobs.ashbyhq.com" in req["q"]
        assert "site:jobs.smartrecruiters.com" in req["q"]

    # Exactly the 6 valid ATS links survive (deduplicated across queries, 5 spoofed rejected)
    assert len(raw_jobs) == 6
    accepted_hosts = {urlparse(r.source_url).hostname for r in raw_jobs}
    assert accepted_hosts == {
        "jobs.ashbyhq.com",
        "boards.greenhouse.io",
        "jobs.lever.co",
        "apply.workable.com",
        "acme-cloud.breezy.hr",
        "jobs.smartrecruiters.com",
    }

    norms = [adapter.normalize(rj) for rj in raw_jobs]
    for norm in norms:
        assert norm.source_name == "ats_dork"
        assert norm.is_social_post is False
        assert len(norm.source_job_id) >= 16

    by_host = {urlparse(n.source_url).hostname: n for n in norms}
    assert by_host["jobs.ashbyhq.com"].company == "Linear"
    assert by_host["jobs.ashbyhq.com"].title == "Senior Angular Engineer"
    assert by_host["jobs.ashbyhq.com"].workplace_type == WorkplaceType.REMOTE
    assert "utm_source" not in by_host["jobs.ashbyhq.com"].canonical_url

    assert by_host["boards.greenhouse.io"].company == "Tamara"
    assert by_host["boards.greenhouse.io"].workplace_type == WorkplaceType.REMOTE

    assert "Paymob" in by_host["jobs.lever.co"].company
    assert by_host["jobs.lever.co"].workplace_type == WorkplaceType.HYBRID
    assert "Cairo" in (by_host["jobs.lever.co"].raw_location or "")

    assert by_host["apply.workable.com"].company == "Integrant"
    assert by_host["acme-cloud.breezy.hr"].company == "Acme Cloud"
    assert by_host["jobs.smartrecruiters.com"].company == "Foodics"


@pytest.mark.asyncio
@respx.mock
async def test_ats_dork_handles_serper_http_errors_gracefully(monkeypatch):
    """Verify GlobalAtsDorkAdapter returns [] without crashing on HTTP 429/500 responses."""
    from src.sources.ats_dork import GlobalAtsDorkAdapter

    respx.post("https://google.serper.dev/search").mock(
        return_value=httpx.Response(500, text="Internal error")
    )
    monkeypatch.setattr(settings, "SERPER_API_KEY", "test-ats-key")

    adapter = GlobalAtsDorkAdapter(http_client=ResilientHttpClient(max_retries=1))
    try:
        assert await adapter.fetch_jobs() == []
    finally:
        await adapter.http_client.close()


# ---------------------------------------------------------------------------
# 4. Config Flags, Registry & Telegram Direct Contact Formatting Tests
# ---------------------------------------------------------------------------


def test_phase1_config_defaults_and_registry_registration(monkeypatch):
    """Verify new config flags default cleanly and SourceRegistry gates WuzzufAdapter & GlobalAtsDorkAdapter."""
    from src.sources.registry import create_default_registry

    monkeypatch.delenv("WUZZUF_ENABLED", raising=False)
    monkeypatch.delenv("ATS_DORK_ENABLED", raising=False)
    monkeypatch.delenv("SERPER_FRESHNESS_TBS", raising=False)
    fresh = Settings(_env_file=None)
    assert fresh.WUZZUF_ENABLED is True
    assert fresh.ATS_DORK_ENABLED is True
    assert fresh.SERPER_FRESHNESS_TBS == "qdr:d3"

    monkeypatch.setattr(settings, "WUZZUF_ENABLED", True)
    monkeypatch.setattr(settings, "ATS_DORK_ENABLED", True)
    reg_enabled = create_default_registry()
    assert reg_enabled.get("wuzzuf") is not None
    assert reg_enabled.get("ats_dork") is not None

    monkeypatch.setattr(settings, "WUZZUF_ENABLED", False)
    monkeypatch.setattr(settings, "ATS_DORK_ENABLED", False)
    reg_disabled = create_default_registry()
    assert reg_disabled.get("wuzzuf") is None
    assert reg_disabled.get("ats_dork") is None


def test_format_job_card_renders_and_escapes_direct_contacts():
    """Verify format_job_card renders HTML-escaped direct_email, whatsapp_contact, and apply_form_url."""
    job = Job(
        id=99,
        source_name="linkedin_social",
        source_job_id="post-contact-1",
        source_url="https://www.linkedin.com/posts/hr_hiring-1",
        canonical_url_hash="hashcontact1",
        original_application_url="https://www.linkedin.com/posts/hr_hiring-1",
        company="Paymob",
        title="Angular Frontend Developer",
        description_text="Hiring Angular Developer in Cairo.",
        raw_location="Cairo, Egypt",
        workplace_type=WorkplaceType.HYBRID,
        seniority=SeniorityLevel.JUNIOR,
        employment_type=EmploymentType.FULL_TIME,
        eligibility=GeographicEligibility.EGYPT_ELIGIBLE,
        match_score=91.0,
        required_skills=["Angular", "TypeScript"],
        first_seen_at=datetime.now(UTC),
        raw_payload={
            "is_social_post": True,
            "opportunity_segment": "EGYPT",
            "direct_email": "hr+<script>alert(1)</script>@paymob.eg",
            "whatsapp_contact": "https://wa.me/201001234567",
            "apply_form_url": 'https://forms.gle/abc" onclick="alert(1)',
        },
    )

    card = format_job_card(job)
    assert "&lt;script&gt;alert(1)&lt;/script&gt;" in card
    assert "<script>" not in card
    assert "https://wa.me/201001234567" in card
    assert 'onclick="alert(1)' not in card
    assert "&quot;" in card
    assert "forms.gle" in card

    # Unsafe javascript: apply_form_url must never produce a clickable href
    job_unsafe = Job(
        id=100,
        source_name="linkedin_social",
        source_job_id="post-contact-2",
        source_url="https://www.linkedin.com/posts/hr_hiring-2",
        canonical_url_hash="hashcontact2",
        original_application_url="https://www.linkedin.com/posts/hr_hiring-2",
        company="Paymob",
        title="Angular Developer",
        description_text="Hiring",
        raw_location="Cairo, Egypt",
        workplace_type=WorkplaceType.HYBRID,
        eligibility=GeographicEligibility.EGYPT_ELIGIBLE,
        match_score=85.0,
        first_seen_at=datetime.now(UTC),
        raw_payload={
            "is_social_post": True,
            "opportunity_segment": "EGYPT",
            "apply_form_url": "javascript:alert(1)",
        },
    )
    unsafe_card = format_job_card(job_unsafe)
    assert 'href="javascript:alert(1)"' not in unsafe_card
