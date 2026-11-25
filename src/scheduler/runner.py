"""Daily ingestion, scoring, and notification pipeline runner."""

import asyncio
import weakref
import zoneinfo
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import and_, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from src.bot.formatters import build_job_inline_keyboard, format_job_card
from src.bot.telegram_client import TelegramClient
from src.core.config import settings
from src.core.logging import logger
from src.engine.deduplication import DeduplicationEngine, compute_url_hash
from src.engine.eligibility import GeographicEligibilityEngine
from src.engine.frontend_filter import (
    is_frontend_opportunity,
    is_hiring_intent_social_post,
)
from src.engine.gemini_extractor import GeminiJobExtractor
from src.engine.matching import MatchingEngine
from src.engine.track_classifier import classify_job_track
from src.models import (
    DailyRun,
    GeographicEligibility,
    Job,
    JobStatusTracker,
    JobTrack,
    NotificationLog,
    NotificationStatus,
    NotificationType,
    OpportunitySegment,
    RunStatus,
    SeniorityLevel,
    Source,
    SourceSyncLog,
    WorkplaceType,
)
from src.services.expiry_detector import scan_and_mark_expired_jobs
from src.services.followup_service import check_and_send_followup_reminders
from src.services.profile_service import get_or_create_candidate_profile
from src.sources.base import BaseSourceAdapter, NormalizedJobData
from src.sources.registry import SourceRegistry, create_default_registry


def _clamp(val: str | None, limit: int) -> str | None:
    """Clamp string value to maximum allowed column length for SQL persistence."""
    return val[:limit] if val is not None else None


_PIPELINE_RUN_LOCKS: "weakref.WeakKeyDictionary[asyncio.AbstractEventLoop, asyncio.Lock]" = weakref.WeakKeyDictionary()


def _get_pipeline_run_lock() -> asyncio.Lock:
    """Return an event-loop-scoped single-flight lock to serialize concurrent pipeline runs."""
    loop = asyncio.get_running_loop()
    lock = _PIPELINE_RUN_LOCKS.get(loop)
    if lock is None:
        lock = asyncio.Lock()
        _PIPELINE_RUN_LOCKS[loop] = lock
    return lock


def _parse_telegram_send_result(res: Any) -> tuple[bool, int | None, str | None]:
    """Extract (sent_ok, telegram_message_id, error_details) from TelegramClient.send_message result."""
    if isinstance(res, dict):
        ok = bool(res.get("ok"))
        result_obj = res.get("result")
        msg_id = result_obj.get("message_id") if isinstance(result_obj, dict) else None
        err = None if ok else str(res.get("description") or "Telegram send_message returned ok=False")
        return ok, msg_id, err
    ok = bool(res)
    return ok, None, None if ok else "Telegram send_message failed"


class DailyPipelineRunner:
    """Orchestrates the 09:00 Africa/Cairo daily job discovery and matching pipeline."""

    def __init__(
        self,
        registry: SourceRegistry | None = None,
        telegram_client: TelegramClient | None = None,
        gemini_extractor: GeminiJobExtractor | None = None,
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
        target_chat_id: int | None = None,
        progress_callback: Any | None = None,
    ) -> DailyRun:
        """
        Execute all 11 steps of the daily job discovery and notification pipeline.
        Enforces single-flight locking and database-level idempotency via DailyRun.run_key.
        """
        async with _get_pipeline_run_lock():
            date_str = self.get_cairo_date_key()
            run_key = f"daily-digest-{date_str}"
            started_at = datetime.now(UTC)
            GeminiJobExtractor.reset_quota_status()

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
                    prev_started = daily_run.started_at
                    if prev_started and prev_started.tzinfo is None:
                        prev_started = prev_started.replace(tzinfo=UTC)
                    elapsed = (started_at - prev_started).total_seconds() if prev_started else 9999
                    if elapsed < 900:  # 15 minutes lock window
                        logger.warning(f"Daily run {run_key} is currently in progress ({int(elapsed)}s ago). Skipping concurrent run.")
                        return daily_run
                    logger.warning(f"Daily run {run_key} was stale IN_PROGRESS ({int(elapsed)}s ago). Recovering and restarting.")
                daily_run.status = RunStatus.IN_PROGRESS
                daily_run.started_at = started_at
                daily_run.error_message = None
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
            daily_run_id = daily_run.id

            try:
                return await self._execute_pipeline_body(
                    session=session,
                    daily_run=daily_run,
                    date_str=date_str,
                    run_key=run_key,
                    target_chat_id=target_chat_id,
                    progress_callback=progress_callback,
                )
            except Exception as exc:
                logger.error(f"Daily run {run_key} failed with unhandled error: {exc}", exc_info=True)
                try:
                    await session.rollback()
                    failed_run = (
                        await session.execute(select(DailyRun).where(DailyRun.id == daily_run_id))
                    ).scalar_one_or_none()
                    if failed_run:
                        failed_run.status = RunStatus.FAILED
                        failed_run.completed_at = datetime.now(UTC)
                        failed_run.error_message = str(exc)[:2000]
                        await session.commit()
                except Exception as persist_exc:  # noqa: BLE001
                    logger.error(f"Failed to persist FAILED status for {run_key}: {persist_exc}")
                raise

    async def _execute_pipeline_body(
        self,
        session: AsyncSession,
        daily_run: DailyRun,
        date_str: str,
        run_key: str,
        target_chat_id: int | None = None,
        progress_callback: Any | None = None,
    ) -> DailyRun:

        # -------------------------------------------------------------
        # Step 2: Load profile and active source config
        # -------------------------------------------------------------
        profile = await get_or_create_candidate_profile(session)
        recipient_chat_id = target_chat_id or settings.TELEGRAM_OWNER_ID

        metrics: dict[str, Any] = {"sources": {}}
        total_discovered = 0
        total_new = 0
        gemini_requests_count = 0
        newly_saved_jobs: list[Job] = []

        # -------------------------------------------------------------
        # Step 3 & 4: Fetch enabled sources concurrently with isolation
        # -------------------------------------------------------------
        adapters = self.registry.list_adapters()
        source_names = [a.source_metadata().name for a in adapters]
        source_records: dict[str, Source] = {}
        enabled_adapters: list[BaseSourceAdapter] = []

        if source_names:
            existing_res = await session.execute(select(Source).where(Source.name.in_(source_names)))
            for s_rec in existing_res.scalars().all():
                source_records[s_rec.name] = s_rec

        newly_added_sources: list[Source] = []
        for adapter in adapters:
            meta = adapter.source_metadata()
            source_name = meta.name
            if source_name not in source_records:
                source_rec = Source(
                    name=source_name,
                    source_type=meta.source_type,
                    base_url=meta.base_url,
                    doc_url=meta.doc_url,
                    is_enabled=True,
                    attribution_text=meta.attribution_requirement,
                )
                session.add(source_rec)
                source_records[source_name] = source_rec
                newly_added_sources.append(source_rec)

        if newly_added_sources:
            await session.commit()
            for s_rec in newly_added_sources:
                await session.refresh(s_rec)

        for adapter in adapters:
            source_name = adapter.source_metadata().name
            source_rec = source_records[source_name]
            if source_rec.is_enabled:
                enabled_adapters.append(adapter)
            else:
                logger.info(f"Source {source_name} is disabled. Skipping.")

        if progress_callback:
            await progress_callback(f"📡 Scanning {len(enabled_adapters)} job sources in parallel...", 30)

        async def _fetch_single_source(adapter: BaseSourceAdapter):
            meta = adapter.source_metadata()
            s_name = meta.name
            s_start = datetime.now(UTC)
            try:
                # 35-second timeout per source so a slow provider never hangs the runner
                raw_jobs = await asyncio.wait_for(adapter.fetch_jobs(), timeout=35.0)
                dur = int((datetime.now(UTC) - s_start).total_seconds())
                return (adapter, raw_jobs, "SUCCESS", None, dur)
            except Exception as exc:  # noqa: BLE001
                dur = int((datetime.now(UTC) - s_start).total_seconds())
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
                            normalized.published_at = normalized.published_at.replace(tzinfo=UTC)
                        job_age_days = (datetime.now(UTC) - normalized.published_at).days
                        if job_age_days > settings.MAX_JOB_AGE_DAYS:
                            logger.debug(
                                f"Skipping stale job: '{normalized.title}' at {normalized.company} "
                                f"({job_age_days}d old > limit {settings.MAX_JOB_AGE_DAYS}d)"
                            )
                            continue

                    # Social Hiring Intent Filter: Disqualify job-seeker posts (#OpenToWork, portfolio promo)
                    if getattr(normalized, "is_social_post", False) or "social" in source_name.lower():
                        is_hiring, hiring_reason = is_hiring_intent_social_post(normalized.description_text)
                        if not is_hiring:
                            logger.debug(
                                f"Skipping social post without hiring intent: '{normalized.title}' ({hiring_reason})"
                            )
                            continue

                    # Strict Frontend-Only Domain Filter
                    is_fe, fe_reason = is_frontend_opportunity(
                        title=normalized.title,
                        description=normalized.description_text,
                        skills=normalized.required_skills,
                    )
                    if not is_fe:
                        logger.debug(
                            f"Skipping non-frontend role: '{normalized.title}' at {normalized.company} ({fe_reason})"
                        )
                        continue

                    # Classify job into target tracks (Frontend Egypt, Remote GCC, Frontend Intern, Web Angular)
                    job_track = classify_job_track(
                        title=normalized.title,
                        description=normalized.description_text,
                        seniority=normalized.seniority,
                        employment_type=normalized.employment_type,
                        workplace_type=normalized.workplace_type,
                        raw_location=normalized.raw_location,
                        remote_scope=normalized.remote_scope,
                        required_experience_years=normalized.required_experience_years,
                        skills=normalized.required_skills,
                    )
                    if job_track == JobTrack.OTHER:
                        logger.debug(f"Skipping job classified outside frontend tracks: '{normalized.title}' at {normalized.company}")
                        continue

                    # Deduplication check
                    existing, _match_type = await DeduplicationEngine.find_existing_job(session, normalized)
                    if existing:
                        # Update last_seen_at
                        existing.last_seen_at = datetime.now(UTC)
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
                        except Exception as ai_exc:  # noqa: BLE001
                            logger.warning(f"Gemini extraction skipped for {normalized.title}: {ai_exc}")

                    # Step 6: Geographic Eligibility Classification & Regional Segmentation
                    eligibility, elig_reason = self.eligibility_engine.classify(
                        raw_location=normalized.raw_location,
                        workplace_type=normalized.workplace_type,
                        remote_scope=normalized.remote_scope,
                        eligible_countries=normalized.eligible_countries,
                        excluded_countries=normalized.excluded_countries,
                        description_text=normalized.description_text,
                    )
                    opportunity_segment = self.eligibility_engine.classify_segment(
                        raw_location=normalized.raw_location,
                        workplace_type=normalized.workplace_type,
                        remote_scope=normalized.remote_scope,
                        eligibility=eligibility,
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
                        job_track=job_track,
                    )

                    # Create and persist new Job record
                    url_hash = compute_url_hash(normalized.original_application_url or normalized.source_url)
                    payload_audit = {
                        **normalized.raw_payload,
                        "opportunity_segment": opportunity_segment.value,
                        "is_social_post": getattr(normalized, "is_social_post", False),
                        "source_category": "SOCIAL_POST" if getattr(normalized, "is_social_post", False) else "JOB_BOARD",
                    }
                    app_url = _clamp(
                        normalized.original_application_url or normalized.source_url or "",
                        1024,
                    ) or ""
                    job_record = Job(
                        source_id=source_rec.id,
                        source_name=_clamp(source_name, 100) or "",
                        source_job_id=_clamp(normalized.source_job_id, 255) or "",
                        source_url=_clamp(normalized.source_url, 1024) or "",
                        canonical_url_hash=url_hash[:64],
                        original_application_url=app_url,
                        company=_clamp(normalized.company, 255) or "Unknown",
                        title=_clamp(normalized.title, 255) or "",
                        description_text=normalized.description_text,
                        description_html=normalized.description_html,
                        raw_location=_clamp(normalized.raw_location, 255),
                        country_codes=normalized.country_codes,
                        workplace_type=normalized.workplace_type,
                        remote_scope=_clamp(normalized.remote_scope, 255),
                        eligible_countries=normalized.eligible_countries,
                        excluded_countries=normalized.excluded_countries,
                        seniority=normalized.seniority,
                        employment_type=normalized.employment_type,
                        salary_min=normalized.salary_min,
                        salary_max=normalized.salary_max,
                        salary_currency=_clamp(normalized.salary_currency, 10),
                        salary_period=_clamp(normalized.salary_period, 20),
                        required_skills=normalized.required_skills,
                        preferred_skills=normalized.preferred_skills,
                        required_experience_years=normalized.required_experience_years,
                        published_at=normalized.published_at,
                        first_seen_at=datetime.now(UTC),
                        last_seen_at=datetime.now(UTC),
                        is_active=(
                            eligibility != GeographicEligibility.NOT_ELIGIBLE
                            and match_result.score >= settings.MATCH_THRESHOLD_STORE
                        ),
                        job_track=job_track,
                        opportunity_segment=opportunity_segment.value,
                        is_social_post=bool(getattr(normalized, "is_social_post", False)),
                        eligibility=eligibility,
                        eligibility_reason=_clamp(elig_reason, 500) or "",
                        match_score=match_result.score,
                        match_band=match_result.band,
                        score_breakdown=match_result.breakdown.model_dump(),
                        match_reasons=match_result.reasons,
                        skill_gaps=match_result.skill_gaps,
                        match_confidence=match_result.confidence,
                        raw_payload=payload_audit,
                    )
                    try:
                        async with session.begin_nested():
                            session.add(job_record)
                            await session.flush()

                            # Attach ApplicationTracker
                            tracker = JobStatusTracker(job_id=job_record.id)
                            session.add(tracker)
                            await session.flush()
                    except SQLAlchemyError as db_err:
                        logger.warning(
                            f"Skipping persistence of job '{normalized.title}' at '{normalized.company}' due to DB error: {db_err}"
                        )
                        continue

                    new_count += 1
                    total_new += 1
                    newly_saved_jobs.append(job_record)

            # Record source sync log
            source_rec.last_sync_at = datetime.now(UTC)
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

        # -------------------------------------------------------------
        # Step 7.5: Cull expired and ghost postings across active feed
        # -------------------------------------------------------------
        try:
            exp_metrics = await scan_and_mark_expired_jobs(session, limit=30)
            metrics["expiry_scan"] = exp_metrics
        except Exception as exp_exc:  # noqa: BLE001
            logger.warning(f"Background link expiry scan skipped: {exp_exc}")

        if progress_callback:
            await progress_callback("🧠 Ranking matches and assembling digest...", 90)

        # -------------------------------------------------------------
        # Step 8: Select jobs not previously notified and above threshold
        # -------------------------------------------------------------
        notified_count = 0
        if recipient_chat_id and profile.digest_enabled:
            # Query active, un-expired jobs without an existing SENT notification
            stmt_unnotified = (
                select(Job)
                .outerjoin(
                    NotificationLog,
                    and_(
                        Job.id == NotificationLog.job_id,
                        NotificationLog.status == NotificationStatus.SENT,
                    ),
                )
                .where(
                    Job.is_active == True,
                    Job.is_expired == False,
                    Job.job_track != JobTrack.OTHER,
                    Job.match_score >= profile.digest_threshold,
                    NotificationLog.id == None,
                )
                .order_by(
                    (Job.eligibility == GeographicEligibility.EGYPT_ELIGIBLE).desc(),
                    Job.match_score.desc(),
                )
            )
            res_unnotified = await session.execute(stmt_unnotified)
            eligible_for_digest = res_unnotified.scalars().all()

            # Cleanly segment opportunities into the two top-level buckets:
            # 1. Egypt: Cairo, Giza, Alexandria, Egypt Remote (On-site, Hybrid, Remote + Internships)
            # 2. Remote Abroad / GCC: Saudi, UAE, Qatar, Kuwait, Bahrain, Oman & International (Remote ONLY)
            sec_egypt: list[Job] = []
            sec_remote_gcc: list[Job] = []

            for j in eligible_for_digest:
                if j.job_track == JobTrack.OTHER:
                    continue
                seg = getattr(j, "opportunity_segment", "")
                if seg == OpportunitySegment.EGYPT.value:
                    sec_egypt.append(j)
                elif seg == OpportunitySegment.REMOTE_GCC_ABROAD.value:
                    sec_remote_gcc.append(j)
                else:
                    logger.warning(
                        f"Skipping ambiguous or unclassified opportunity from daily digest: '{j.title}' at {j.company} (segment={seg}, id={j.id})"
                    )

            # Sort opportunities by match score descending
            sec_egypt.sort(key=lambda j: j.match_score, reverse=True)
            sec_remote_gcc.sort(key=lambda j: j.match_score, reverse=True)

            total_digest_jobs = len(sec_egypt) + len(sec_remote_gcc)
            social_count = sum(1 for j in (sec_egypt + sec_remote_gcc) if getattr(j, "is_social_post", False))
            boards_count = total_digest_jobs - social_count

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
                zero_res = await self.telegram.send_message(chat_id=recipient_chat_id, text=zero_text)
                zero_ok, zero_msg_id, zero_err = _parse_telegram_send_result(zero_res)

                n_log = NotificationLog(
                    run_id=daily_run.id,
                    notification_type=NotificationType.ZERO_RESULTS,
                    telegram_chat_id=recipient_chat_id,
                    telegram_message_id=zero_msg_id,
                    status=NotificationStatus.SENT if zero_ok else NotificationStatus.FAILED,
                    error_details=zero_err,
                )
                session.add(n_log)
                await session.commit()
            else:
                # Send introduction header
                intro_text = f"""🌅 <b>Daily Frontend Opportunity Radar</b>
📅 Date: <b>{date_str}</b> | Time: <b>09:00 AM (Cairo)</b>

Discovered <b>{total_digest_jobs}</b> new verified Frontend opportunities:
• 🇪🇬 <b>فرص الواجهات الأمامية داخل مصر (Egypt):</b> {len(sec_egypt)} (On-site / Hybrid / Remote & Internships)
• 🌐 <b>فرص ريموت الخليج والدولية (Remote Abroad / GCC):</b> {len(sec_remote_gcc)} (Remote Only)
• 📡 <b>منشورات التوظيف (Social Posts):</b> {social_count} | 💼 <b>منصات التوظيف (Job Boards):</b> {boards_count}
"""
                await self.telegram.send_message(chat_id=recipient_chat_id, text=intro_text)

                # Function to send section cards
                async def dispatch_section(title_banner: str, job_list: list[Job]) -> int:
                    if not job_list:
                        return 0
                    await self.telegram.send_message(chat_id=recipient_chat_id, text=title_banner)
                    sent_in_section = 0
                    for j in job_list:
                        card = format_job_card(j)
                        markup = build_job_inline_keyboard(j)
                        msg_res = await self.telegram.send_message(
                            chat_id=recipient_chat_id,
                            text=card,
                            reply_markup=markup,
                        )
                        sent_ok, msg_id, err_details = _parse_telegram_send_result(msg_res)

                        # Step 10: Persist NotificationLog truthfully
                        n_log = NotificationLog(
                            run_id=daily_run.id,
                            job_id=j.id,
                            notification_type=NotificationType.DAILY_DIGEST,
                            telegram_chat_id=recipient_chat_id,
                            telegram_message_id=msg_id,
                            status=NotificationStatus.SENT if sent_ok else NotificationStatus.FAILED,
                            error_details=err_details,
                        )
                        session.add(n_log)
                        await session.commit()
                        if sent_ok:
                            sent_in_section += 1
                        await asyncio.sleep(0.5)
                    return sent_in_section

                # Dispatch Section 1: Egypt Frontend
                if sec_egypt:
                    notified_count += await dispatch_section(
                        f"🇪🇬 <b>القسم الأول: فرص الواجهات الأمامية داخل مصر — Egypt ({len(sec_egypt)}):</b>\n<i>(Cairo, Giza, Alexandria & Remote Egypt • On-site | Hybrid | Remote)</i>\n─────────────────────────",
                        sec_egypt,
                    )

                # Dispatch Section 2: Remote Abroad / GCC Frontend
                if sec_remote_gcc:
                    notified_count += await dispatch_section(
                        f"🌐 <b>القسم الثاني: فرص ريموت الخليج والدولية — Remote Abroad / GCC ({len(sec_remote_gcc)}):</b>\n<i>(Saudi Arabia, UAE, Qatar, Kuwait & International • Strictly Remote Only)</i>\n─────────────────────────",
                        sec_remote_gcc,
                    )

        # -------------------------------------------------------------
        # Step 10.5: Dispatch 5-day post-application follow-up reminders
        # -------------------------------------------------------------
        try:
            reminders_sent = await check_and_send_followup_reminders(
                session=session,
                telegram=self.telegram,
                gemini=self.gemini,
                target_chat_id=recipient_chat_id,
            )
            metrics["followup_reminders_sent"] = reminders_sent
        except Exception as f_exc:  # noqa: BLE001
            logger.warning(f"Follow-up reminder dispatch skipped: {f_exc}")

        # -------------------------------------------------------------
        # Step 11: Record run metrics, counts, and completion
        # -------------------------------------------------------------
        daily_run.status = RunStatus.COMPLETED
        daily_run.completed_at = datetime.now(UTC)
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
