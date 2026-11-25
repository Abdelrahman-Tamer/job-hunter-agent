"""Wuzzuf Egypt job board adapter.

Fetches fresh Frontend and Angular roles in Egypt from Wuzzuf's public SSR
browse endpoints (with JSON:API support) using ResilientHttpClient.
"""

import hashlib
import json
import re
import zoneinfo
from datetime import UTC, datetime
from typing import Any, ClassVar
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup
from dateutil import parser as date_parser

from src.core.config import settings
from src.core.logging import logger
from src.core.security import canonicalize_url
from src.models.enums import EmploymentType, SeniorityLevel, WorkplaceType
from src.sources._parsing import (
    extract_location,
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

_CAIRO_TZ = zoneinfo.ZoneInfo("Africa/Cairo")


class WuzzufAdapter(BaseSourceAdapter):
    """Adapter for discovering fresh Frontend & Angular roles on Wuzzuf Egypt."""

    BASE_URL: ClassVar[str] = "https://wuzzuf.net"
    SERPER_URL: ClassVar[str] = "https://google.serper.dev/search"
    DEFAULT_QUERIES: ClassVar[tuple[str, ...]] = ("frontend", "angular")
    QUERY_PATHS: ClassVar[dict[str, str]] = {
        "frontend": "/a/Frontend-Jobs-in-Egypt",
        "angular": "/a/Angular-Jobs-in-Egypt",
    }
    SERPER_FALLBACK_QUERIES: ClassVar[tuple[str, ...]] = (
        'site:wuzzuf.net/jobs/p ("frontend" OR "front-end" OR "angular") ("egypt" OR "cairo" OR "alexandria" OR "remote")',
        'site:wuzzuf.net/jobs/p ("angular" OR "react" OR "typescript") ("frontend" OR "web developer")',
    )
    MAX_PAGES_PER_QUERY: ClassVar[int] = 2
    MAX_JOBS_PER_QUERY: ClassVar[int] = 40
    PAGE_SIZE: ClassVar[int] = 20

    def __init__(
        self,
        http_client: ResilientHttpClient | None = None,
        queries: list[str] | tuple[str, ...] | None = None,
        fast_mode: bool = False,
    ):
        self.http_client = http_client or ResilientHttpClient()
        self.queries = list(queries) if queries else list(self.DEFAULT_QUERIES)
        self.fast_mode = fast_mode

    def source_metadata(self) -> SourceMetadata:
        return SourceMetadata(
            name="wuzzuf",
            source_type="wuzzuf",
            base_url=f"{self.BASE_URL}/a/Frontend-Jobs-in-Egypt",
            doc_url=self.BASE_URL,
            allowed_usage_summary="Public read-only Wuzzuf Egypt category listings without auth or cookies.",
            rate_limit_req_per_minute=15,
            attribution_requirement="Attributed to Wuzzuf Egypt; direct link to original Wuzzuf job page.",
            freshness_limitations="Near real-time active Egypt listings sorted newest first.",
            fields_provided=[
                "id",
                "title",
                "company",
                "location",
                "workplaceArrangement",
                "postedAt",
                "keywords",
                "description",
                "uri",
            ],
        )

    async def health_check(self) -> bool:
        """Check whether Wuzzuf public browse endpoint responds with expected SSR state."""
        url = f"{self.BASE_URL}/a/Frontend-Jobs-in-Egypt"
        try:
            resp = await self.http_client.get(url)
            return (
                resp.status_code == 200
                and not self._is_blocked_response(resp.text)
                and "initialStoreState" in resp.text
            )
        except (httpx.HTTPError, ValueError) as exc:
            logger.warning(f"Wuzzuf health check failed: {exc}")
            return False

    async def fetch_jobs(
        self,
        since: datetime | None = None,
        query_config: dict[str, Any] | None = None,
        fast_mode: bool = False,
    ) -> list[RawJobData]:
        """Fetch fresh Frontend & Angular roles in Egypt (max 2 pages / 40 jobs per query), falling back to Serper on Cloudflare/403."""
        cfg = query_config if isinstance(query_config, dict) else {}
        effective_fast = bool(fast_mode or self.fast_mode or cfg.get("fast_mode"))
        override_tbs = str(cfg.get("freshness_tbs")).strip() if cfg.get("freshness_tbs") else None

        active_queries = self.queries
        if isinstance(cfg.get("queries"), (list, tuple)):
            active_queries = [str(q).strip() for q in cfg["queries"] if str(q).strip()]

        raw_jobs: list[RawJobData] = []
        seen_ids: set[str] = set()
        seen_urls: set[str] = set()
        waf_blocked = False

        for query in active_queries:
            path = self._query_to_path(query)
            base_query_url = f"{self.BASE_URL}{path}"
            query_count = 0

            for page_idx in range(self.MAX_PAGES_PER_QUERY):
                if query_count >= self.MAX_JOBS_PER_QUERY:
                    break

                params = {"start": page_idx} if page_idx > 0 else None
                try:
                    resp = await self.http_client.get(base_query_url, params=params)
                except (httpx.HTTPError, ValueError) as exc:
                    logger.warning(
                        f"Wuzzuf request failed for query={query!r} page={page_idx}: {exc}"
                    )
                    break

                has_cf_header = "cf-mitigated" in {k.lower() for k in resp.headers}
                if resp.status_code == 403 or has_cf_header:
                    waf_blocked = True

                if resp.status_code != 200:
                    if self._is_blocked_response(resp.text):
                        waf_blocked = True
                    logger.warning(
                        f"Wuzzuf returned HTTP {resp.status_code} for query={query!r} page={page_idx}. Skipping gracefully."
                    )
                    break

                if self._is_blocked_response(resp.text):
                    waf_blocked = True
                    logger.warning(
                        f"Wuzzuf returned anti-bot/Cloudflare challenge for query={query!r} page={page_idx}. Skipping gracefully."
                    )
                    break

                parsed_items, total_count = self._extract_jobs_from_response(resp, query)
                if parsed_items is None:
                    logger.warning(
                        f"Wuzzuf markup/JSON structure changed for query={query!r} page={page_idx}. Skipping gracefully."
                    )
                    break

                if not parsed_items:
                    break

                for item in parsed_items:
                    if query_count >= self.MAX_JOBS_PER_QUERY:
                        break
                    job_id = str(item.get("id") or "").strip()
                    job_url = self._build_job_url(item.get("attributes") or {})
                    if not job_url or not self._is_valid_wuzzuf_url(job_url):
                        continue

                    canonical = canonicalize_url(job_url)
                    dedup_id = job_id or canonical
                    if dedup_id in seen_ids or canonical in seen_urls:
                        continue

                    seen_ids.add(dedup_id)
                    seen_urls.add(canonical)
                    query_count += 1

                    raw_jobs.append(
                        RawJobData(
                            source_name="wuzzuf",
                            source_job_id=dedup_id,
                            source_url=job_url,
                            payload={**item, "_query": query, "_resolved_url": job_url},
                        )
                    )

                # Stop early if all available results were already retrieved on page 0
                if total_count is not None and (page_idx + 1) * self.PAGE_SIZE >= total_count:
                    break

        if not raw_jobs and waf_blocked:
            api_key = str(getattr(settings, "SERPER_API_KEY", None) or "").strip()
            if api_key:
                fallback_jobs = await self._fetch_via_serper_fallback(
                    api_key=api_key,
                    fast_mode=effective_fast,
                    freshness_tbs=override_tbs,
                    seen_ids=seen_ids,
                    seen_urls=seen_urls,
                )
                raw_jobs.extend(fallback_jobs)
            else:
                logger.warning(
                    "Wuzzuf direct SSR was blocked (403/WAF) and SERPER_API_KEY is missing; skipping fallback."
                )

        logger.info(f"WuzzufAdapter fetched {len(raw_jobs)} unique Egypt listings.")
        return raw_jobs

    def normalize(self, raw_job: RawJobData) -> NormalizedJobData:
        """Transform a Wuzzuf SSR or Serper-fallback item into NormalizedJobData."""
        item = raw_job.payload
        if item.get("_fetch_via") == "serper_fallback":
            return self._normalize_serper_fallback(raw_job)

        attrs = item.get("attributes") or {}

        job_url = item.get("_resolved_url") or self._build_job_url(attrs) or raw_job.source_url
        canonical = canonicalize_url(job_url)

        title = str(attrs.get("title") or "Frontend Engineer").strip()
        company = self._extract_company(item, attrs)

        loc_info = attrs.get("location") or {}
        raw_location, country_codes = self._extract_location(loc_info)
        workplace_type = self._extract_workplace_type(attrs.get("workplaceArrangement"))
        remote_scope = raw_location if workplace_type == WorkplaceType.REMOTE else None

        published_at = self._parse_posted_at(attrs.get("postedAt"))
        seniority = self._extract_seniority(title, attrs.get("careerLevel"))
        employment_type = self._extract_employment_type(attrs)
        required_skills = self._extract_skills(title, attrs)

        desc_html_parts = [str(attrs.get("description") or "").strip(), str(attrs.get("requirements") or "").strip()]
        combined_html = "\n".join(p for p in desc_html_parts if p)
        desc_text = (
            BeautifulSoup(combined_html, "html.parser").get_text(separator=" ", strip=True)
            if combined_html
            else title
        )

        exp_years = None
        exp_obj = attrs.get("workExperienceYears")
        if isinstance(exp_obj, dict) and exp_obj.get("min") is not None:
            try:
                exp_years = float(exp_obj["min"])
            except (ValueError, TypeError):
                exp_years = None

        salary_min, salary_max, salary_currency = self._extract_salary(attrs)

        return NormalizedJobData(
            source_name="wuzzuf",
            source_job_id=raw_job.source_job_id,
            source_url=job_url,
            canonical_url=canonical,
            original_application_url=job_url,
            company=company,
            title=title,
            description_text=desc_text,
            description_html=combined_html or None,
            raw_location=raw_location,
            country_codes=country_codes,
            workplace_type=workplace_type,
            remote_scope=remote_scope,
            eligible_countries=["EG"] if "EG" in country_codes else [],
            seniority=seniority,
            employment_type=employment_type,
            salary_min=salary_min,
            salary_max=salary_max,
            salary_currency=salary_currency,
            salary_period="MONTHLY" if (salary_min or salary_max) else None,
            required_skills=required_skills,
            required_experience_years=exp_years,
            published_at=published_at,
            is_social_post=False,
            raw_payload={
                "id": item.get("id"),
                "uri": attrs.get("uri"),
                "query": item.get("_query"),
                "company": company,
                "is_social_post": False,
            },
        )

    @classmethod
    def _query_to_path(cls, query: str) -> str:
        key = query.strip().lower()
        if key in cls.QUERY_PATHS:
            return cls.QUERY_PATHS[key]
        slug = re.sub(r"[^a-zA-Z0-9]+", "-", query.strip()).strip("-").title()
        return f"/a/{slug}-Jobs-in-Egypt"

    @staticmethod
    def _is_blocked_response(text: str) -> bool:
        sample = (text or "")[:3000].lower()
        return (
            "<title>just a moment...</title>" in sample
            or "challenges.cloudflare.com" in sample
            or "cf-chl-" in sample
        )

    async def _fetch_via_serper_fallback(
        self,
        *,
        api_key: str,
        fast_mode: bool,
        freshness_tbs: str | None,
        seen_ids: set[str],
        seen_urls: set[str],
    ) -> list[RawJobData]:
        """Discover indexed Wuzzuf job postings via Serper when direct SSR is WAF-blocked."""
        headers = {
            "X-API-KEY": api_key,
            "Content-Type": "application/json",
        }
        max_queries = 1 if fast_mode else 2
        active_queries = self.SERPER_FALLBACK_QUERIES[:max_queries]
        tbs = freshness_tbs or ("qdr:d" if fast_mode else getattr(settings, "SERPER_FRESHNESS_TBS", "qdr:d3"))

        fallback_items: list[RawJobData] = []
        for query in active_queries:
            payload_json: dict[str, Any] = {"q": query, "num": 10}
            if tbs:
                payload_json["tbs"] = tbs

            try:
                resp = await self.http_client.post(
                    self.SERPER_URL,
                    headers=headers,
                    json=payload_json,
                )
            except (httpx.HTTPError, TimeoutError, ValueError) as exc:
                logger.warning(f"Wuzzuf Serper fallback error for query: {exc}")
                continue

            if resp.status_code != 200:
                logger.warning(
                    f"Wuzzuf Serper fallback returned HTTP {resp.status_code}: {resp.text[:200]}"
                )
                continue

            try:
                data = resp.json()
            except json.JSONDecodeError as exc:
                logger.warning(f"Wuzzuf Serper fallback returned invalid JSON: {exc}")
                continue

            for entry in data.get("organic", []):
                if not isinstance(entry, dict):
                    continue
                link = str(entry.get("link") or "").strip()
                if not self._is_valid_wuzzuf_job_url(link):
                    continue

                canonical = canonicalize_url(link)
                dedup_id = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
                if dedup_id in seen_ids or canonical in seen_urls:
                    continue

                seen_ids.add(dedup_id)
                seen_urls.add(canonical)
                fallback_items.append(
                    RawJobData(
                        source_name="wuzzuf",
                        source_job_id=dedup_id,
                        source_url=link,
                        payload={
                            "_fetch_via": "serper_fallback",
                            "_resolved_url": canonical,
                            "_query": query,
                            "title": str(entry.get("title") or "").strip(),
                            "snippet": str(entry.get("snippet") or "").strip(),
                            "link": link,
                            "date": str(entry.get("date") or "").strip(),
                        },
                    )
                )

        logger.info(
            f"WuzzufAdapter Serper fallback discovered {len(fallback_items)} verified listings "
            f"(fast_mode={fast_mode}, queries={len(active_queries)})."
        )
        return fallback_items

    def _normalize_serper_fallback(self, raw_job: RawJobData) -> NormalizedJobData:
        """Normalize a Serper-discovered Wuzzuf job listing into NormalizedJobData."""
        payload = raw_job.payload
        job_url = str(payload.get("link") or raw_job.source_url).strip()
        canonical = str(payload.get("_resolved_url") or canonicalize_url(job_url)).strip()

        raw_title = str(payload.get("title") or "").strip()
        snippet = str(payload.get("snippet") or "").strip()
        title, company, parsed_loc = self._parse_serper_title(raw_title)

        combined_text = "\n".join(p for p in (raw_title, snippet) if p).strip()
        lower_text = f"{parsed_loc or ''} {combined_text}".lower()

        workplace_type = extract_workplace_type(lower_text)
        raw_location = parsed_loc or extract_location(lower_text) or "Egypt"
        remote_scope = raw_location if workplace_type == WorkplaceType.REMOTE else None

        loc_check = f"{raw_location} {lower_text}".lower()
        has_egypt = any(
            h in loc_check
            for h in (
                "egypt",
                "cairo",
                "giza",
                "alexandria",
                "maadi",
                "nasr city",
                "new cairo",
                "smart village",
                "mansoura",
                "tanta",
                "مصر",
                "القاهرة",
            )
        )
        is_us_alexandria = "alexandria" in loc_check and any(
            us in loc_check for us in ("virginia", ", va", "usa", "united states")
        )
        country_codes = ["EG"] if (has_egypt and not is_us_alexandria) else []

        seniority = extract_seniority(title, lower_text)
        employment_type = (
            EmploymentType.INTERNSHIP if seniority == SeniorityLevel.INTERNSHIP else EmploymentType.FULL_TIME
        )
        required_skills = extract_skills(lower_text)
        published_at = extract_published_at(payload.get("date"), snippet)

        return NormalizedJobData(
            source_name="wuzzuf",
            source_job_id=raw_job.source_job_id,
            source_url=job_url,
            canonical_url=canonical,
            original_application_url=job_url,
            company=company,
            title=title,
            description_text=combined_text or title,
            description_html=f"<p>{combined_text}</p>" if combined_text else None,
            raw_location=raw_location,
            country_codes=country_codes,
            workplace_type=workplace_type,
            remote_scope=remote_scope,
            eligible_countries=["EG"] if "EG" in country_codes else [],
            seniority=seniority,
            employment_type=employment_type,
            required_skills=required_skills,
            published_at=published_at,
            is_social_post=False,
            raw_payload={
                "origin_board": "Wuzzuf",
                "fetch_via": "serper_fallback",
                "query": payload.get("_query"),
                "company": company,
                "is_social_post": False,
            },
        )

    @staticmethod
    def _parse_serper_title(raw_title: str) -> tuple[str, str, str | None]:
        """Parse (title, company, raw_location) from Wuzzuf Google search titles."""
        clean = re.sub(r"\s*[|\-–]\s*wuzzuf(?:\.net)?\s*$", "", raw_title or "", flags=re.IGNORECASE).strip()

        match_at_in = re.match(
            r"^(.+?)(?:\s+jobs?)?\s+at\s+(.+?)\s+in\s+(.+)$",
            clean,
            flags=re.IGNORECASE,
        )
        if match_at_in:
            title = match_at_in.group(1).strip() or "Frontend Engineer"
            company = match_at_in.group(2).strip() or "Wuzzuf Employer"
            loc = match_at_in.group(3).strip() or None
            return title, company, loc

        match_at = re.match(r"^(.+?)(?:\s+jobs?)?\s+at\s+(.+)$", clean, flags=re.IGNORECASE)
        if match_at:
            return (
                match_at.group(1).strip() or "Frontend Engineer",
                match_at.group(2).strip() or "Wuzzuf Employer",
                None,
            )

        match_in = re.match(r"^(.+?)\s+jobs?\s+in\s+(.+)$", clean, flags=re.IGNORECASE)
        if match_in:
            return (
                match_in.group(1).strip() or "Frontend Engineer",
                "Wuzzuf Employer",
                match_in.group(2).strip() or None,
            )

        parts = [p.strip() for p in re.split(r"\s+[-–]\s+", clean) if p.strip()]
        if len(parts) >= 3:
            return parts[0] or "Frontend Engineer", parts[1] or "Wuzzuf Employer", parts[-1] or None
        if len(parts) == 2:
            return parts[0] or "Frontend Engineer", parts[1] or "Wuzzuf Employer", None

        return clean or "Frontend Engineer", "Wuzzuf Employer", None

    @staticmethod
    def _is_valid_wuzzuf_url(url: str) -> bool:
        return is_allowed_domain_url(url, ("wuzzuf.net",))

    @classmethod
    def _is_valid_wuzzuf_job_url(cls, url: str) -> bool:
        if not cls._is_valid_wuzzuf_url(url):
            return False
        path = (urlparse(url).path or "").lower()
        return "/jobs/p/" in path

    @classmethod
    def _build_job_url(cls, attrs: dict[str, Any]) -> str:
        uri = str(attrs.get("uri") or "").strip()
        if uri:
            if uri.startswith(("http://", "https://")):
                return uri
            return urljoin(f"{cls.BASE_URL}/", uri.lstrip("/"))
        slug = str(attrs.get("slug") or "").strip()
        if slug:
            return f"{cls.BASE_URL}/jobs/p/{slug.lstrip('/')}"
        return ""

    def _extract_jobs_from_response(
        self,
        resp: httpx.Response,
        query: str,
    ) -> tuple[list[dict[str, Any]] | None, int | None]:
        """Parse Wuzzuf SSR initialStoreState or JSON:API response into enriched job dicts."""
        content_type = (resp.headers.get("content-type") or "").lower()
        if "json" in content_type:
            try:
                payload = resp.json()
            except json.JSONDecodeError:
                return None, None
            if not isinstance(payload, dict) or not isinstance(payload.get("data"), list):
                return None, None
            companies = {
                str(inc.get("id")): inc
                for inc in payload.get("included", [])
                if isinstance(inc, dict) and inc.get("type") == "company"
            }
            jobs = self._enrich_jobs(payload["data"], companies, {})
            meta = payload.get("meta") or {}
            total = meta.get("totalResultsCount") or meta.get("totalCount")
            return jobs, int(total) if isinstance(total, int) else None

        state = self._parse_initial_store_state(resp.text)
        if not isinstance(state, dict):
            return None, None

        entities = state.get("entities")
        if not isinstance(entities, dict):
            return None, None

        job_coll = (entities.get("job") or {}).get("collection")
        if not isinstance(job_coll, dict):
            return None, None

        company_coll = (entities.get("company") or {}).get("collection") or {}
        search_meta_by_id: dict[str, dict[str, Any]] = {}
        total_count: int | None = None

        browsing_sets = (state.get("browsingPage") or {}).get("sets") or {}
        if isinstance(browsing_sets, dict):
            for set_val in browsing_sets.values():
                if not isinstance(set_val, dict):
                    continue
                if isinstance(set_val.get("totalResultsCount"), int):
                    total_count = set_val["totalResultsCount"]
                res_set = set_val.get("resultsSet")
                if isinstance(res_set, dict):
                    for jid, entry in res_set.items():
                        if isinstance(entry, dict):
                            search_meta_by_id[str(jid)] = entry

        # Preserve newest-first ordering when postedAt is present
        job_items = [v for v in job_coll.values() if isinstance(v, dict)]
        job_items.sort(
            key=lambda j: self._parse_posted_at((j.get("attributes") or {}).get("postedAt")) or datetime.min.replace(tzinfo=UTC),
            reverse=True,
        )
        return self._enrich_jobs(job_items, company_coll, search_meta_by_id), total_count

    @staticmethod
    def _parse_initial_store_state(html_text: str) -> dict[str, Any] | None:
        marker = "Wuzzuf.initialStoreState"
        idx = html_text.find(marker)
        if idx == -1:
            return None
        brace_idx = html_text.find("{", idx)
        if brace_idx == -1:
            return None
        try:
            obj, _ = json.JSONDecoder().raw_decode(html_text, brace_idx)
            return obj if isinstance(obj, dict) else None
        except json.JSONDecodeError:
            return None

    @staticmethod
    def _enrich_jobs(
        jobs: list[dict[str, Any]],
        companies: dict[str, Any],
        search_meta_by_id: dict[str, dict[str, Any]],
    ) -> list[dict[str, Any]]:
        enriched: list[dict[str, Any]] = []
        for item in jobs:
            item_copy = dict(item)
            cid = str(
                (((item.get("relationships") or {}).get("company") or {}).get("data") or {}).get("id")
                or ""
            )
            if cid and cid in companies:
                comp_attrs = (companies[cid] or {}).get("attributes") or {}
                if comp_attrs.get("name"):
                    item_copy["_company_name"] = str(comp_attrs["name"]).strip()

            jid = str(item.get("id") or "")
            if "_company_name" not in item_copy and jid in search_meta_by_id:
                comp_fields = (search_meta_by_id[jid].get("attributes") or {}).get("computedFields") or []
                for cf in comp_fields:
                    if isinstance(cf, dict) and cf.get("name") == "company_name":
                        vals = cf.get("value") or []
                        if vals and str(vals[0]).strip():
                            item_copy["_company_name"] = str(vals[0]).strip()
                            break
            enriched.append(item_copy)
        return enriched

    @staticmethod
    def _extract_company(item: dict[str, Any], attrs: dict[str, Any]) -> str:
        if attrs.get("hideCompany"):
            return "Confidential Company"
        company = str(item.get("_company_name") or "").strip()
        return company or "Wuzzuf Employer"

    @staticmethod
    def _extract_location(loc_info: dict[str, Any]) -> tuple[str | None, list[str]]:
        if not isinstance(loc_info, dict):
            return "Egypt", ["EG"]
        parts: list[str] = []
        for key in ("area", "city", "country"):
            node = loc_info.get(key)
            if isinstance(node, dict):
                name = str(node.get("name") or "").strip()
                if name and name not in parts:
                    parts.append(name)

        country_node = loc_info.get("country")
        codes: list[str] = []
        if isinstance(country_node, dict) and country_node.get("code"):
            codes.append(str(country_node["code"]).upper())

        raw_location = ", ".join(parts) if parts else "Egypt"
        if not codes and "egypt" in raw_location.lower():
            codes.append("EG")
        return raw_location, codes

    @staticmethod
    def _extract_workplace_type(arrangement: Any) -> WorkplaceType:
        if not isinstance(arrangement, dict):
            return WorkplaceType.UNKNOWN
        candidates = [
            str(arrangement.get("displayedName") or ""),
            str(((arrangement.get("translations") or {}).get("displayedName") or {}).get("en") or ""),
            str(((arrangement.get("translations") or {}).get("displayed_name") or {}).get("en") or ""),
        ]
        joined = " ".join(candidates).lower()
        if "remote" in joined:
            return WorkplaceType.REMOTE
        if "hybrid" in joined:
            return WorkplaceType.HYBRID
        if "on-site" in joined or "on_site" in joined or "onsite" in joined:
            return WorkplaceType.ON_SITE
        return WorkplaceType.UNKNOWN

    @staticmethod
    def _parse_posted_at(posted_str: Any) -> datetime | None:
        if not posted_str:
            return None
        raw = str(posted_str).strip()
        try:
            # Wuzzuf uses MM/DD/YYYY HH:MM:SS in Africa/Cairo local time
            dt = datetime.strptime(raw, "%m/%d/%Y %H:%M:%S")
            return dt.replace(tzinfo=_CAIRO_TZ).astimezone(UTC)
        except ValueError:
            pass
        try:
            dt = date_parser.parse(raw, dayfirst=False)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=_CAIRO_TZ)
            return dt.astimezone(UTC)
        except (ValueError, TypeError, OverflowError):
            return None

    @staticmethod
    def _extract_seniority(title: str, career_level: Any) -> SeniorityLevel:
        title_lower = title.lower()
        level_name = ""
        if isinstance(career_level, dict):
            level_name = f"{career_level.get('name', '')} {career_level.get('hint', '')}".lower()

        if any(w in title_lower for w in ("intern", "internship", "trainee")) or "student" in level_name:
            return SeniorityLevel.INTERNSHIP
        if any(w in title_lower for w in ("lead", "staff", "principal", "head")):
            return SeniorityLevel.LEAD
        if any(w in title_lower for w in ("senior", "sr.", "sr ")):
            return SeniorityLevel.SENIOR
        if any(w in title_lower for w in ("junior", "jr.", "jr ", "fresh", "entry")) or "entry" in level_name:
            return SeniorityLevel.JUNIOR
        if "manager" in level_name and "non-manager" not in level_name:
            return SeniorityLevel.LEAD
        if "experienced" in level_name:
            return SeniorityLevel.MID
        return SeniorityLevel.UNKNOWN

    @staticmethod
    def _extract_employment_type(attrs: dict[str, Any]) -> EmploymentType:
        if str(attrs.get("jobType") or "").lower() == "internship":
            return EmploymentType.INTERNSHIP
        work_types = attrs.get("workTypes") or []
        names = " ".join(
            f"{wt.get('name', '')} {wt.get('displayedName', '')}"
            for wt in work_types
            if isinstance(wt, dict)
        ).lower()
        if "intern" in names:
            return EmploymentType.INTERNSHIP
        if "part_time" in names or "part time" in names:
            return EmploymentType.PART_TIME
        if "freelance" in names or "contract" in names or "project" in names:
            return EmploymentType.CONTRACT
        if "full_time" in names or "full time" in names:
            return EmploymentType.FULL_TIME
        return EmploymentType.FULL_TIME

    @staticmethod
    def _extract_skills(title: str, attrs: dict[str, Any]) -> list[str]:
        skills: list[str] = []
        seen_lower: set[str] = set()
        for kw in attrs.get("keywords") or []:
            if isinstance(kw, dict):
                name = str(kw.get("name") or "").strip()
                if name and name.lower() not in seen_lower:
                    seen_lower.add(name.lower())
                    skills.append(name)

        text_sample = f"{title} {attrs.get('description', '')} {attrs.get('requirements', '')}".lower()
        core_tech = [
            ("angular", "Angular"),
            ("typescript", "TypeScript"),
            ("javascript", "JavaScript"),
            ("react", "React"),
            ("next.js", "Next.js"),
            ("vue", "Vue.js"),
            ("rxjs", "RxJS"),
            ("tailwind", "Tailwind CSS"),
            ("html", "HTML5"),
            ("css", "CSS3"),
        ]
        for needle, display in core_tech:
            if re.search(rf"\b{re.escape(needle)}\b", text_sample) and display.lower() not in seen_lower:
                seen_lower.add(display.lower())
                skills.append(display)
        return skills

    @staticmethod
    def _extract_salary(attrs: dict[str, Any]) -> tuple[float | None, float | None, str | None]:
        if attrs.get("hideSalary"):
            return None, None, None
        salary = attrs.get("salary")
        if not isinstance(salary, dict):
            return None, None, None
        s_min = None
        s_max = None
        try:
            if salary.get("min") is not None:
                s_min = float(salary["min"])
            if salary.get("max") is not None:
                s_max = float(salary["max"])
        except (ValueError, TypeError):
            return None, None, None
        curr = str(salary.get("currency")).strip() if salary.get("currency") else None
        return s_min, s_max, curr
