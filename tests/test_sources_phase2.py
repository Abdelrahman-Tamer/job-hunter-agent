"""Phase 2 TDD tests: LinkedIn Public Guest Jobs, Major Boards Serper Coverage, and Cross-Source Enrichment."""

import asyncio
import json
from datetime import UTC, datetime
from unittest.mock import AsyncMock
from urllib.parse import urlparse

import httpx
import pytest
import respx
from sqlalchemy import select

from src.core.config import Settings, settings
from src.engine.deduplication import compute_url_hash
from src.engine.gemini_extractor import ExtractedJobAttributes
from src.models import (
    GeographicEligibility,
    Job,
    JobTrack,
    NotificationLog,
    NotificationStatus,
    NotificationType,
    SeniorityLevel,
    Source,
    WorkplaceType,
)
from src.scheduler.runner import DailyPipelineRunner
from src.sources.base import (
    BaseSourceAdapter,
    NormalizedJobData,
    RawJobData,
    SourceMetadata,
)
from src.sources.http_client import ResilientHttpClient
from src.sources.registry import SourceRegistry

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _build_linkedin_guest_html(cards: list[dict[str, str]]) -> str:
    """Build realistic LinkedIn public guest job postings HTML snippet."""
    items_html = []
    for card in cards:
        urn_attr = f' data-entity-urn="{card["urn"]}"' if card.get("urn") else ""
        time_html = (
            f'<time class="job-search-card__listdate" datetime="{card["datetime"]}">'
            f'{card.get("time_text", "1 day ago")}</time>'
            if card.get("datetime")
            else ""
        )
        items_html.append(
            f"""
<li>
  <div class="base-card relative w-full hover:no-underline focus:no-underline base-card--link base-search-card base-search-card--link job-search-card"{urn_attr}>
    <a class="base-card__full-link absolute top-0 right-0 bottom-0 left-0 p-0 z-[2]" href="{card["href"]}">
      <span class="sr-only">{card["title"]}</span>
    </a>
    <div class="base-search-card__info">
      <h3 class="base-search-card__title">{card["title"]}</h3>
      <h4 class="base-search-card__subtitle">
        <a class="hidden-nested-link" href="https://eg.linkedin.com/company/example">{card["company"]}</a>
      </h4>
      <div class="base-search-card__metadata">
        <span class="job-search-card__location">{card["location"]}</span>
        {time_html}
      </div>
    </div>
  </div>
</li>
"""
        )
    return f"<!DOCTYPE html><html><body>{''.join(items_html)}</body></html>"


class _StubSocialAdapter(BaseSourceAdapter):
    """Deterministic in-memory social adapter for pipeline enrichment tests."""

    def __init__(self, name: str, jobs: list[NormalizedJobData]):
        self._name = name
        self._jobs = jobs

    def source_metadata(self) -> SourceMetadata:
        return SourceMetadata(
            name=self._name,
            source_type="social_post",
            base_url="https://www.linkedin.com/posts",
            doc_url="https://www.linkedin.com",
            allowed_usage_summary="Test stub",
            rate_limit_req_per_minute=30,
            attribution_requirement="Test",
            freshness_limitations="None",
            fields_provided=["title", "company"],
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
        raise ValueError(raw_job.source_job_id)


# ---------------------------------------------------------------------------
# 1. LinkedIn Public Guest Jobs Adapter Tests
# ---------------------------------------------------------------------------


def test_linkedin_jobs_query_matrix_budget_and_params():
    """Verify LinkedInJobsAdapter uses <= 4 guest queries with 48h f_TPR=r172800 and f_WT=2 remote query."""
    from src.sources.linkedin_jobs import LinkedInJobsAdapter

    adapter = LinkedInJobsAdapter()
    queries = adapter.queries
    assert 1 <= len(queries) <= 4
    assert len(queries) == 4

    for q in queries:
        assert q.get("f_TPR") == "r172800"

    keywords_locs = [(q.get("keywords", "").lower(), q.get("location", "").lower()) for q in queries]
    assert any("frontend" in kw and "egypt" in loc for kw, loc in keywords_locs)
    assert any("angular" in kw and "egypt" in loc for kw, loc in keywords_locs)
    assert any("frontend" in kw and ("united arab emirates" in loc or "saudi arabia" in loc) for kw, loc in keywords_locs)
    assert any("angular" in (q.get("keywords", "").lower()) and str(q.get("f_WT")) == "2" for q in queries)


@pytest.mark.asyncio
@respx.mock
async def test_linkedin_jobs_fetch_parses_cards_dedups_and_normalizes():
    """Verify LinkedInJobsAdapter parses HTML guest cards, deduplicates by ID, validates URLs, and normalizes."""
    from src.sources.linkedin_jobs import LinkedInJobsAdapter

    captured_params = []

    card_egypt_1 = {
        "urn": "urn:li:jobPosting:4494127569",
        "href": "https://eg.linkedin.com/jobs/view/junior-frontend-angular-developer-at-paymob-4494127569?position=1&refId=abc&trackingId=xyz",
        "title": "Junior Frontend Angular Developer",
        "company": "Paymob",
        "location": "Cairo, Cairo, Egypt",
        "datetime": "2026-11-24",
        "time_text": "1 day ago",
    }
    # Card without data-entity-urn: ID extracted from /jobs/view/<id>
    card_egypt_2 = {
        "urn": "",
        "href": "https://www.linkedin.com/jobs/view/4494999111/?trk=public_jobs_jserp-result_search-card",
        "title": "Frontend Developer (React / TypeScript)",
        "company": "Bosta",
        "location": "Giza, Egypt (Hybrid)",
        "datetime": "2026-11-25",
        "time_text": "4 hours ago",
    }
    card_remote_gcc = {
        "urn": "urn:li:jobPosting:4495000222",
        "href": "https://ae.linkedin.com/jobs/view/angular-developer-at-tamara-4495000222?position=1",
        "title": "Angular Developer",
        "company": "Tamara",
        "location": "Dubai, United Arab Emirates",
        "datetime": "2026-11-25",
        "time_text": "2 hours ago",
    }
    # Spoofed / unsafe URLs MUST be rejected
    spoof_cards = [
        {
            "urn": "urn:li:jobPosting:9990001",
            "href": "https://evil.com/jobs/view/9990001",
            "title": "Frontend Developer",
            "company": "EvilCo",
            "location": "Cairo, Egypt",
            "datetime": "2026-11-25",
        },
        {
            "urn": "urn:li:jobPosting:9990002",
            "href": "https://www.linkedin.com@evil.com/jobs/view/9990002",
            "title": "Frontend Developer",
            "company": "EvilUserinfo",
            "location": "Cairo, Egypt",
            "datetime": "2026-11-25",
        },
        {
            "urn": "urn:li:jobPosting:9990003",
            "href": "http://127.0.0.1/jobs/view/9990003",
            "title": "Frontend Developer",
            "company": "EvilLocal",
            "location": "Cairo, Egypt",
            "datetime": "2026-11-25",
        },
    ]

    def guest_handler(request: httpx.Request) -> httpx.Response:
        params = dict(request.url.params)
        captured_params.append(params)
        kw = params.get("keywords", "")
        loc = params.get("location", "")
        f_wt = params.get("f_WT", "")
        if "Frontend" in kw and "Egypt" in loc:
            return httpx.Response(200, text=_build_linkedin_guest_html([card_egypt_1, card_egypt_2, *spoof_cards]))
        if "Angular" in kw and "Egypt" in loc:
            # Overlap with card_egypt_1 -> must deduplicate!
            return httpx.Response(200, text=_build_linkedin_guest_html([card_egypt_1]))
        if str(f_wt) == "2":
            return httpx.Response(200, text=_build_linkedin_guest_html([card_remote_gcc]))
        return httpx.Response(200, text=_build_linkedin_guest_html([]))

    respx.get("https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search").mock(
        side_effect=guest_handler
    )

    adapter = LinkedInJobsAdapter(http_client=ResilientHttpClient(max_retries=1))
    try:
        raw_jobs = await adapter.fetch_jobs()
    finally:
        await adapter.http_client.close()

    assert len(captured_params) == 4
    for p in captured_params:
        assert p.get("f_TPR") == "r172800"

    assert len(raw_jobs) == 3
    norms = [adapter.normalize(rj) for rj in raw_jobs]
    by_id = {n.source_job_id: n for n in norms}

    assert set(by_id.keys()) == {"4494127569", "4494999111", "4495000222"}

    j1 = by_id["4494127569"]
    assert j1.source_name == "linkedin_jobs"
    assert j1.is_social_post is False
    assert j1.title == "Junior Frontend Angular Developer"
    assert j1.company == "Paymob"
    assert j1.raw_location == "Cairo, Cairo, Egypt"
    assert j1.canonical_url == "https://www.linkedin.com/jobs/view/4494127569/"
    assert j1.original_application_url == "https://www.linkedin.com/jobs/view/4494127569/"
    assert j1.seniority == SeniorityLevel.JUNIOR
    assert j1.published_at is not None
    assert j1.published_at.year == 2026 and j1.published_at.month == 11 and j1.published_at.day == 24
    assert "Angular" in j1.required_skills

    j2 = by_id["4494999111"]
    assert j2.workplace_type == WorkplaceType.HYBRID
    assert j2.canonical_url == "https://www.linkedin.com/jobs/view/4494999111/"

    # Card from f_WT=2 query must carry REMOTE workplace_type
    j3 = by_id["4495000222"]
    assert j3.workplace_type == WorkplaceType.REMOTE
    assert j3.canonical_url == "https://www.linkedin.com/jobs/view/4495000222/"


@pytest.mark.asyncio
@respx.mock
async def test_linkedin_jobs_graceful_fallback_on_429_999_403_timeout_and_empty_markup(monkeypatch):
    """Verify LinkedInJobsAdapter handles HTTP 429, 999, 403, timeout, and empty markup without raising."""
    from src.sources.linkedin_jobs import LinkedInJobsAdapter

    async def fast_sleep(_sec):
        return None

    monkeypatch.setattr(asyncio, "sleep", fast_sleep)

    card_ok = {
        "urn": "urn:li:jobPosting:4494127569",
        "href": "https://www.linkedin.com/jobs/view/4494127569/",
        "title": "Angular Developer",
        "company": "Paymob",
        "location": "Cairo, Egypt",
        "datetime": "2026-11-25",
    }

    # Case A: Query 1 succeeds, Query 2 returns 429 -> returns already-collected job & halts further queries
    route_a = respx.get("https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search").mock(
        side_effect=[
            httpx.Response(200, text=_build_linkedin_guest_html([card_ok])),
            httpx.Response(429, headers={"Retry-After": "1"}),
            httpx.Response(200, text=_build_linkedin_guest_html([])),
            httpx.Response(200, text=_build_linkedin_guest_html([])),
        ]
    )
    adapter_a = LinkedInJobsAdapter(http_client=ResilientHttpClient(max_retries=1))
    try:
        items_a = await adapter_a.fetch_jobs()
        assert len(items_a) == 1
        assert items_a[0].source_job_id == "4494127569"
        assert route_a.call_count == 2
    finally:
        await adapter_a.http_client.close()

    # Case B: HTTP 999
    respx.get("https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search").mock(
        return_value=httpx.Response(999, text="Request denied")
    )
    adapter_b = LinkedInJobsAdapter(http_client=ResilientHttpClient(max_retries=1))
    try:
        assert await adapter_b.fetch_jobs() == []
    finally:
        await adapter_b.http_client.close()

    # Case C: HTTP 403
    respx.get("https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search").mock(
        return_value=httpx.Response(403, text="Forbidden")
    )
    adapter_c = LinkedInJobsAdapter(http_client=ResilientHttpClient(max_retries=1))
    try:
        assert await adapter_c.fetch_jobs() == []
    finally:
        await adapter_c.http_client.close()

    # Case D: Timeout
    respx.get("https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search").mock(
        side_effect=httpx.ReadTimeout("timed out")
    )
    adapter_d = LinkedInJobsAdapter(http_client=ResilientHttpClient(max_retries=1))
    try:
        assert await adapter_d.fetch_jobs() == []
    finally:
        await adapter_d.http_client.close()

    # Case E: Changed / empty markup
    respx.get("https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search").mock(
        return_value=httpx.Response(200, text="<html><body><div>Unexpected layout</div></body></html>")
    )
    adapter_e = LinkedInJobsAdapter(http_client=ResilientHttpClient(max_retries=1))
    try:
        assert await adapter_e.fetch_jobs() == []
    finally:
        await adapter_e.http_client.close()


# ---------------------------------------------------------------------------
# 2. Major Boards Dork Adapter Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_major_boards_returns_empty_when_serper_key_missing(monkeypatch):
    """Verify MajorBoardsDorkAdapter returns [] with zero HTTP calls when SERPER_API_KEY is missing."""
    from src.sources.major_boards import MajorBoardsDorkAdapter

    monkeypatch.setattr(settings, "SERPER_API_KEY", "")
    monkeypatch.setattr(settings, "SOCIAL_SEARCH_API_KEY", "")

    with respx.mock(assert_all_called=False) as mock_router:
        serper_route = mock_router.post("https://google.serper.dev/search").mock(
            return_value=httpx.Response(200, json={"organic": []})
        )
        adapter = MajorBoardsDorkAdapter(http_client=ResilientHttpClient(max_retries=1))
        try:
            items = await adapter.fetch_jobs()
            assert items == []
            assert not serper_route.called
        finally:
            await adapter.http_client.close()


@pytest.mark.asyncio
@respx.mock
async def test_major_boards_query_matrix_tbs_allowlist_and_title_company_parsing(monkeypatch):
    """Verify MajorBoardsDorkAdapter sends tbs, validates host allowlist, and cleanly parses all 5 boards."""
    from src.sources.major_boards import MajorBoardsDorkAdapter

    captured_payloads = []

    def serper_handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content.decode("utf-8"))
        captured_payloads.append(body)
        q = body.get("q", "")

        if "indeed.com" in q:
            organic = [
                {
                    "title": "Front-End Developer - Robusta Studio - Cairo, Egypt | Indeed",
                    "link": "https://eg.indeed.com/viewjob?jk=abc123&utm_source=serper",
                    "snippet": "Hybrid frontend engineering role using Angular and TypeScript in Cairo.",
                    "date": "2 days ago",
                },
                # Spoofed hosts MUST be rejected
                {
                    "title": "Fake Indeed",
                    "link": "https://evil-indeed.com/viewjob?jk=999",
                    "snippet": "Frontend Angular",
                },
                {
                    "title": "Subdomain Spoof",
                    "link": "https://eg.indeed.com.evil.com/viewjob?jk=888",
                    "snippet": "Frontend Angular",
                },
            ]
        elif "linkedin.com/jobs/view" in q:
            organic = [
                {
                    "title": "Paymob hiring Senior Angular Developer in Cairo, Egypt | LinkedIn",
                    "link": "https://eg.linkedin.com/jobs/view/senior-angular-developer-at-paymob-4494789579?trk=public",
                    "snippet": "Build scalable web apps in Angular and RxJS. Hybrid in Cairo.",
                    "date": "1 day ago",
                },
                # Non-/jobs/view/ LinkedIn URL must be rejected
                {
                    "title": "Not a jobs/view URL",
                    "link": "https://www.linkedin.com/posts/someone_hiring-123",
                    "snippet": "Frontend Angular",
                },
                {
                    "title": "Userinfo spoof",
                    "link": "https://www.linkedin.com@evil.com/jobs/view/123",
                    "snippet": "Frontend Angular",
                },
            ]
        elif "bayt.com" in q:
            organic = [
                {
                    "title": "Angular Developer - Cairo, Egypt - Bosta | Bayt.com",
                    "link": "https://www.bayt.com/en/egypt/jobs/angular-developer-512345/",
                    "snippet": "On-site Angular and TypeScript developer role in Cairo, Egypt.",
                    "date": "3 hours ago",
                },
                {
                    "title": "Frontend Engineer (Remote) at Tamara | Glassdoor",
                    "link": "https://www.glassdoor.com/job-listing/frontend-engineer-tamara-JV_IC123.htm",
                    "snippet": "Remote - Riyadh, Saudi Arabia. React and TypeScript.",
                },
                {
                    "title": "Private IP SSRF",
                    "link": "http://127.0.0.1/bayt.com/jobs/1",
                    "snippet": "Frontend Angular",
                },
            ]
        else:
            organic = [
                {
                    "title": "Senior Frontend Engineer at Linear | Wellfound",
                    "link": "https://wellfound.com/jobs/312456-senior-frontend-engineer",
                    "snippet": "Remote EMEA startup building fast web interfaces in TypeScript and React.",
                },
                {
                    "title": "Spoofed Wellfound",
                    "link": "https://wellfound.com.attacker.org/jobs/123",
                    "snippet": "Frontend Angular",
                },
            ]

        return httpx.Response(200, json={"organic": organic})

    respx.post("https://google.serper.dev/search").mock(side_effect=serper_handler)
    monkeypatch.setattr(settings, "SERPER_API_KEY", "test-major-boards-key")
    monkeypatch.setattr(settings, "SERPER_FRESHNESS_TBS", "qdr:d3")

    adapter = MajorBoardsDorkAdapter(http_client=ResilientHttpClient(max_retries=1))
    try:
        raw_jobs = await adapter.fetch_jobs()
    finally:
        await adapter.http_client.close()

    assert 1 <= len(captured_payloads) <= 4
    assert len(captured_payloads) == 4
    joined_q = "\n".join(p["q"] for p in captured_payloads)
    assert "indeed.com" in joined_q
    assert "linkedin.com/jobs/view" in joined_q
    assert "bayt.com" in joined_q
    assert "glassdoor.com/job-listing" in joined_q
    assert "wellfound.com/jobs" in joined_q
    for p in captured_payloads:
        assert p.get("tbs") == "qdr:d3"

    # Exactly 5 valid listings survive (all 6 spoofed/invalid rejected)
    assert len(raw_jobs) == 5
    hosts = {urlparse(r.source_url).hostname for r in raw_jobs}
    assert hosts == {
        "eg.indeed.com",
        "eg.linkedin.com",
        "www.bayt.com",
        "www.glassdoor.com",
        "wellfound.com",
    }

    norms = [adapter.normalize(rj) for rj in raw_jobs]
    by_board = {n.raw_payload.get("origin_board"): n for n in norms}
    assert set(by_board.keys()) == {"Indeed", "LinkedIn Jobs", "Bayt", "Glassdoor", "Wellfound"}

    for n in norms:
        assert n.source_name == "major_boards"
        assert n.is_social_post is False
        assert len(n.source_job_id) >= 24
        # Deterministic SHA-256 hex digest check
        assert all(c in "0123456789abcdef" for c in n.source_job_id)

    indeed_job = by_board["Indeed"]
    assert indeed_job.title == "Front-End Developer"
    assert indeed_job.company == "Robusta Studio"
    assert "Cairo" in (indeed_job.raw_location or "")
    assert indeed_job.workplace_type == WorkplaceType.HYBRID

    li_job = by_board["LinkedIn Jobs"]
    assert li_job.company == "Paymob"
    assert li_job.title == "Senior Angular Developer"
    assert "Cairo" in (li_job.raw_location or "")
    assert li_job.canonical_url == "https://www.linkedin.com/jobs/view/4494789579/"

    bayt_job = by_board["Bayt"]
    assert bayt_job.title == "Angular Developer"
    assert bayt_job.company == "Bosta"
    assert "Cairo" in (bayt_job.raw_location or "")

    gd_job = by_board["Glassdoor"]
    assert gd_job.company == "Tamara"
    assert "Frontend Engineer" in gd_job.title
    assert gd_job.workplace_type == WorkplaceType.REMOTE

    wf_job = by_board["Wellfound"]
    assert wf_job.company == "Linear"
    assert wf_job.title == "Senior Frontend Engineer"
    assert wf_job.workplace_type == WorkplaceType.REMOTE


@pytest.mark.asyncio
@respx.mock
async def test_major_boards_handles_serper_http_errors_gracefully(monkeypatch):
    """Verify MajorBoardsDorkAdapter returns [] cleanly when Serper returns HTTP 500 or 429."""
    from src.sources.major_boards import MajorBoardsDorkAdapter

    async def fast_sleep(_sec):
        return None

    monkeypatch.setattr(asyncio, "sleep", fast_sleep)

    respx.post("https://google.serper.dev/search").mock(
        side_effect=[
            httpx.Response(500, text="Internal error"),
            httpx.Response(429, headers={"Retry-After": "1"}),
            httpx.Response(500, text="Internal error"),
            httpx.Response(429, headers={"Retry-After": "1"}),
        ]
    )
    monkeypatch.setattr(settings, "SERPER_API_KEY", "test-major-boards-key")

    adapter = MajorBoardsDorkAdapter(http_client=ResilientHttpClient(max_retries=1))
    try:
        assert await adapter.fetch_jobs() == []
    finally:
        await adapter.http_client.close()


# ---------------------------------------------------------------------------
# 3. Cross-Source Direct Contact Enrichment Tests (DailyPipelineRunner)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_runner_enriches_existing_job_with_direct_contacts_without_duplicate_or_renotify(db_session, monkeypatch):
    """Verify matching duplicate enriches existing Job.raw_payload, skills, & description without duplicates or re-notify."""
    monkeypatch.setattr(
        "src.scheduler.runner.scan_and_mark_expired_jobs",
        AsyncMock(return_value={"checked": 0, "expired": 0, "active": 1}),
    )
    monkeypatch.setattr(settings, "TELEGRAM_OWNER_ID", None)

    src_wuzzuf = Source(
        name="wuzzuf",
        source_type="wuzzuf",
        base_url="https://wuzzuf.net",
        doc_url="https://wuzzuf.net",
        is_enabled=True,
        attribution_text="Wuzzuf",
    )
    db_session.add(src_wuzzuf)
    await db_session.flush()

    existing_url = "https://wuzzuf.net/jobs/p/abc123-angular-frontend-developer-paymob-cairo-egypt"
    existing_job = Job(
        source_id=src_wuzzuf.id,
        source_name="wuzzuf",
        source_job_id="wuzzuf-paymob-1",
        source_url=existing_url,
        canonical_url_hash=compute_url_hash(existing_url),
        original_application_url=existing_url,
        company="Paymob",
        title="Angular Frontend Developer",
        description_text="Angular role in Cairo.",
        raw_location="Cairo, Egypt",
        workplace_type=WorkplaceType.HYBRID,
        eligibility=GeographicEligibility.EGYPT_ELIGIBLE,
        seniority=SeniorityLevel.JUNIOR,
        job_track=JobTrack.FRONTEND_EGYPT,
        opportunity_segment="EGYPT",
        is_social_post=False,
        is_active=True,
        match_score=88.0,
        required_skills=[],
        raw_payload={
            "is_social_post": False,
            "opportunity_segment": "EGYPT",
        },
    )
    db_session.add(existing_job)
    await db_session.flush()

    # Mark existing job as already notified so we verify it is NOT re-notified
    db_session.add(
        NotificationLog(
            job_id=existing_job.id,
            notification_type=NotificationType.DAILY_DIGEST,
            telegram_chat_id=123456,
            status=NotificationStatus.SENT,
        )
    )
    await db_session.commit()
    existing_job_id = existing_job.id

    # Incoming LinkedIn social post matches existing Paymob job (fuzzy company+title+location)
    social_norm = NormalizedJobData(
        source_name="linkedin_social",
        source_job_id="activity-7527705974858592256",
        source_url="https://www.linkedin.com/posts/heba-hr_hiring-angular-activity-7527705974858592256",
        canonical_url="https://www.linkedin.com/posts/heba-hr_hiring-angular-activity-7527705974858592256",
        original_application_url="https://www.linkedin.com/posts/heba-hr_hiring-angular-activity-7527705974858592256",
        company="Paymob",
        title="Angular Frontend Developer",
        description_text=(
            "We are hiring an Angular Frontend Developer at Paymob in Cairo, Egypt! "
            "Send your CV to talent@paymob.eg or message WhatsApp https://wa.me/201001234567 "
            "or submit via https://forms.gle/paymobAngular."
        ),
        raw_location="Cairo, Egypt",
        workplace_type=WorkplaceType.HYBRID,
        seniority=SeniorityLevel.JUNIOR,
        required_skills=["Angular", "TypeScript", "RxJS"],
        published_at=datetime.now(UTC),
        is_social_post=True,
        raw_payload={
            "is_social_post": True,
            "direct_email": "talent@paymob.eg",
            "whatsapp_contact": "https://wa.me/201001234567",
            "apply_form_url": "https://forms.gle/paymobAngular",
        },
    )

    registry = SourceRegistry()
    registry.register(_StubSocialAdapter("linkedin_social", [social_norm]))

    mock_tg = AsyncMock()
    mock_tg.send_message.return_value = {"ok": True, "result": {"message_id": 777}}
    mock_gemini = AsyncMock()
    mock_gemini.extract_attributes.return_value = ExtractedJobAttributes()

    runner = DailyPipelineRunner(
        registry=registry,
        telegram_client=mock_tg,
        gemini_extractor=mock_gemini,
    )
    run = await runner.execute_daily_run(db_session, force=True, target_chat_id=123456)

    assert run.jobs_new == 0
    assert run.jobs_notified == 0

    # Expire session cache to prove persistence committed cleanly to DB
    db_session.expire_all()
    all_jobs = (await db_session.execute(select(Job))).scalars().all()
    assert len(all_jobs) == 1

    refreshed = all_jobs[0]
    assert refreshed.id == existing_job_id
    assert refreshed.raw_payload.get("direct_email") == "talent@paymob.eg"
    assert refreshed.raw_payload.get("whatsapp_contact") == "https://wa.me/201001234567"
    assert refreshed.raw_payload.get("apply_form_url") == "https://forms.gle/paymobAngular"
    assert refreshed.raw_payload.get("enriched_from_source") == "linkedin_social"
    assert refreshed.required_skills == ["Angular", "TypeScript", "RxJS"]
    assert "talent@paymob.eg" in refreshed.description_text


@pytest.mark.asyncio
async def test_runner_enrichment_preserves_existing_contacts_and_fills_only_missing(db_session, monkeypatch):
    """Verify enrichment via canonical URL match does not clobber existing contact fields."""
    monkeypatch.setattr(
        "src.scheduler.runner.scan_and_mark_expired_jobs",
        AsyncMock(return_value={"checked": 0, "expired": 0, "active": 1}),
    )
    monkeypatch.setattr(settings, "TELEGRAM_OWNER_ID", None)

    src_li_jobs = Source(
        name="linkedin_jobs",
        source_type="linkedin_jobs",
        base_url="https://www.linkedin.com/jobs",
        doc_url="https://www.linkedin.com/jobs",
        is_enabled=True,
        attribution_text="LinkedIn Jobs",
    )
    db_session.add(src_li_jobs)
    await db_session.flush()

    shared_url = "https://www.linkedin.com/jobs/view/4494789579/"
    existing_job = Job(
        source_id=src_li_jobs.id,
        source_name="linkedin_jobs",
        source_job_id="4494789579",
        source_url=shared_url,
        canonical_url_hash=compute_url_hash(shared_url),
        original_application_url=shared_url,
        company="Nexus Analytica",
        title="Senior Frontend Developer",
        description_text="Detailed multi-paragraph requirements covering Angular, RxJS, NgRx, and TypeScript architecture " * 4,
        raw_location="Cairo, Egypt",
        workplace_type=WorkplaceType.HYBRID,
        eligibility=GeographicEligibility.EGYPT_ELIGIBLE,
        job_track=JobTrack.FRONTEND_EGYPT,
        opportunity_segment="EGYPT",
        is_social_post=False,
        is_active=True,
        match_score=82.0,
        required_skills=["Angular"],
        raw_payload={
            "is_social_post": False,
            "direct_email": "existing@nexus.eg",
        },
    )
    db_session.add(existing_job)
    await db_session.commit()

    incoming_norm = NormalizedJobData(
        source_name="linkedin_social",
        source_job_id="post-nexus-1",
        source_url="https://www.linkedin.com/posts/nexus_hiring-activity-7527705974858592999",
        canonical_url=shared_url,
        original_application_url=f"{shared_url}?utm_source=linkedin",
        company="Nexus Analytica",
        title="Senior Frontend Developer",
        description_text="We are hiring! Message WhatsApp +201009998887.",
        raw_location="Cairo, Egypt",
        workplace_type=WorkplaceType.HYBRID,
        required_skills=["Angular", "TypeScript"],
        published_at=datetime.now(UTC),
        is_social_post=True,
        raw_payload={
            "is_social_post": True,
            "direct_email": "overwrite-attempt@nexus.eg",
            "whatsapp_contact": "+201009998887",
        },
    )

    registry = SourceRegistry()
    registry.register(_StubSocialAdapter("linkedin_social", [incoming_norm]))
    mock_tg = AsyncMock()
    mock_tg.send_message.return_value = {"ok": True, "result": {"message_id": 1}}
    mock_gemini = AsyncMock()
    mock_gemini.extract_attributes.return_value = ExtractedJobAttributes()

    runner = DailyPipelineRunner(
        registry=registry,
        telegram_client=mock_tg,
        gemini_extractor=mock_gemini,
    )
    await runner.execute_daily_run(db_session, force=True, target_chat_id=None)

    db_session.expire_all()
    all_jobs = (await db_session.execute(select(Job))).scalars().all()
    assert len(all_jobs) == 1
    refreshed = all_jobs[0]
    assert refreshed.raw_payload["direct_email"] == "existing@nexus.eg"
    assert refreshed.raw_payload["whatsapp_contact"] == "+201009998887"
    assert refreshed.raw_payload["enriched_from_source"] == "linkedin_social"
    assert "TypeScript" in refreshed.required_skills and "Angular" in refreshed.required_skills
    assert "Detailed multi-paragraph requirements" in refreshed.description_text


# ---------------------------------------------------------------------------
# 4. Config Flags, Registry & Exports Tests
# ---------------------------------------------------------------------------


def test_phase2_config_defaults_registry_and_exports(monkeypatch):
    """Verify Phase 2 config flags default True, gate registry adapters, and export cleanly."""
    from src.sources import LinkedInJobsAdapter, MajorBoardsDorkAdapter
    from src.sources.registry import create_default_registry

    assert LinkedInJobsAdapter is not None
    assert MajorBoardsDorkAdapter is not None

    monkeypatch.delenv("LINKEDIN_JOBS_ENABLED", raising=False)
    monkeypatch.delenv("MAJOR_BOARDS_DORK_ENABLED", raising=False)
    fresh = Settings(_env_file=None)
    assert fresh.LINKEDIN_JOBS_ENABLED is True
    assert fresh.MAJOR_BOARDS_DORK_ENABLED is True

    monkeypatch.setattr(settings, "LINKEDIN_JOBS_ENABLED", True)
    monkeypatch.setattr(settings, "MAJOR_BOARDS_DORK_ENABLED", True)
    reg_on = create_default_registry()
    assert reg_on.get("linkedin_jobs") is not None
    assert reg_on.get("major_boards") is not None

    monkeypatch.setattr(settings, "LINKEDIN_JOBS_ENABLED", False)
    monkeypatch.setattr(settings, "MAJOR_BOARDS_DORK_ENABLED", False)
    reg_off = create_default_registry()
    assert reg_off.get("linkedin_jobs") is None
    assert reg_off.get("major_boards") is None
