"""LinkedIn Public Guest Jobs adapter.

Discovers fresh Frontend and Angular job listings from LinkedIn's unauthenticated
public guest jobs endpoint (`seeMoreJobPostings/search`) without cookies, credentials,
or heavy browser dependencies.
"""

import re
from datetime import datetime
from typing import Any, ClassVar
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup

from src.core.logging import logger
from src.core.security import is_safe_url
from src.models.enums import EmploymentType, SeniorityLevel, WorkplaceType
from src.sources._parsing import (
    canonical_linkedin_job_url,
    extract_linkedin_job_id_from_url,
    extract_published_at,
    extract_seniority,
    extract_skills,
    extract_workplace_type,
    is_allowed_domain_url,
)
from src.sources.base import (
    BaseSourceAdapter,
    NormalizedJobData,
    RawJobData,
    SourceMetadata,
)
from src.sources.http_client import ResilientHttpClient


class LinkedInJobsAdapter(BaseSourceAdapter):
    """Discover fresh Frontend & Angular roles via LinkedIn's public guest jobs API."""

    GUEST_SEARCH_URL: ClassVar[str] = "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search"
    ALLOWED_DOMAINS: ClassVar[tuple[str, ...]] = ("linkedin.com",)
    MAX_QUERIES_PER_RUN: ClassVar[int] = 4
    RATE_LIMIT_STATUS_CODES: ClassVar[tuple[int, ...]] = (403, 429, 999)

    DEFAULT_QUERIES: ClassVar[list[dict[str, Any]]] = [
        # 1. Frontend Developer in Egypt (last 48h)
        {"keywords": "Frontend Developer", "location": "Egypt", "f_TPR": "r172800", "start": 0},
        # 2. Angular Developer in Egypt (last 48h)
        {"keywords": "Angular Developer", "location": "Egypt", "f_TPR": "r172800", "start": 0},
        # 3. Frontend Developer in UAE (last 48h)
        {"keywords": "Frontend Developer", "location": "United Arab Emirates", "f_TPR": "r172800", "start": 0},
        # 4. Angular Remote (f_WT=2) worldwide/EMEA (last 48h)
        {"keywords": "Angular", "location": "EMEA", "f_WT": "2", "f_TPR": "r172800", "start": 0},
    ]

    _REQUEST_HEADERS: ClassVar[dict[str, str]] = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
    }
    _URN_ID_RE: ClassVar[re.Pattern[str]] = re.compile(r"urn:li:jobPosting:(\d+)")

    def __init__(
        self,
        http_client: ResilientHttpClient | None = None,
        custom_queries: list[dict[str, Any]] | None = None,
    ):
        self.http_client = http_client or ResilientHttpClient()
        self.queries = custom_queries if custom_queries is not None else [dict(q) for q in self.DEFAULT_QUERIES]

    def source_metadata(self) -> SourceMetadata:
        return SourceMetadata(
            name="linkedin_jobs",
            source_type="linkedin_jobs",
            base_url=self.GUEST_SEARCH_URL,
            doc_url="https://www.linkedin.com/jobs",
            allowed_usage_summary="Public unauthenticated LinkedIn guest job search HTML cards; zero cookies or login used.",
            rate_limit_req_per_minute=10,
            attribution_requirement="Direct link to canonical LinkedIn job view URL.",
            freshness_limitations="Bounded to last 48h via f_TPR=r172800.",
            fields_provided=["source_job_id", "title", "company", "raw_location", "published_at", "url"],
        )

    async def health_check(self) -> bool:
        """Probe LinkedIn guest endpoint connectivity without raising."""
        try:
            resp = await self.http_client.get(
                self.GUEST_SEARCH_URL,
                params=self.DEFAULT_QUERIES[0],
                headers=self._REQUEST_HEADERS,
            )
            return resp.status_code == 200 and not self._is_blocked_response(resp)
        except (httpx.HTTPError, ValueError, TimeoutError) as exc:
            logger.warning(f"LinkedInJobsAdapter health check failed: {exc}")
            return False

    async def fetch_jobs(
        self,
        since: datetime | None = None,
        query_config: dict[str, Any] | None = None,
    ) -> list[RawJobData]:
        """Fetch public LinkedIn job cards across the bounded 4-query matrix."""
        raw_jobs: list[RawJobData] = []
        seen_ids: set[str] = set()

        for query_params in self.queries[: self.MAX_QUERIES_PER_RUN]:
            try:
                resp = await self.http_client.get(
                    self.GUEST_SEARCH_URL,
                    params=query_params,
                    headers=self._REQUEST_HEADERS,
                )
            except (httpx.HTTPError, TimeoutError, ValueError) as exc:
                logger.warning(
                    "LinkedInJobsAdapter request aborted cleanly on transport/rate-limit error",
                    extra={
                        "keywords": query_params.get("keywords"),
                        "location": query_params.get("location"),
                        "collected": len(raw_jobs),
                        "error": str(exc),
                    },
                )
                break

            if resp.status_code in self.RATE_LIMIT_STATUS_CODES:
                logger.warning(
                    f"LinkedInJobsAdapter received HTTP {resp.status_code} "
                    f"(keywords={query_params.get('keywords')!r}); returning {len(raw_jobs)} collected jobs."
                )
                break

            if resp.status_code != 200:
                logger.warning(
                    f"LinkedInJobsAdapter unexpected HTTP {resp.status_code} "
                    f"(keywords={query_params.get('keywords')!r}); skipping query."
                )
                continue

            if self._is_blocked_response(resp):
                logger.warning(
                    f"LinkedInJobsAdapter detected authwall/challenge response "
                    f"(keywords={query_params.get('keywords')!r}); returning {len(raw_jobs)} collected jobs."
                )
                break

            cards = self._parse_guest_cards(resp.text)
            if not cards:
                logger.warning(
                    f"LinkedInJobsAdapter found 0 cards for keywords={query_params.get('keywords')!r} "
                    f"location={query_params.get('location')!r} (empty or changed markup)."
                )
                continue

            is_remote_filter = str(query_params.get("f_WT") or "") == "2"
            for card in cards:
                job_id = card["job_id"]
                if job_id in seen_ids:
                    continue
                seen_ids.add(job_id)

                canonical_url = card["canonical_url"]
                raw_jobs.append(
                    RawJobData(
                        source_name="linkedin_jobs",
                        source_job_id=job_id,
                        source_url=canonical_url,
                        payload={
                            "job_id": job_id,
                            "title": card["title"],
                            "company": card["company"],
                            "raw_location": card["raw_location"],
                            "published_at_raw": card["published_at_raw"],
                            "time_text": card["time_text"],
                            "canonical_url": canonical_url,
                            "raw_card_url": card["raw_card_url"],
                            "f_wt": "2" if is_remote_filter else "",
                            "query_keywords": str(query_params.get("keywords") or ""),
                        },
                    )
                )

        logger.info(f"LinkedInJobsAdapter fetched {len(raw_jobs)} unique job postings.")
        return raw_jobs

    def normalize(self, raw_job: RawJobData) -> NormalizedJobData:
        """Transform a raw LinkedIn guest card payload into NormalizedJobData."""
        payload = raw_job.payload
        job_id = str(payload.get("job_id") or raw_job.source_job_id).strip()
        canonical_url = str(payload.get("canonical_url") or canonical_linkedin_job_url(job_id)).strip()

        title = str(payload.get("title") or "Frontend Developer").strip()
        company = str(payload.get("company") or "LinkedIn Employer").strip()
        raw_location = str(payload.get("raw_location") or "").strip() or None

        loc_and_title_lower = f"{title} {raw_location or ''}".lower()
        default_wp = WorkplaceType.REMOTE if str(payload.get("f_wt") or "") == "2" else WorkplaceType.UNKNOWN
        workplace_type = extract_workplace_type(loc_and_title_lower, default=default_wp)
        remote_scope = raw_location if workplace_type == WorkplaceType.REMOTE else None

        seniority = extract_seniority(title, loc_and_title_lower)
        employment_type = (
            EmploymentType.INTERNSHIP if seniority == SeniorityLevel.INTERNSHIP else EmploymentType.FULL_TIME
        )
        skills = extract_skills(title.lower())
        published_at = extract_published_at(payload.get("published_at_raw"), str(payload.get("time_text") or ""))

        loc_suffix = f" — {raw_location}" if raw_location else ""
        description_text = f"{title} at {company}{loc_suffix}"
        country_codes = ["EG"] if (raw_location and "egypt" in raw_location.lower()) else []

        return NormalizedJobData(
            source_name="linkedin_jobs",
            source_job_id=job_id,
            source_url=canonical_url,
            canonical_url=canonical_url,
            original_application_url=canonical_url,
            company=company,
            title=title,
            description_text=description_text,
            description_html=f"<p>{description_text}</p>",
            raw_location=raw_location,
            country_codes=country_codes,
            workplace_type=workplace_type,
            remote_scope=remote_scope,
            eligible_countries=["EG"] if "EG" in country_codes else [],
            seniority=seniority,
            employment_type=employment_type,
            required_skills=skills,
            published_at=published_at,
            is_social_post=False,
            raw_payload={
                "job_id": job_id,
                "raw_card_url": payload.get("raw_card_url"),
                "published_at_raw": payload.get("published_at_raw"),
                "time_text": payload.get("time_text"),
                "is_social_post": False,
                "source_category": "JOB_BOARD",
            },
        )

    @classmethod
    def _is_valid_linkedin_job_url(cls, url: str) -> bool:
        """Strictly validate LinkedIn /jobs/view URL hostnames and SSRF safety."""
        if not is_allowed_domain_url(url, cls.ALLOWED_DOMAINS):
            return False
        path = (urlparse(url).path or "").lower()
        return "/jobs/view/" in path

    @staticmethod
    def _is_blocked_response(resp: httpx.Response) -> bool:
        final_url = str(getattr(resp, "url", "") or "").lower()
        if "/uas/login" in final_url or "/authwall" in final_url:
            return True
        sample = (resp.text or "")[:3000].lower()
        return "authwall" in sample or "sign in to linkedin" in sample

    def _extract_job_id(self, card: Any, raw_href: str) -> str | None:
        urn = str(card.get("data-entity-urn") or "").strip()
        if urn:
            urn_match = self._URN_ID_RE.search(urn)
            if urn_match:
                return urn_match.group(1)
        return extract_linkedin_job_id_from_url(raw_href)

    def _parse_guest_cards(self, html_text: str) -> list[dict[str, str]]:
        """Parse LinkedIn public guest HTML cards using verified selectors."""
        if not html_text or not html_text.strip():
            return []

        soup = BeautifulSoup(html_text, "html.parser")
        card_nodes = (
            soup.select("li div.base-card")
            or soup.select("div.base-search-card")
            or soup.select("div.base-card")
        )
        if not card_nodes:
            return []

        parsed: list[dict[str, str]] = []
        for card in card_nodes:
            link_tag = card.select_one("a.base-card__full-link") or card.select_one("a[href*='/jobs/view/']")
            raw_href = str(link_tag.get("href") or "").strip() if link_tag else ""
            if not self._is_valid_linkedin_job_url(raw_href):
                continue

            job_id = self._extract_job_id(card, raw_href)
            if not job_id:
                continue

            canonical_url = canonical_linkedin_job_url(job_id)
            if not is_safe_url(canonical_url):
                continue

            title_el = card.select_one(".base-search-card__title") or card.select_one("h3")
            company_el = card.select_one(".base-search-card__subtitle") or card.select_one("h4")
            loc_el = card.select_one(".job-search-card__location")
            time_el = card.select_one("time[datetime]") or card.select_one("time")

            title = title_el.get_text(" ", strip=True) if title_el else ""
            company = company_el.get_text(" ", strip=True) if company_el else ""
            raw_location = loc_el.get_text(" ", strip=True) if loc_el else ""
            published_at_raw = str(time_el.get("datetime") or "").strip() if time_el else ""
            time_text = time_el.get_text(" ", strip=True) if time_el else ""

            if not title:
                continue

            parsed.append(
                {
                    "job_id": job_id,
                    "title": title,
                    "company": company or "LinkedIn Employer",
                    "raw_location": raw_location,
                    "published_at_raw": published_at_raw,
                    "time_text": time_text,
                    "canonical_url": canonical_url,
                    "raw_card_url": raw_href,
                }
            )

        return parsed
