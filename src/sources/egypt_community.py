"""Egypt Tech Community & Internships adapter.

Extracts real, curated software engineering internships and tech job opportunities
in Egypt from verified student and engineering community repositories.
"""

import re
from datetime import datetime
from typing import Any, ClassVar

import httpx

from src.core.logging import logger
from src.core.security import canonicalize_url
from src.models.enums import EmploymentType, SeniorityLevel, WorkplaceType
from src.sources.base import (
    BaseSourceAdapter,
    NormalizedJobData,
    RawJobData,
    SourceMetadata,
)
from src.sources.http_client import ResilientHttpClient


class EgyptCommunityAdapter(BaseSourceAdapter):
    """
    Adapter for Egyptian tech internships and entry-level software engineering opportunities.
    Ingests curated listings from active Egyptian community registries.
    """

    FEEDS: ClassVar[tuple[dict[str, str], ...]] = (
        {
            "name": "Software Internship Guide (Egyptian Undergraduates)",
            "url": "https://raw.githubusercontent.com/dinaashraf20003/Software-Internship-Guide/main/README.md",
        },
    )

    def __init__(self, http_client: ResilientHttpClient | None = None):
        self.http_client = http_client or ResilientHttpClient()

    def source_metadata(self) -> SourceMetadata:
        return SourceMetadata(
            name="egypt_community",
            source_type="egypt_community",
            base_url="https://github.com/dinaashraf20003/Software-Internship-Guide",
            doc_url="https://github.com/dinaashraf20003/Software-Internship-Guide",
            allowed_usage_summary="Public community open-source directory of Egyptian tech internships and fresh graduate programs.",
            rate_limit_req_per_minute=20,
            attribution_requirement="Attributed to Egyptian Tech & Student Community Guide.",
            freshness_limitations="Regularly updated with current academic year and hiring cycles.",
            fields_provided=["company", "title", "link", "location", "cycle"],
        )

    async def health_check(self) -> bool:
        try:
            resp = await self.http_client.get(self.FEEDS[0]["url"])
            return resp.status_code == 200 and len(resp.text) > 1000
        except (httpx.HTTPError, ValueError) as exc:
            logger.error(f"Egypt community adapter health check failed: {exc}")
            return False

    async def fetch_jobs(
        self,
        since: datetime | None = None,
        query_config: dict[str, Any] | None = None,
    ) -> list[RawJobData]:
        raw_jobs: list[RawJobData] = []
        seen_links = set()

        for feed in self.FEEDS:
            feed_url = feed["url"]
            feed_name = feed["name"]
            try:
                resp = await self.http_client.get(feed_url)
                if resp.status_code != 200:
                    logger.warning(f"Failed to fetch {feed_url}: status {resp.status_code}")
                    continue

                text = resp.text
                parsed_items = self._parse_markdown(text, feed_name)

                for item in parsed_items:
                    link = item.get("link", "").strip()
                    if not link or link in seen_links:
                        continue
                    seen_links.add(link)

                    # Extract job identifier from link
                    job_id = re.sub(r"[^a-zA-Z0-9_-]", "_", link[-64:])
                    raw_jobs.append(
                        RawJobData(
                            source_name="egypt_community",
                            source_job_id=job_id,
                            source_url=link,
                            payload=item,
                        )
                    )
            except (httpx.HTTPError, ValueError, KeyError, re.error) as exc:
                logger.error(f"Error fetching Egypt community feed {feed_name}: {exc}")

        logger.info(f"Egypt community adapter fetched {len(raw_jobs)} Egyptian listings.")
        return raw_jobs

    def _parse_markdown(self, markdown_text: str, feed_name: str) -> list[dict[str, Any]]:
        results: list[dict[str, Any]] = []

        # Parse tables under relevant sections (Internships 2026, 2025, Internships in Egypt, Full-time in Egypt)
        target_sections = [
            "## Internships 2026",
            "## Internships 2025",
            "## Internships in Egypt",
            "## Full-time Positions in Egypt",
        ]

        lines = markdown_text.split("\n")
        in_target_section = False
        current_section = ""

        for line in lines:
            line_str = line.strip()

            if line_str.startswith("## "):
                matched_sec = any(line_str.lower().startswith(sec.lower()) for sec in target_sections)
                if matched_sec:
                    in_target_section = True
                    current_section = line_str
                else:
                    in_target_section = False
                continue

            if not in_target_section:
                continue

            # Must be a table row: | Company | Title | Link | ...
            if line_str.startswith("|") and not line_str.startswith("|---") and "company" not in line_str.lower():
                cols = [c.strip() for c in line_str.split("|")[1:-1]]
                if len(cols) >= 3:
                    company_raw = cols[0]
                    title_raw = cols[1]

                    # Clean markdown formatting (*, [, ], bold)
                    company = re.sub(r"[*\[\]_]", "", company_raw).strip()
                    title = re.sub(r"[*\[\]_]", "", title_raw).strip()

                    if not company or not title or len(title) < 3:
                        continue

                    # Extract application URL
                    link = ""
                    for col in cols[2:]:
                        m_link = re.search(r"\((https?://[^\)]+)\)", col)
                        if m_link:
                            link = m_link.group(1).strip()
                            break
                        m_href = re.search(r"href=[\"'](https?://[^\"']+)[\"']", col)
                        if m_href:
                            link = m_href.group(1).strip()
                            break
                        if col.startswith(("http://", "https://")):
                            link = col.strip()
                            break

                    if not link or not link.startswith("http"):
                        continue

                    location = "Cairo, Egypt"
                    for col in cols[2:]:
                        col_clean = re.sub(r"[*\[\]_]", "", col).strip()
                        if (
                            "http" not in col_clean
                            and "//" not in col_clean
                            and any(k in col_clean.lower() for k in ["cairo", "giza", "alexandria", "egypt", "remote", "hybrid", "maadi", "nasr city"])
                        ):
                            location = col_clean
                            break

                    results.append(
                        {
                            "company": company,
                            "title": title,
                            "link": link,
                            "location": location,
                            "section": current_section,
                            "feed_name": feed_name,
                        }
                    )

        return results

    def normalize(self, raw: RawJobData) -> NormalizedJobData:
        item = raw.payload
        company = item.get("company", "Egyptian Tech Employer")
        title = item.get("title", "Software Engineering Opportunity")
        link = item.get("link", raw.source_url)
        location = item.get("location", "Cairo, Egypt")
        section = item.get("section", "")

        canonical = canonicalize_url(link)
        title_lower = title.lower()
        desc_summary = (
            f"Opportunity: {title} at {company} in {location}. "
            f"Verified Egyptian Tech Community listing ({section}). "
            f"Direct application portal: {link}"
        )

        # Seniority classification
        seniority = SeniorityLevel.INTERNSHIP
        if "full-time" in section.lower() or "junior" in title_lower or "entry" in title_lower:
            seniority = SeniorityLevel.JUNIOR if "junior" in title_lower else SeniorityLevel.ENTRY
        elif "graduate" in title_lower or "fresh" in title_lower:
            seniority = SeniorityLevel.GRADUATE

        # Employment type
        employment_type = EmploymentType.INTERNSHIP
        if "full-time" in section.lower() or "full time" in title_lower:
            employment_type = EmploymentType.FULL_TIME

        # Workplace type
        workplace_type = WorkplaceType.HYBRID
        loc_lower = location.lower()
        if "remote" in loc_lower:
            workplace_type = WorkplaceType.REMOTE
        elif "on-site" in loc_lower or "onsite" in loc_lower:
            workplace_type = WorkplaceType.ON_SITE

        # Required skills extraction from title/context
        skills: list[str] = ["Software Engineering"]
        tech_keywords = [
            ("angular", "Angular"),
            ("react", "React"),
            ("frontend", "Frontend"),
            ("front-end", "Frontend"),
            ("backend", "Backend"),
            ("back-end", "Backend"),
            ("fullstack", "Full Stack"),
            ("full stack", "Full Stack"),
            ("python", "Python"),
            ("javascript", "JavaScript"),
            ("typescript", "TypeScript"),
            ("ai", "Artificial Intelligence"),
            ("machine learning", "Machine Learning"),
            ("ml", "Machine Learning"),
            ("data", "Data Engineering"),
            ("java", "Java"),
            (".net", ".NET"),
            ("cloud", "Cloud"),
            ("devops", "DevOps"),
            ("qa", "Quality Assurance"),
            ("testing", "Software Testing"),
        ]
        for term, label in tech_keywords:
            if re.search(rf"\b{re.escape(term)}\b", title_lower) and label not in skills:
                skills.append(label)

        return NormalizedJobData(
            source_name="egypt_community",
            source_job_id=raw.source_job_id,
            source_url=link,
            canonical_url=canonical,
            original_application_url=link,
            company=company,
            title=title,
            description_text=desc_summary,
            description_html=f"<p>{desc_summary}</p>",
            raw_location=location,
            country_codes=["EG"],
            workplace_type=workplace_type,
            remote_scope="Egypt" if workplace_type == WorkplaceType.REMOTE else None,
            eligible_countries=["EG", "Egypt", "Cairo"],
            seniority=seniority,
            employment_type=employment_type,
            required_skills=skills,
            published_at=None,
            raw_payload=item,
        )
