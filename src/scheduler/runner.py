"""Daily ingestion, scoring, and notification pipeline runner."""

import asyncio
from datetime import datetime, timezone
import zoneinfo
from typing import Any, Dict, List, Optional
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from src.bot.formatters import build_job_inline_keyboard, chunk_message, escape, format_job_card
from src.bot.telegram_client import TelegramClient
from src.core.config import settings
from src.core.logging import logger
from src.engine.deduplication import DeduplicationEngine, compute_url_hash
from src.engine.eligibility import GeographicEligibilityEngine
from src.engine.gemini_extractor import GeminiJobExtractor
from src.engine.matching import MatchingEngine
from src.models import (
    CandidateProfile,
    DailyRun,
    GeographicEligibility,
    Job,
    JobStatusTracker,
    NotificationLog,
    NotificationStatus,
    NotificationType,
    RunStatus,
    SeniorityLevel,
    Source,
    SourceSyncLog,
    WorkplaceType,
)
from src.services.profile_service import get_or_create_candidate_profile
from src.sources.base import BaseSourceAdapter, NormalizedJobData, RawJobData
from src.sources.registry import SourceRegistry, create_default_registry


class DailyPipelineRunner:
    """Orchestrates the 09:00 Africa/Cairo daily job discovery and matching pipeline."""

    def __init__(
        self,
        registry: Optional[SourceRegistry] = None,
        telegram_client: Optional[TelegramClient] = None,
        gemini_extractor: Optional[GeminiJobExtractor] = None,
    ):
        self.registry = registry or create_default_registry()
        self.telegram = telegram_client or TelegramClient()
        self.gemini = gemini_extractor or GeminiJobExtractor()
        self.eligibility_engine = GeographicEligibilityEngine(candidate_country=settings.CANDIDATE_COUNTRY)
        self.matching_engine = MatchingEngine()

    def get_cairo_date_key(self) -> str:
        """Return current date formatted YYYY-MM-DD in Africa/Cairo IANA timezone."""
        cairo_tz = zoneinfo.ZoneInfo("Africa/Cairo")
        now_cairo = datetime.now(cairo_tz)
        return now_cairo.strftime("%Y-%m-%d")

    async def execute_daily_run(
        self,
        session: AsyncSession,
        force: bool = False,
        target_chat_id: Optional[int] = None,
        progress_callback: Optional[Any] = None,
    ) -> DailyRun:
        """
        Execute all 11 steps of the daily job discovery and notification pipeline.
        Enforces database-level idempotency lock via DailyRun.run_key.
        """
        date_str = self.get_cairo_date_key()
        run_key = f"daily-digest-{date_str}"
        started_at = datetime.now(timezone.utc)

        # -------------------------------------------------------------
        # Step 1: Database-backed run lock / unique daily run key
        # -------------------------------------------------------------
        stmt_run = select(DailyRun).where(DailyRun.run_key == run_key)
        res_run = await session.execute(stmt_run)
        daily_run = res_run.scalar_one_or_none()

        if daily_run:
            if daily_run.status == RunStatus.COMPLETED and not force:
                logger.info(f"Daily run {run_key} has already completed successfully. Skipping to prevent duplicate digest.")
                return daily_run
            if daily_run.status == RunStatus.IN_PROGRESS and not force:
                elapsed = (started_at - daily_run.started_at).total_seconds() if daily_run.started_at else 9999
                if elapsed < 900:  # 15 minutes lock window
                    logger.warning(f"Daily run {run_key} is currently in progress ({int(elapsed)}s ago). Skipping concurrent run.")
                    return daily_run
                logger.warning(f"Daily run {run_key} was stale IN_PROGRESS ({int(elapsed)}s ago). Recovering and restarting.")
            daily_run.status = RunStatus.IN_PROGRESS
            daily_run.started_at = started_at
        else:
            daily_run = DailyRun(
                run_date=date_str,
                run_key=run_key,
                status=RunStatus.IN_PROGRESS,
                started_at=started_at,
            )
            session.add(daily_run)

        await session.commit()
        await session.refresh(daily_run)

        # -------------------------------------------------------------
        # Step 2: Load profile and active source config
        # -------------------------------------------------------------
        profile = await get_or_create_candidate_profile(session)
        recipient_chat_id = target_chat_id or settings.TELEGRAM_OWNER_ID

        metrics: Dict[str, Any] = {"sources": {}}
        total_discovered = 0
        total_new = 0
        gemini_requests_count = 0
        newly_saved_jobs: List[Job] = []

        # -------------------------------------------------------------
        # Step 3 & 4: Fetch enabled sources concurrently with isolation
        # -------------------------------------------------------------
        adapters = self.registry.list_adapters()
        source_records: Dict[str, Source] = {}
        enabled_adapters: List[BaseSourceAdapter] = []

        for adapter in adapters:
            meta = adapter.source_metadata()
            source_name = meta.name

            # Ensure source record exists in DB
            stmt_s = select(Source).where(Source.name == source_name)
            res_s = await session.execute(stmt_s)
            source_rec = res_s.scalar_one_or_none()
            if not source_rec:
                source_rec = Source(
                    name=source_name,
                    source_type=meta.source_type,
                    base_url=meta.base_url,
                    doc_url=meta.doc_url,
                    is_enabled=True,
                    attribution_text=meta.attribution_requirement,
                )
                session.add(source_rec)
                await session.commit()
                await session.refresh(source_rec)

            source_records[source_name] = source_rec
            if source_rec.is_enabled:
                enabled_adapters.append(adapter)
            else:
                logger.info(f"Source {source_name} is disabled. Skipping.")

        if progress_callback:
            await progress_callback(f"📡 Scanning {len(enabled_adapters)} job sources in parallel...", 30)

        async def _fetch_single_source(adapter: BaseSourceAdapter):
            meta = adapter.source_metadata()
            s_name = meta.name
            s_start = datetime.now(timezone.utc)
            try:
                # 35-second timeout per source so a slow provider never hangs the runner
                raw_jobs = await asyncio.wait_for(adapter.fetch_jobs(), timeout=35.0)
                dur = int((datetime.now(timezone.utc) - s_start).total_seconds())
                return (adapter, raw_jobs, "SUCCESS", None, dur)
            except Exception as exc:
                dur = int((datetime.now(timezone.utc) - s_start).total_seconds())
                logger.error(f"Source {s_name} failed during daily run: {exc}")
                return (adapter, [], "FAILED", str(exc), dur)

        fetch_results = await asyncio.gather(*(_fetch_single_source(a) for a in enabled_adapters))

        total_discovered_raw = sum(len(res[1]) for res in fetch_results)
        if progress_callback:
            await progress_callback(f"📥 Ingested {total_discovered_raw} listings. Matching against 32 verified skills...", 60)

        for adapter, raw_jobs, status_str, error_str, duration in fetch_results:
            meta = adapter.source_metadata()
            source_name = meta.name
            source_rec = source_records[source_name]

            fetched_count = len(raw_jobs)
            new_count = 0
            total_discovered += fetched_count

            if status_str == "SUCCESS":
                for raw in raw_jobs:
                    normalized: NormalizedJobData = adapter.normalize(raw)

                    # Freshness filter: Drop stale jobs older than MAX_JOB_AGE_DAYS (30 days)
                    if normalized.published_at:
                        if normalized.published_at.tzinfo is None:
                            normalized.published_at = normalized.published_at.replace(tzinfo=timezone.utc)
                        job_age_days = (datetime.now(timezone.utc) - normalized.published_at).days
                        if job_age_days > settings.MAX_JOB_AGE_DAYS:
                            logger.debug(
                                f"Skipping stale job: '{normalized.title}' at {normalized.company} "
                                f"({job_age_days}d old > limit {settings.MAX_JOB_AGE_DAYS}d)"
                            )
                            continue

                    # Non-tech / Irrelevant role pre-filter (Keep only engineering/software/web opportunities)
                    title_clean = normalized.title.lower()
                    non_tech_terms = [
                        "writer", "copywriter", "content creator", "accountant", "bookkeeper",
                        "clerk", "office assistant", "executive assistant", "virtual assistant",
                        "nurse", "therapist", "sales representative", "telemarketer", "recruiter",
                        "talent acquisition", "hr generalist", "hr manager", "human resources",
                        "chef", "cook", "driver", "warehouse", "security officer", "customer care",
                        "customer support", "customer service", "receptionist", "legal assistant",
                        "paralegal", "attorney"
                    ]
                    tech_terms = [
                        "developer", "engineer", "frontend", "front-end", "web", "software",
                        "programmer", "angular", "typescript", "javascript", "fullstack", "full stack",
                        "backend", "ui", "ux", "devops", "cloud", "tech", "qa", "intern"
                    ]
                    if any(nt in title_clean for nt in non_tech_terms) and not any(tt in title_clean for tt in tech_terms):
                        logger.debug(f"Skipping non-tech job by title: '{normalized.title}' at {normalized.company}")
                        continue

                    # Deduplication check
                    existing, match_type = await DeduplicationEngine.find_existing_job(session, normalized)
                    if existing:
                        # Update last_seen_at
                        existing.last_seen_at = datetime.now(timezone.utc)
                        continue

                    # Step 5: Gemini extraction for missing attributes if budget permits
                    is_candidate_target = any(
                        term.lower() in normalized.title.lower()
                        for term in (profile.target_role_terms + profile.target_technology_terms)
                    )
                    if (
                        settings.GEMINI_EXTRACTION_ENABLED
                        and gemini_requests_count < settings.GEMINI_MAX_REQUESTS_PER_RUN
                        and is_candidate_target
                        and (normalized.required_skills == [] or normalized.seniority == SeniorityLevel.UNKNOWN)
                    ):
                        try:
                            gemini_requests_count += 1
                            ai_attrs = await self.gemini.extract_attributes(
                                title=normalized.title,
                                description=normalized.description_text,
                                company=normalized.company,
                            )
                            if ai_attrs.seniority != SeniorityLevel.UNKNOWN:
                                normalized.seniority = ai_attrs.seniority
                            if ai_attrs.workplace_type != WorkplaceType.UNKNOWN:
                                normalized.workplace_type = ai_attrs.workplace_type
                            if ai_attrs.required_skills:
                                normalized.required_skills = ai_attrs.required_skills
                            if ai_attrs.required_experience_years is not None:
                                normalized.required_experience_years = ai_attrs.required_experience_years
                        except Exception as ai_exc:
                            logger.warning(f"Gemini extraction skipped for {normalized.title}: {ai_exc}")

                    # Step 6: Geographic Eligibility Classification
                    eligibility, elig_reason = self.eligibility_engine.classify(
                        raw_location=normalized.raw_location,
                        workplace_type=normalized.workplace_type,
                        remote_scope=normalized.remote_scope,
                        eligible_countries=normalized.eligible_countries,
                        excluded_countries=normalized.excluded_countries,
                        description_text=normalized.description_text,
                    )

                    # Step 6: Deterministic 0-100 Scoring
                    match_result = self.matching_engine.evaluate(
                        job_title=normalized.title,
                        job_description=normalized.description_text,
                        job_skills=normalized.required_skills,
                        seniority=normalized.seniority,
                        employment_type=normalized.employment_type,
                        eligibility=eligibility,
                        published_at=normalized.published_at,
                        required_experience_years=normalized.required_experience_years,
                        profile=profile,
                    )

                    # Create and persist new Job record
                    url_hash = compute_url_hash(normalized.original_application_url or normalized.source_url)
                    job_record = Job(
                        source_id=source_rec.id,
                        source_name=source_name,
                        source_job_id=normalized.source_job_id,
                        source_url=normalized.source_url,
                        canonical_url_hash=url_hash,
                        original_application_url=normalized.original_application_url,
                        company=normalized.company,
                        title=normalized.title,
                        description_text=normalized.description_text,
                        description_html=normalized.description_html,
                        raw_location=normalized.raw_location,
                        country_codes=normalized.country_codes,
                        workplace_type=normalized.workplace_type,
                        remote_scope=normalized.remote_scope,
                        eligible_countries=normalized.eligible_countries,
                        excluded_countries=normalized.excluded_countries,
                        seniority=normalized.seniority,
                        employment_type=normalized.employment_type,
                        salary_min=normalized.salary_min,
                        salary_max=normalized.salary_max,
                        salary_currency=normalized.salary_currency,
                        salary_period=normalized.salary_period,
                        required_skills=normalized.required_skills,
                        preferred_skills=normalized.preferred_skills,
                        required_experience_years=normalized.required_experience_years,
                        published_at=normalized.published_at,
                        first_seen_at=datetime.now(timezone.utc),
                        last_seen_at=datetime.now(timezone.utc),
                        is_active=(
                            eligibility != GeographicEligibility.NOT_ELIGIBLE
                            and match_result.score >= settings.MATCH_THRESHOLD_STORE
                        ),
                        eligibility=eligibility,
                        eligibility_reason=elig_reason,
                        match_score=match_result.score,
                        match_band=match_result.band,
                        score_breakdown=match_result.breakdown.model_dump(),
                        match_reasons=match_result.reasons,
                        skill_gaps=match_result.skill_gaps,
                        match_confidence=match_result.confidence,
                        raw_payload=normalized.raw_payload,
                    )
                    session.add(job_record)
                    await session.flush()

                    # Attach ApplicationTracker
                    tracker = JobStatusTracker(job_id=job_record.id)
                    session.add(tracker)

                    new_count += 1
                    total_new += 1
                    newly_saved_jobs.append(job_record)

            # Record source sync log
            source_rec.last_sync_at = datetime.now(timezone.utc)
            source_rec.last_sync_status = status_str
            source_rec.last_sync_error = error_str

            sync_log = SourceSyncLog(
                source_id=source_rec.id,
                run_id=daily_run.id,
                status=status_str,
                jobs_fetched=fetched_count,
                jobs_normalized=fetched_count,
                jobs_new=new_count,
                duration_seconds=duration,
                error_message=error_str,
            )
            session.add(sync_log)
            await session.commit()

            metrics["sources"][source_name] = {
                "status": status_str,
                "fetched": fetched_count,
                "new": new_count,
                "duration_seconds": duration,
            }

        if progress_callback:
            await progress_callback("🧠 Ranking matches and assembling digest...", 90)

        # -------------------------------------------------------------
        # Step 8: Select jobs not previously notified and above threshold
        # -------------------------------------------------------------
        notified_count = 0
        if recipient_chat_id and profile.digest_enabled:
            # Query un-notified jobs
            stmt_unnotified = (
                select(Job)
                .outerjoin(NotificationLog, Job.id == NotificationLog.job_id)
                .where(
                    Job.is_active == True,
                    Job.match_score >= profile.digest_threshold,
                    NotificationLog.id == None,
                )
                .order_by(Job.match_score.desc())
            )
            res_unnotified = await session.execute(stmt_unnotified)
            eligible_for_digest = res_unnotified.scalars().all()

            # Separate into 3 explicit categories:
            # 1. Egypt-eligible / Worldwide remote
            # 2. Regional remote (needs verification)
            # 3. Relocation required
            sec_egypt_worldwide: List[Job] = []
            sec_regional: List[Job] = []
            sec_relocation: List[Job] = []

            for j in eligible_for_digest:
                if j.eligibility in (GeographicEligibility.EGYPT_ELIGIBLE, GeographicEligibility.REMOTE_WORLDWIDE):
                    sec_egypt_worldwide.append(j)
                elif j.eligibility == GeographicEligibility.REMOTE_REGION_POSSIBLE:
                    sec_regional.append(j)
                elif j.eligibility == GeographicEligibility.RELOCATION_REQUIRED:
                    sec_relocation.append(j)

            total_digest_jobs = len(sec_egypt_worldwide) + len(sec_regional) + len(sec_relocation)

            # Step 9: Send daily Telegram digest
            if total_digest_jobs == 0:
                # Send truthful zero-results report
                zero_text = f"""📊 <b>Daily Job Digest ({date_str})</b>
Time: 09:00 AM (Africa/Cairo)

📭 <b>No new job opportunities met your matching threshold today (Minimum: {profile.digest_threshold:.0f}/100).</b>

🔍 <b>Source Health & Sync Summary:</b>
"""
                for s_name, s_met in metrics["sources"].items():
                    zero_text += f"• {s_name}: {s_met['status']} ({s_met['fetched']} scanned)\n"

                zero_text += "\nYour next automatic scan will run tomorrow at 09:00 AM Cairo time. You can trigger an immediate scan anytime with /run."
                await self.telegram.send_message(chat_id=recipient_chat_id, text=zero_text)

                n_log = NotificationLog(
                    run_id=daily_run.id,
                    notification_type=NotificationType.ZERO_RESULTS,
                    telegram_chat_id=recipient_chat_id,
                    status=NotificationStatus.SENT,
                )
                session.add(n_log)
                await session.commit()
            else:
                # Send introduction header
                intro_text = f"""🌅 <b>Daily Job Digest — New Opportunities</b>
📅 Date: <b>{date_str}</b> | Time: <b>09:00 AM (Cairo)</b>
🎯 Focus: <b>{escape(profile.priority_target)}</b>

Discovered <b>{total_digest_jobs}</b> new verified opportunities tailored to your profile:
"""
                await self.telegram.send_message(chat_id=recipient_chat_id, text=intro_text)

                # Function to send section cards
                async def dispatch_section(title_banner: str, job_list: List[Job]):
                    if not job_list:
                        return
                    await self.telegram.send_message(chat_id=recipient_chat_id, text=title_banner)
                    for j in job_list:
                        card = format_job_card(j)
                        markup = build_job_inline_keyboard(j)
                        msg_res = await self.telegram.send_message(
                            chat_id=recipient_chat_id,
                            text=card,
                            reply_markup=markup,
                        )
                        msg_id = msg_res.get("result", {}).get("message_id")

                        # Step 10: Persist NotificationLog
                        n_log = NotificationLog(
                            run_id=daily_run.id,
                            job_id=j.id,
                            notification_type=NotificationType.DAILY_DIGEST,
                            telegram_chat_id=recipient_chat_id,
                            telegram_message_id=msg_id,
                            status=NotificationStatus.SENT,
                        )
                        session.add(n_log)
                        await session.commit()

                # Dispatch Category 1
                if sec_egypt_worldwide:
                    await dispatch_section(
                        f"🇪🇬 <b>Egypt Eligible & Worldwide Remote ({len(sec_egypt_worldwide)}):</b>",
                        sec_egypt_worldwide,
                    )

                # Dispatch Category 2
                if sec_regional:
                    await dispatch_section(
                        f"⚠️ <b>Regional Remote (Requires Egypt Eligibility Confirmation) ({len(sec_regional)}):</b>",
                        sec_regional,
                    )

                # Dispatch Category 3
                if sec_relocation:
                    await dispatch_section(
                        f"✈️ <b>Relocation Opportunities ({len(sec_relocation)}):</b>",
                        sec_relocation,
                    )

                notified_count = total_digest_jobs

        # -------------------------------------------------------------
        # Step 11: Record run metrics, counts, and completion
        # -------------------------------------------------------------
        daily_run.status = RunStatus.COMPLETED
        daily_run.completed_at = datetime.now(timezone.utc)
        daily_run.jobs_discovered = total_discovered
        daily_run.jobs_new = total_new
        daily_run.jobs_notified = notified_count
        daily_run.metrics = metrics

        await session.commit()
        await session.refresh(daily_run)
        if progress_callback:
            await progress_callback("✨ Scan and matching pipeline completed!", 100)
        logger.info(f"Daily run {run_key} completed successfully: discovered={total_discovered}, new={total_new}, notified={notified_count}")
        return daily_run
