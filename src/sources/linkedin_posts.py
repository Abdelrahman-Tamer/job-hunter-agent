"""LinkedIn Social Hiring Post discovery adapter.

Discovers authentic Frontend Engineering hiring announcements and recruiter posts
from LinkedIn (site:linkedin.com/posts, linkedin.com/feed/update) and similar social feeds
using compliant, ToS-safe indexed search queries and public syndication feeds.

Guarantees:
- Zero credential or cookie requirements (100% public & ToS-compliant).
- Strict hiring intent filtering: Rejects job-seeker posts (#OpenToWork, portfolio promo).
- Strict frontend domain filtering: Rejects backend, mobile, data, and devops posts.
- Graceful error isolation: Provider errors or rate limits never crash the daily pipeline.
"""

import hashlib
import json
import re
from datetime import UTC, datetime, timedelta
from typing import Any, ClassVar
from urllib.parse import parse_qs, unquote, urlparse

import httpx
from bs4 import BeautifulSoup
from dateutil import parser as date_parser

from src.core.config import settings
from src.core.logging import logger
from src.core.security import canonicalize_url, is_safe_url
from src.engine.frontend_filter import is_hiring_intent_social_post
from src.models.enums import EmploymentType, SeniorityLevel, WorkplaceType
from src.sources.base import (
    BaseSourceAdapter,
    NormalizedJobData,
    RawJobData,
    SourceMetadata,
)
from src.sources.http_client import ResilientHttpClient


class LinkedInSocialAdapter(BaseSourceAdapter):
    """
    Adapter for discovering LinkedIn social hiring posts.
    Supports multi-provider execution (Search API / Serper / SerpAPI / DuckDuckGo / Public Feeds).
    """

    MAX_QUERIES_PER_RUN: ClassVar[int] = 8
    DEFAULT_QUERIES: ClassVar[list[str]] = [
        # 1-2: English Egypt Frontend/Angular hiring posts (/posts + /feed/update)
        'site:linkedin.com/posts ("we are hiring" OR "hiring" OR "looking for") ("frontend" OR "front-end" OR "angular") ("egypt" OR "cairo" OR "alexandria")',
        'site:linkedin.com/feed/update ("we are hiring" OR "hiring" OR "looking for") ("frontend" OR "front-end" OR "angular") ("egypt" OR "cairo" OR "alexandria")',
        # 3-4: English Remote / GCC / EMEA Frontend/Angular hiring posts
        'site:linkedin.com/posts ("we are hiring" OR "hiring") ("frontend" OR "angular") ("remote" OR "emea" OR "gcc" OR "saudi" OR "dubai" OR "uae")',
        'site:linkedin.com/feed/update ("we are hiring" OR "hiring") ("frontend" OR "angular") ("remote" OR "emea" OR "gcc" OR "saudi" OR "dubai" OR "uae")',
        # 5-6: Direct-email hiring posts
        'site:linkedin.com/posts ("frontend" OR "angular") ("send your cv" OR "drop your cv" OR "hr@" OR "careers@" OR "jobs@") ("egypt" OR "cairo" OR "remote" OR "dubai" OR "riyadh")',
        'site:linkedin.com/feed/update ("frontend" OR "angular") ("send your cv" OR "drop your cv" OR "hr@" OR "careers@" OR "jobs@") ("egypt" OR "cairo" OR "remote" OR "dubai" OR "riyadh")',
        # 7-8: Arabic Egyptian/MENA hiring posts
        'site:linkedin.com/posts ("مطلوب" OR "بنوظف" OR "فرصة عمل" OR "ابعت الـ cv" OR "للتقديم") ("frontend" OR "front-end" OR "angular" OR "فرونت")',
        'site:linkedin.com/feed/update ("مطلوب" OR "بنوظف" OR "فرصة عمل" OR "ابعت الـ cv" OR "للتقديم") ("frontend" OR "front-end" OR "angular" OR "فرونت")',
    ]

    _EXCLUDED_EMAIL_LOCALS: ClassVar[set[str]] = {
        "noreply",
        "no-reply",
        "donotreply",
        "do-not-reply",
    }
    _EXCLUDED_EMAIL_EXTENSIONS: ClassVar[set[str]] = {
        "png",
        "jpg",
        "jpeg",
        "gif",
        "svg",
        "webp",
    }
    _WHATSAPP_PHONE_REGEX: ClassVar[re.Pattern[str]] = re.compile(
        r"(?:"
        r"(?:whatsapp|whats\s*app|واتساب|واتس(?:\s*اب)?)"
        r"[^\n\r]{0,30}?"
        r"(?<!\d)((?:\+?20|0020)[\s-]*0?1[0125](?:[\s-]*\d){8}|01[0125](?:[\s-]*\d){8}|(?:\+|00)(?:966|971|974|965|973|968)(?:[\s-]*\d){8,9})(?!\d)"
        r"|"
        r"(?<!\d)((?:\+?20|0020)[\s-]*0?1[0125](?:[\s-]*\d){8}|01[0125](?:[\s-]*\d){8}|(?:\+|00)(?:966|971|974|965|973|968)(?:[\s-]*\d){8,9})(?!\d)"
        r"[^\n\r]{0,20}?"
        r"(?:whatsapp|whats\s*app|واتساب|واتس(?:\s*اب)?)"
        r")",
        re.IGNORECASE,
    )

    def __init__(
        self,
        http_client: ResilientHttpClient | None = None,
        custom_queries: list[str] | None = None,
    ):
        self.http_client = http_client or ResilientHttpClient()
        self.queries = custom_queries or self.DEFAULT_QUERIES

    def source_metadata(self) -> SourceMetadata:
        return SourceMetadata(
            name="linkedin_social",
            source_type="social_post",
            base_url="https://www.linkedin.com/posts",
            doc_url="https://www.linkedin.com",
            allowed_usage_summary="Public indexed search and syndication for public hiring posts. No private session cookies used.",
            rate_limit_req_per_minute=15,
            attribution_requirement="Visibly attribute original poster and preserve direct post link intact.",
            freshness_limitations="Reflects publicly indexed social hiring posts.",
            fields_provided=["poster_name", "title", "post_url", "snippet", "location", "published_at"],
        )

    def _resolve_search_api_key(self) -> str | None:
        api_key = getattr(settings, "SOCIAL_SEARCH_API_KEY", None)
        if api_key is None:
            api_key = getattr(settings, "SERPER_API_KEY", None)
        return api_key or None

    async def health_check(self) -> bool:
        """Verify social discovery health without throwing exceptions."""
        try:
            if self._resolve_search_api_key():
                return True
            resp = await self.http_client.get("https://html.duckduckgo.com/html/", params={"q": "test"})
            return resp.status_code in (200, 302)
        except (httpx.HTTPError, ValueError) as exc:
            logger.warning(f"LinkedInSocialAdapter health check probe failed: {exc}")
            return False

    async def fetch_jobs(
        self,
        since: datetime | None = None,
        query_config: dict[str, Any] | None = None,
    ) -> list[RawJobData]:
        """Fetch raw LinkedIn hiring posts through configured search or syndication providers."""
        raw_items: list[RawJobData] = []
        seen_urls: set[str] = set()

        api_key = self._resolve_search_api_key()
        provider = getattr(settings, "SOCIAL_SEARCH_PROVIDER", "auto").lower()

        def _append_unique(items: list[RawJobData]) -> None:
            for item in items:
                canon = canonicalize_url(item.source_url)
                if canon not in seen_urls:
                    seen_urls.add(canon)
                    raw_items.append(item)

        # Strategy A: Serper / SerpAPI if configured
        if api_key and (provider in ("serper", "auto")):
            try:
                _append_unique(await self._fetch_via_serper(api_key))
            except (httpx.HTTPError, ValueError, KeyError, json.JSONDecodeError) as exc:
                logger.warning(f"Serper search provider failed: {exc}. Trying fallback.")

        # Strategy B: DuckDuckGo public search (only if provider is auto or duckduckgo)
        if not raw_items and (provider in ("duckduckgo", "auto")):
            try:
                _append_unique(await self._fetch_via_duckduckgo())
            except (httpx.HTTPError, ValueError, KeyError) as exc:
                logger.warning(f"DuckDuckGo social search failed: {exc}")

        # Strategy C: Syndicated Social RSS Feeds if configured
        feed_urls = getattr(settings, "SOCIAL_FEED_URLS", [])
        if feed_urls:
            try:
                _append_unique(await self._fetch_via_feeds(feed_urls))
            except (httpx.HTTPError, ValueError, KeyError) as exc:
                logger.warning(f"Social RSS feed ingest failed: {exc}")

        logger.info(f"LinkedInSocialAdapter discovered {len(raw_items)} raw social hiring posts.")
        return raw_items

    def _build_raw_job(
        self,
        title: str,
        snippet: str,
        link: str,
        provider: str,
        date_val: str = "",
    ) -> RawJobData:
        """Build a standardized RawJobData record for a discovered LinkedIn post."""
        return RawJobData(
            source_name="linkedin_social",
            source_job_id=self._extract_linkedin_post_id(link),
            source_url=link,
            payload={
                "title": title,
                "snippet": snippet,
                "link": link,
                "date": date_val,
                "provider": provider,
            },
        )

    @staticmethod
    def is_hiring_post(text: str) -> tuple[bool, str]:
        """Evaluate bilingual Arabic + English hiring intent vs job-seeker posts."""
        return is_hiring_intent_social_post(text)

    async def _fetch_via_serper(self, api_key: str) -> list[RawJobData]:
        """Execute Google Search queries via Serper API for LinkedIn posts."""
        results: list[RawJobData] = []
        headers = {
            "X-API-KEY": api_key,
            "Content-Type": "application/json",
        }
        freshness_tbs = getattr(settings, "SERPER_FRESHNESS_TBS", "qdr:d3")

        for q in self.queries[: self.MAX_QUERIES_PER_RUN]:
            try:
                payload_json: dict[str, Any] = {"q": q, "num": 10}
                if freshness_tbs:
                    payload_json["tbs"] = freshness_tbs
                resp = await self.http_client.post(
                    "https://google.serper.dev/search",
                    headers=headers,
                    json=payload_json,
                )
                if resp.status_code != 200:
                    logger.warning(
                        f"Serper API search query '{q}' failed with HTTP {resp.status_code}: {resp.text[:200]}"
                    )
                    continue
                data = resp.json()
                organic = data.get("organic", [])
                for entry in organic:
                    link = entry.get("link", "")
                    if not self._is_linkedin_url(link, require_post_path=True):
                        continue
                    snippet = entry.get("snippet", "")
                    title = entry.get("title", "")
                    is_hiring, _ = self.is_hiring_post(f"{title}\n{snippet}")
                    if not is_hiring:
                        continue
                    date_val = entry.get("date", "")
                    results.append(
                        self._build_raw_job(
                            title=title,
                            snippet=snippet,
                            link=link,
                            provider="serper",
                            date_val=date_val,
                        )
                    )
            except (httpx.HTTPError, ValueError, KeyError, json.JSONDecodeError) as exc:
                logger.debug(f"Serper query error for '{q}': {exc}")
        return results

    async def _fetch_via_duckduckgo(self) -> list[RawJobData]:
        """Execute public DuckDuckGo HTML search for public LinkedIn posts."""
        results: list[RawJobData] = []
        for q in self.queries[: self.MAX_QUERIES_PER_RUN]:
            try:
                resp = await self.http_client.post(
                    "https://html.duckduckgo.com/html/",
                    data={"q": q},
                    headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"},
                )
                if resp.status_code != 200:
                    continue

                soup = BeautifulSoup(resp.text, "html.parser")
                web_results = soup.select(".web-result") or soup.select(".result")
                for res in web_results:
                    a_tag = res.select_one(".result__url") or res.select_one("a.result__a")
                    snip_tag = res.select_one(".result__snippet")
                    if not a_tag:
                        continue

                    raw_href = a_tag.get("href", "")
                    actual_url = self._extract_ddg_target_url(raw_href)
                    if not actual_url or not self._is_linkedin_url(actual_url, require_post_path=True):
                        continue

                    title_text = a_tag.get_text(strip=True)
                    snippet_text = snip_tag.get_text(strip=True) if snip_tag else ""
                    is_hiring, _ = self.is_hiring_post(f"{title_text}\n{snippet_text}")
                    if not is_hiring:
                        continue

                    results.append(
                        self._build_raw_job(
                            title=title_text,
                            snippet=snippet_text,
                            link=actual_url,
                            provider="duckduckgo",
                        )
                    )
            except (httpx.HTTPError, ValueError, KeyError) as exc:
                logger.debug(f"DuckDuckGo social search failed for '{q}': {exc}")

        return results

    async def _fetch_via_feeds(self, feed_urls: list[str]) -> list[RawJobData]:
        """Fetch indexed LinkedIn updates from public RSS/Atom alerts."""
        results: list[RawJobData] = []
        import feedparser

        for feed_url in feed_urls:
            try:
                resp = await self.http_client.get(feed_url)
                if resp.status_code != 200:
                    continue
                parsed = feedparser.parse(resp.text)
                for entry in parsed.entries:
                    link = entry.get("link", "")
                    if not self._is_linkedin_url(link, require_post_path=False):
                        continue
                    title_text = entry.get("title", "")
                    snippet_text = entry.get("summary", "")
                    is_hiring, _ = self.is_hiring_post(f"{title_text}\n{snippet_text}")
                    if not is_hiring:
                        continue
                    results.append(
                        self._build_raw_job(
                            title=title_text,
                            snippet=snippet_text,
                            link=link,
                            provider="feed",
                        )
                    )
            except (httpx.HTTPError, ValueError, KeyError) as exc:
                logger.debug(f"Social feed fetch failed for {feed_url}: {exc}")
        return results

    def normalize(self, raw_job: RawJobData) -> NormalizedJobData:
        """
        Normalize a raw LinkedIn social post into standard NormalizedJobData.
        Extracts role title, poster/company name, work mode, and skills.
        """
        payload = raw_job.payload
        raw_title = payload.get("title", "")
        raw_snippet = payload.get("snippet", "")
        link = payload.get("link", raw_job.source_url)
        canonical_link = canonicalize_url(link)

        combined_text = f"{raw_title}\n{raw_snippet}".strip()

        # 1. Extract Role Title
        title = self._extract_role_title(raw_title, raw_snippet, link)

        # 2. Extract Poster / Company Name
        company = self._extract_poster_or_company(raw_title, raw_snippet, link)

        # 3. Detect Workplace Type (English + Arabic)
        workplace_type = WorkplaceType.UNKNOWN
        lower_text = combined_text.lower()
        if any(r in lower_text for r in ["remote", "work from home", "wfh", "عن بعد", "ريموت", "من المنزل", "دوام عن بعد"]):
            workplace_type = WorkplaceType.REMOTE
        elif any(h in lower_text for h in ["hybrid", "هايبرد", "هجين"]):
            workplace_type = WorkplaceType.HYBRID
        elif any(o in lower_text for o in ["on-site", "onsite", "من المقر", "من المكتب", "حضوري", "أون سايت", "اون سايت"]):
            workplace_type = WorkplaceType.ON_SITE

        # 4. Detect Location
        raw_location = self._extract_location(lower_text)

        # 5. Detect Seniority and Employment Type
        seniority = SeniorityLevel.UNKNOWN
        emp_type = EmploymentType.FULL_TIME
        if any(term in lower_text for term in ["intern", "internship", "trainee", "تدريب", "متدرب"]):
            seniority = SeniorityLevel.INTERNSHIP
            emp_type = EmploymentType.INTERNSHIP
        elif any(term in lower_text for term in ["senior", "sr.", "sr ", "lead", "staff", "سينيور"]):
            seniority = SeniorityLevel.SENIOR
        elif any(term in lower_text for term in ["junior", "jr.", "jr ", "entry level", "fresh graduate", "جونيور", "مبتدئ"]):
            seniority = SeniorityLevel.JUNIOR
        elif "mid" in lower_text:
            seniority = SeniorityLevel.MID

        # 6. Extract Skills
        skills = self._extract_skills(lower_text)

        # 7. Extract Publication Date / Relative Freshness
        published_at = self._extract_published_at(payload, combined_text)

        # 8. Extract Direct Recruiter Contacts (email, WhatsApp, application forms)
        direct_contacts = self._extract_direct_contacts(combined_text)

        return NormalizedJobData(
            source_name="linkedin_social",
            source_job_id=raw_job.source_job_id,
            source_url=link,
            canonical_url=canonical_link,
            original_application_url=link,
            company=company,
            title=title,
            description_text=combined_text,
            description_html=f"<p>{combined_text}</p>",
            raw_location=raw_location,
            workplace_type=workplace_type,
            seniority=seniority,
            employment_type=emp_type,
            required_skills=skills,
            published_at=published_at,
            is_social_post=True,
            raw_payload={
                **payload,
                **direct_contacts,
                "is_social_post": True,
                "source_category": "SOCIAL_POST",
                "extracted_title": title,
                "extracted_company": company,
            },
        )

    @classmethod
    def _extract_direct_contacts(cls, text: str) -> dict[str, str]:
        """Extract direct recruiter email, WhatsApp contact, and safe external form URL."""
        contacts: dict[str, str] = {}
        if not text:
            return contacts

        # 1. Direct recruiter email (excluding noreply/no-reply/example.com)
        for match in re.finditer(r"\b([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})\b", text):
            candidate = match.group(1).strip().rstrip(".,;:!?)")
            local, _, domain = candidate.lower().partition("@")
            tld = domain.rsplit(".", 1)[-1]
            if (
                local in cls._EXCLUDED_EMAIL_LOCALS
                or local.startswith(("noreply+", "no-reply+"))
                or domain == "example.com"
                or domain.endswith(".example.com")
                or tld in cls._EXCLUDED_EMAIL_EXTENSIONS
            ):
                continue
            contacts["direct_email"] = candidate
            break

        # 2. WhatsApp link or phone number explicitly adjacent to WhatsApp / واتساب / واتس
        wa_link_found = False
        for match in re.finditer(r"https?://[^\s<>\"')\]]+", text, re.IGNORECASE):
            url_cand = match.group(0).rstrip(".,;:!?)")
            try:
                parsed = urlparse(url_cand)
            except ValueError:
                continue
            host = (parsed.hostname or "").lower()
            if host in ("wa.me", "api.whatsapp.com") and is_safe_url(url_cand):
                contacts["whatsapp_contact"] = url_cand
                wa_link_found = True
                break

        if not wa_link_found:
            wa_phone_match = cls._WHATSAPP_PHONE_REGEX.search(text)
            if wa_phone_match:
                raw_phone = wa_phone_match.group(1) or wa_phone_match.group(2) or ""
                cleaned_phone = re.sub(r"[\s-]+", "", raw_phone).strip()
                if cleaned_phone:
                    contacts["whatsapp_contact"] = cleaned_phone

        # 3. External application form URLs validated against allowlist + is_safe_url()
        for match in re.finditer(r"https?://[^\s<>\"')\]]+", text, re.IGNORECASE):
            url_cand = match.group(0).rstrip(".,;:!?)")
            if cls._is_allowed_apply_form_url(url_cand):
                contacts["apply_form_url"] = url_cand
                break

        return contacts

    @staticmethod
    def _is_allowed_apply_form_url(url: str) -> bool:
        """Strictly validate allowed external application form hosts and SSRF safety."""
        if not url or not is_safe_url(url):
            return False
        try:
            parsed = urlparse(url)
        except ValueError:
            return False
        if parsed.scheme.lower() not in ("http", "https") or parsed.username or parsed.password:
            return False
        host = (parsed.hostname or "").lower().rstrip(".")
        if host == "forms.gle":
            return True
        if host == "docs.google.com":
            return parsed.path.startswith("/forms")
        for allowed in ("tally.so", "airtable.com", "typeform.com"):
            if host == allowed or host.endswith(f".{allowed}"):
                return True
        return False

    @staticmethod
    def _is_linkedin_url(url: str, require_post_path: bool = True) -> bool:
        """Validate LinkedIn URLs via parsed scheme, strict hostname, path, and SSRF safety."""
        if not url:
            return False
        try:
            parsed = urlparse(url)
        except ValueError:
            return False
        if parsed.scheme.lower() not in ("http", "https"):
            return False
        if parsed.username or parsed.password:
            return False
        hostname = (parsed.hostname or "").lower().rstrip(".")
        if not (hostname == "linkedin.com" or hostname.endswith(".linkedin.com")):
            return False
        if require_post_path:
            path = parsed.path or ""
            if not (path.startswith("/posts/") or path.startswith("/feed/update/")):
                return False
        return is_safe_url(url)

    def _extract_linkedin_post_id(self, url: str) -> str:
        """Extract deterministic ID from LinkedIn post URL."""
        # e.g. https://www.linkedin.com/posts/activity-7241829102910-xyz
        match = re.search(r"(activity-\d+|update/[^/?]+|posts/[^/?]+)", url)
        if match:
            return match.group(1)
        return hashlib.sha256(url.encode("utf-8")).hexdigest()[:16]

    def _extract_ddg_target_url(self, ddg_url: str) -> str | None:
        """Extract clean target URL from DuckDuckGo redirect link."""
        if not ddg_url:
            return None
        if ddg_url.startswith("//"):
            ddg_url = "https:" + ddg_url
        if ddg_url.startswith("http"):
            parsed = urlparse(ddg_url)
            qs = parse_qs(parsed.query)
            if qs.get("uddg"):
                return unquote(qs["uddg"][0])
            return ddg_url
        if ddg_url.startswith("/l/?") or "uddg=" in ddg_url:
            match = re.search(r"uddg=([^&]+)", ddg_url)
            if match:
                return unquote(match.group(1))
        return None

    def _extract_published_at(self, payload: dict[str, Any], text: str) -> datetime | None:
        """Extract or approximate published timestamp from LinkedIn Snowflake activity ID, snippet, or payload."""
        # 1. Decode LinkedIn Snowflake ID (activity-<digits>) from link / payload
        link_str = str(payload.get("link", ""))
        combined_text = f"{link_str} {payload.get('title', '')} {payload.get('snippet', '')} {text}"
        match_act = re.search(r"(?:activity-|activity:)(\d{18,20})", combined_text)
        if match_act:
            try:
                act_id = int(match_act.group(1))
                timestamp_ms = act_id >> 22
                dt = datetime.fromtimestamp(timestamp_ms / 1000.0, tz=UTC)
                if 2015 <= dt.year <= 2035:
                    return dt
            except (ValueError, TypeError, OverflowError):
                pass

        # 2. Direct structured date in payload
        raw_date = payload.get("date")
        if raw_date:
            try:
                dt = date_parser.parse(raw_date)
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=UTC)
                return dt
            except (ValueError, TypeError, OverflowError):
                pass

        # 3. Relative date in snippet or title (e.g. "3 days ago", "2 weeks ago", "1 month ago")
        now = datetime.now(UTC)
        combined_lower = combined_text.lower()
        match_rel = re.search(r"\b(\d+)\s*(hour|hr|day|week|month|year)s?\s*ago\b", combined_lower)
        if match_rel:
            val = int(match_rel.group(1))
            unit = match_rel.group(2).lower()
            if "hour" in unit or "hr" in unit:
                return now - timedelta(hours=val)
            elif "day" in unit:
                return now - timedelta(days=val)
            elif "week" in unit:
                return now - timedelta(weeks=val)
            elif "month" in unit:
                return now - timedelta(days=val * 30)
            elif "year" in unit:
                return now - timedelta(days=val * 365)

        # 4. Arabic relative dates (e.g. "منذ يومين", "منذ أسبوع", "منذ شهر")
        if "منذ" in combined_lower or "أمس" in combined_lower:
            if "منذ يومين" in combined_lower or "منذ 2 يوم" in combined_lower:
                return now - timedelta(days=2)
            elif "منذ يوم" in combined_lower or "منذ 1 يوم" in combined_lower or "أمس" in combined_lower:
                return now - timedelta(days=1)
            elif "منذ أسبوعين" in combined_lower or "منذ 2 أسبوع" in combined_lower:
                return now - timedelta(weeks=2)
            elif "منذ أسبوع" in combined_lower or "منذ 1 أسبوع" in combined_lower:
                return now - timedelta(weeks=1)
            elif "منذ شهرين" in combined_lower:
                return now - timedelta(days=60)
            elif "منذ شهر" in combined_lower:
                return now - timedelta(days=30)
            match_ar_days = re.search(r"منذ\s*(\d+)\s*يوم", combined_lower)
            if match_ar_days:
                return now - timedelta(days=int(match_ar_days.group(1)))

        return None

    GENERIC_POSTER_REJECTS: ClassVar[set[str]] = {
        "we're hiring", "we are hiring", "were hiring", "hiring", "hiring alert",
        "urgent hiring", "job opening", "job vacancy", "open position", "join our team",
        "our team", "cairo", "egypt", "riyadh", "linkedin", "the company", "remote",
        "giza", "alexandria", "saudi arabia", "dubai", "uae", "qatar", "kuwait",
        "node", "nodejs", "angular", "react", "vue", "typescript", "javascript",
        "python", "java", "docker", "kubernetes", "c#", ".net", "sql", "aws", "gcp",
    }

    def _extract_role_title(self, raw_title: str, snippet: str, link: str = "") -> str:
        """Extract or synthesize a crisp title preserving full-stack, seniority, and internships."""
        combined = f"{raw_title} {snippet} {link}"
        combined_lower = combined.lower()

        # Check seniority / internship modifier
        is_intern = any(term in combined_lower for term in ["intern", "internship", "trainee", "تدريب", "متدرب"])
        prefix = ""
        if is_intern:
            prefix = "Intern"
        elif any(sr in combined_lower for sr in ["senior", "sr.", "sr ", "lead", "staff", "سينيور"]):
            prefix = "Senior"
        elif any(jr in combined_lower for jr in ["junior", "jr.", "jr ", "entry level", "fresh", "جونيور", "مبتدئ"]):
            prefix = "Junior"

        # 1. Check for Full-Stack role signals BEFORE synthesizing pure Frontend title
        is_fullstack = any(fs in combined_lower for fs in ["fullstack", "full-stack", "full stack", "فول ستاك", "فولستاك"])
        if is_fullstack:
            tech_tag = ""
            if "angular" in combined_lower:
                tech_tag = " (Angular)"
            elif "react" in combined_lower:
                tech_tag = " (React)"
            elif "vue" in combined_lower:
                tech_tag = " (Vue)"

            if is_intern:
                return f"Full-Stack Intern{tech_tag}"
            if prefix:
                return f"{prefix} Full-Stack Developer{tech_tag}"
            return f"Full-Stack Developer{tech_tag}"

        # 2. Check for Mobile / React Native signals BEFORE synthesizing pure React title
        if "react native" in combined_lower or "react-native" in combined_lower:
            if is_intern:
                return "React Native Intern"
            if prefix:
                return f"{prefix} React Native Developer"
            return "React Native Developer"

        # 3. Check for pure backend signals BEFORE synthesizing pure frontend title
        if (
            any(be in combined_lower for be in ["backend developer", "back-end developer", "backend engineer", "back-end engineer", "مطور باك"])
            and "frontend" not in combined_lower
            and "front-end" not in combined_lower
        ):
            if prefix:
                return f"{prefix} Backend Developer"
            return "Backend Developer"

        # 4. Priority pure frontend framework extractions
        if "angular" in combined_lower and any(r in combined_lower for r in ["developer", "engineer", "lead", "intern", "مطور", "مهندس", "تدريب"]):
            if is_intern:
                return "Angular Frontend Intern"
            if prefix:
                return f"{prefix} Angular Frontend Developer"
            return "Angular Frontend Developer"

        if "react" in combined_lower and any(r in combined_lower for r in ["developer", "engineer", "lead", "intern", "مطور", "مهندس", "تدريب"]):
            if is_intern:
                return "React / Next.js Frontend Intern"
            if prefix:
                return f"{prefix} React / Next.js Frontend Engineer"
            return "React / Next.js Frontend Engineer"

        if "vue" in combined_lower and any(r in combined_lower for r in ["developer", "engineer", "lead", "intern", "مطور", "مهندس", "تدريب"]):
            if is_intern:
                return "Vue.js / Nuxt Frontend Intern"
            if prefix:
                return f"{prefix} Vue.js / Nuxt Frontend Developer"
            return "Vue.js / Nuxt Frontend Developer"

        if is_intern:
            return "Frontend Engineering Intern"

        if "ui engineer" in combined_lower or "ui developer" in combined_lower or "مهندس واجهات" in combined_lower or "مطور واجهات" in combined_lower:
            if prefix:
                return f"{prefix} UI / Frontend Engineer"
            return "UI / Frontend Engineer"

        if any(term in combined_lower for term in ["frontend", "front-end", "فرونت", "واجهات أمامية"]):
            if prefix:
                return f"{prefix} Frontend Developer"
            return "Frontend Engineer"

        # Clean fallback from headline
        clean = re.sub(r"\s*\|\s*LinkedIn.*$", "", raw_title, flags=re.IGNORECASE)
        clean = re.sub(r"^[^\w]+", "", clean).strip()
        return clean[:70] if clean else "Frontend Engineering Role"

    def _extract_poster_or_company(self, raw_title: str, snippet: str, link: str = "") -> str:
        """Extract author/company attribution from social post snippet."""
        # Check LinkedIn headline format: "Author Name on LinkedIn: 'Post text...'"
        match_author = re.search(r"^([^:]+?)\s+on LinkedIn:", raw_title, re.IGNORECASE)
        if match_author:
            cand = match_author.group(1).strip()
            if cand.lower() not in self.GENERIC_POSTER_REJECTS and not any(cand.lower().startswith(g) for g in ["we're hiring", "we are hiring", "hiring"]):
                return cand

        # Check for company markers: "at [Company]" or "for [Company]"
        combined = f"{raw_title} {snippet}"
        match_at = re.search(r"\b(?:at|for|لدى|في شركة)\s+([A-Z][A-Za-z0-9_& -]{2,25})\b", combined)
        if match_at:
            cand = match_at.group(1).strip()
            if cand.lower() not in self.GENERIC_POSTER_REJECTS:
                return cand

        # Headline before colon, but ONLY if not a generic hiring phrase
        clean = re.sub(r"\s*\|\s*LinkedIn.*$", "", raw_title, flags=re.IGNORECASE)
        if ":" in clean:
            prefix_cand = clean.split(":")[0].strip()[:40]
            if prefix_cand.lower() not in self.GENERIC_POSTER_REJECTS and not any(prefix_cand.lower().startswith(g) for g in ["we're hiring", "we are hiring", "were hiring", "hiring"]):
                return prefix_cand

        # Fallback to readable handle from LinkedIn post URL (/posts/<handle>_)
        if link:
            match_handle = re.search(r"/posts/([a-zA-Z0-9-]+?)(?:_[^/?#]+|\?|$|/)", link)
            if match_handle:
                handle = match_handle.group(1)
                handle_clean = re.sub(r"-[a-f0-9]{7,12}$", "", handle)
                words = [w.capitalize() for w in handle_clean.replace("-", " ").replace("_", " ").split() if w]
                if words:
                    handle_name = " ".join(words)
                    if handle_name.lower() not in self.GENERIC_POSTER_REJECTS:
                        return handle_name

        return "LinkedIn Hiring Network"

    def _extract_location(self, text_lower: str) -> str:
        """Extract geographic location from social post text."""
        is_remote_context = any(r in text_lower for r in ["remote", "عن بعد", "ريموت", "من المنزل", "دوام عن بعد"])
        if any(c in text_lower for c in ["cairo", "القاهرة", "smart village", "new cairo", "maadi", "nasr city"]):
            return "Cairo, Egypt"
        if any(g in text_lower for g in ["giza", "الجيزة", "6th of october", "sheikh zayed"]):
            return "Giza, Egypt"
        if any(a in text_lower for a in ["alexandria", "الإسكندرية", "الاسكندرية"]):
            return "Alexandria, Egypt"
        if any(e in text_lower for e in ["egypt", "مصر"]):
            return "Egypt"
        if any(s in text_lower for s in ["riyadh", "الرياض", "jeddah", "جدة", "dammam", "الدمام", "saudi", "ksa", "السعودية"]):
            return "Saudi Arabia (Remote)" if is_remote_context else "Saudi Arabia"
        if any(u in text_lower for u in ["dubai", "دبي", "uae", "abu dhabi", "أبوظبي", "الإمارات", "الامارات"]):
            return "UAE (Remote)" if is_remote_context else "UAE"
        if any(q in text_lower for q in ["qatar", "قطر", "doha", "الدوحة"]):
            return "Qatar (Remote)" if is_remote_context else "Qatar"
        if any(k in text_lower for k in ["kuwait", "الكويت"]):
            return "Kuwait (Remote)" if is_remote_context else "Kuwait"
        if any(b in text_lower for b in ["bahrain", "البحرين", "manama", "المنامة"]):
            return "Bahrain (Remote)" if is_remote_context else "Bahrain"
        if any(o in text_lower for o in ["oman", "عمان", "muscat", "مسقط"]):
            return "Oman (Remote)" if is_remote_context else "Oman"
        if is_remote_context:
            return "Remote"
        return "Location Unspecified"

    def _extract_skills(self, text_lower: str) -> list[str]:
        """Detect technical skills mentioned in social post."""
        known = [
            ("angular", "Angular"),
            ("react", "React"),
            ("vue", "Vue.js"),
            ("next.js", "Next.js"),
            ("nextjs", "Next.js"),
            ("nuxt", "Nuxt.js"),
            ("typescript", "TypeScript"),
            ("javascript", "JavaScript"),
            ("tailwind", "Tailwind CSS"),
            ("bootstrap", "Bootstrap"),
            ("rxjs", "RxJS"),
            ("html", "HTML5"),
            ("css", "CSS3"),
            ("rest", "REST APIs"),
        ]
        found = []
        for kw, display in known:
            if re.search(rf"\b{re.escape(kw)}\b", text_lower):
                found.append(display)
        return found
