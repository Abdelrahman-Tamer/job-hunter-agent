"""Daily ingestion, scoring, and notification pipeline runner."""

import asyncio
import weakref
import zoneinfo
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import and_, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from src.bot.formatters import build_job_inline_keyboard, format_job_card
from src.bot.telegram_client import TelegramClient
from src.core.config import settings
from src.core.logging import logger
from src.core.security import is_safe_url
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


_DIRECT_CONTACT_FIELDS: tuple[str, ...] = ("direct_email", "whatsapp_contact", "apply_form_url")
MAX_SOCIAL_AI_CHECKS: int = 10
FAST_RADAR_SOURCE_NAMES: tuple[str, ...] = ("wuzzuf", "linkedin_jobs", "linkedin_social")
FAST_RADAR_MAX_ALERTS: int = 5


def _is_safe_enriched_value(field: str, value: str) -> bool:
    """Validate enriched contact values before persisting into existing Job.raw_payload."""
    lowered = value.lower()
    if lowered.startswith(("javascript:", "data:", "vbscript:")):
        return False
    if field == "apply_form_url":
        return is_safe_url(value)
    if field == "whatsapp_contact" and lowered.startswith(("http://", "https://")):
        return is_safe_url(value)
    return True


def _enrich_existing_job(existing: Job, normalized: NormalizedJobData) -> bool:
    """Merge missing direct contact metadata, skills, and richer description into a deduplicated Job."""
    incoming_payload = normalized.raw_payload if isinstance(normalized.raw_payload, dict) else {}
    existing_payload = dict(existing.raw_payload) if isinstance(existing.raw_payload, dict) else {}
    enriched = False

    for field in _DIRECT_CONTACT_FIELDS:
        existing_val = str(existing_payload.get(field) or "").strip()
        incoming_val = str(incoming_payload.get(field) or "").strip()
        if not existing_val and incoming_val and _is_safe_enriched_value(field, incoming_val):
            existing_payload[field] = incoming_val
            enriched = True

    if normalized.required_skills:
        existing_skills = list(existing.required_skills or [])
        existing_lower = {str(s).strip().lower() for s in existing_skills if str(s).strip()}
        added_skills = [
            str(s).strip()
            for s in normalized.required_skills
            if str(s).strip() and str(s).strip().lower() not in existing_lower
        ]
        if added_skills:
            existing.required_skills = [*existing_skills, *added_skills]
            flag_modified(existing, "required_skills")
            enriched = True

    existing_desc = (existing.description_text or "").strip()
    incoming_desc = (normalized.description_text or "").strip()
    if incoming_desc and (
        not existing_desc
        or (len(incoming_desc) > len(existing_desc) + 40 and len(existing_desc) < 300)
        or len(incoming_desc) > len(existing_desc) * 2
    ):
        existing.description_text = incoming_desc
        if normalized.description_html and not existing.description_html:
            existing.description_html = normalized.description_html
        enriched = True

    if enriched:
        existing_payload["enriched_from_source"] = normalized.source_name
        existing.raw_payload = existing_payload
        flag_modified(existing, "raw_payload")

    return enriched


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

    def get_cairo_now(self) -> datetime:
        """Return current aware datetime in Africa/Cairo IANA timezone."""
        cairo_tz = zoneinfo.ZoneInfo(settings.TIMEZONE or "Africa/Cairo")
        return datetime.now(cairo_tz)

    def get_cairo_date_key(self) -> str:
        """Return current date formatted YYYY-MM-DD in Africa/Cairo IANA timezone."""
        return self.get_cairo_now().strftime("%Y-%m-%d")

    async def _acquire_or_create_run(
        self,
        session: AsyncSession,
        run_key: str,
        run_date: str,
        force: bool,
    ) -> tuple[DailyRun, bool]:
        """Acquire database-backed run lock and return (DailyRun, should_execute)."""
        started_at = datetime.now(UTC)
        GeminiJobExtractor.reset_quota_status()

        stmt_run = select(DailyRun).where(DailyRun.run_key == run_key)
        daily_run = (await session.execute(stmt_run)).scalar_one_or_none()

        if daily_run:
            if daily_run.status == RunStatus.COMPLETED and not force:
                logger.info(f"Run {run_key} already completed. Skipping duplicate execution.")
                return daily_run, False
            if daily_run.status == RunStatus.IN_PROGRESS and not force:
                prev_started = daily_run.started_at
                if prev_started and prev_started.tzinfo is None:
                    prev_started = prev_started.replace(tzinfo=UTC)
                elapsed = (started_at - prev_started).total_seconds() if prev_started else 9999
                if elapsed < 900:
                    logger.warning(f"Run {run_key} is currently in progress ({int(elapsed)}s ago). Skipping.")
                    return daily_run, False
                logger.warning(f"Run {run_key} was stale IN_PROGRESS ({int(elapsed)}s ago). Recovering.")
            daily_run.status = RunStatus.IN_PROGRESS
            daily_run.started_at = started_at
            daily_run.error_message = None
        else:
            daily_run = DailyRun(
                run_date=run_date,
                run_key=run_key,
                status=RunStatus.IN_PROGRESS,
                started_at=started_at,
            )
            session.add(daily_run)

        await session.commit()
        await session.refresh(daily_run)
        return daily_run, True

    async def _mark_run_failed(self, session: AsyncSession, daily_run_id: int, run_key: str, exc: Exception) -> None:
        """Persist FAILED state safely after rollback."""
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

    async def _load_enabled_adapters(
        self,
        session: AsyncSession,
        adapters: list[BaseSourceAdapter],
    ) -> tuple[dict[str, Source], list[BaseSourceAdapter]]:
        """Preload/seed Source rows in bulk and return enabled adapters."""
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
            if source_records[source_name].is_enabled:
                enabled_adapters.append(adapter)
            else:
                logger.info(f"Source {source_name} is disabled. Skipping.")

        return source_records, enabled_adapters

    async def _fetch_sources_concurrently(
        self,
        enabled_adapters: list[BaseSourceAdapter],
        fast_mode: bool = False,
    ) -> list[tuple[BaseSourceAdapter, list[Any], str, str | None, int]]:
        """Fetch enabled sources concurrently with 35s timeout and failure isolation."""

        async def _fetch_single_source(adapter: BaseSourceAdapter):
            meta = adapter.source_metadata()
            s_name = meta.name
            s_start = datetime.now(UTC)
            try:
                if fast_mode and s_name == "linkedin_social":
                    coro = adapter.fetch_jobs(query_config={"fast_mode": True, "freshness_tbs": "qdr:d"})
                elif fast_mode and s_name == "wuzzuf":
                    coro = adapter.fetch_jobs(query_config={"fast_mode": True, "freshness_tbs": "qdr:w"})
                else:
                    coro = adapter.fetch_jobs()
                raw_jobs = await asyncio.wait_for(coro, timeout=35.0)
                dur = int((datetime.now(UTC) - s_start).total_seconds())
                return (adapter, raw_jobs, "SUCCESS", None, dur)
            except Exception as exc:  # noqa: BLE001
                dur = int((datetime.now(UTC) - s_start).total_seconds())
                logger.error(f"Source {s_name} failed during pipeline run: {exc}")
                return (adapter, [], "FAILED", str(exc), dur)

        return list(await asyncio.gather(*(_fetch_single_source(a) for a in enabled_adapters)))

    async def _verify_and_merge_social_post(self, normalized: NormalizedJobData) -> bool:
        """
        Invoke Gemini social verification gate on new social posts.
        Returns False when Gemini explicitly flags is_real_hiring_post == False.
        Merges discovered contacts and min_years_required otherwise.
        """
        verification = await self.gemini.verify_social_hiring_post(
            text=normalized.description_text,
            title=normalized.title,
        )
        if not isinstance(verification, dict):
            return True

        if verification.get("is_real_hiring_post") is False:
            logger.info(
                f"Gemini social gate rejected non-hiring post: '{normalized.title}' ({normalized.source_url})"
            )
            return False

        payload = dict(normalized.raw_payload) if isinstance(normalized.raw_payload, dict) else {}
        for field in _DIRECT_CONTACT_FIELDS:
            existing_val = str(payload.get(field) or "").strip()
            candidate_val = str(verification.get(field) or "").strip()
            if not existing_val and candidate_val and _is_safe_enriched_value(field, candidate_val):
                payload[field] = candidate_val

        min_years = verification.get("min_years_required")
        if (
            normalized.required_experience_years is None
            and isinstance(min_years, (int, float))
            and not isinstance(min_years, bool)
            and 0 <= float(min_years) <= 25
        ):
            normalized.required_experience_years = float(min_years)

        normalized.raw_payload = payload
        return True

    async def _ingest_fetch_results(
        self,
        session: AsyncSession,
        daily_run: DailyRun,
        profile: Any,
        source_records: dict[str, Source],
        fetch_results: list[tuple[BaseSourceAdapter, list[Any], str, str | None, int]],
    ) -> tuple[int, int, list[Job], dict[str, Any]]:
        """Normalize, filter, deduplicate, AI-verify, score, and persist fetched listings."""
        source_metrics: dict[str, Any] = {}
        total_discovered = 0
        total_new = 0
        gemini_requests_count = 0
        social_ai_checks_count = 0
        newly_saved_jobs: list[Job] = []

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

                    # Freshness filter: Drop stale jobs older than MAX_JOB_AGE_DAYS
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

                    is_social = bool(getattr(normalized, "is_social_post", False) or "social" in source_name.lower())

                    # Social Hiring Intent Filter: Disqualify job-seeker posts (#OpenToWork, portfolio promo)
                    if is_social:
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

                    # Classify job into target tracks
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
                        logger.debug(
                            f"Skipping job classified outside frontend tracks: '{normalized.title}' at {normalized.company}"
                        )
                        continue

                    # Deduplication check + cross-source enrichment
                    existing, _match_type = await DeduplicationEngine.find_existing_job(session, normalized)
                    if existing:
                        existing.last_seen_at = datetime.now(UTC)
                        if _enrich_existing_job(existing, normalized):
                            logger.info(
                                f"Enriched existing job id={existing.id} ({existing.source_name}) "
                                f"with metadata from {normalized.source_name}."
                            )
                        continue

                    # Social AI Verification Gate (only on NEW social candidates, capped at MAX_SOCIAL_AI_CHECKS = 10)
                    if (
                        is_social
                        and settings.GEMINI_EXTRACTION_ENABLED
                        and social_ai_checks_count < MAX_SOCIAL_AI_CHECKS
                    ):
                        social_ai_checks_count += 1
                        try:
                            keep_post = await self._verify_and_merge_social_post(normalized)
                            if not keep_post:
                                continue
                        except Exception as social_ai_exc:  # noqa: BLE001
                            logger.warning(f"Gemini social verification skipped for {normalized.title}: {social_ai_exc}")

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

                    # Deterministic 0-100 Scoring
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

            source_metrics[source_name] = {
                "status": status_str,
                "fetched": fetched_count,
                "new": new_count,
                "duration_seconds": duration,
            }

        return total_discovered, total_new, newly_saved_jobs, source_metrics

    async def _query_unsent_eligible_jobs(
        self,
        session: AsyncSession,
        min_score: float,
        limit: int | None = None,
    ) -> list[Job]:
        """Select active, unexpired jobs with score >= min_score that have no SENT notification."""
        stmt = (
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
                Job.match_score >= min_score,
                NotificationLog.id == None,
            )
            .order_by(
                (Job.eligibility == GeographicEligibility.EGYPT_ELIGIBLE).desc(),
                Job.match_score.desc(),
            )
        )
        if limit is not None:
            stmt = stmt.limit(limit)
        res = await session.execute(stmt)
        return list(res.scalars().all())

    async def _dispatch_telegram_card(
        self,
        session: AsyncSession,
        daily_run: DailyRun,
        job: Job,
        recipient_chat_id: int,
        notification_type: NotificationType,
    ) -> bool:
        """Send a single Telegram job card and record NotificationLog truthfully."""
        card = format_job_card(job)
        markup = build_job_inline_keyboard(job)
        msg_res = await self.telegram.send_message(
            chat_id=recipient_chat_id,
            text=card,
            reply_markup=markup,
        )
        sent_ok, msg_id, err_details = _parse_telegram_send_result(msg_res)

        n_log = NotificationLog(
            run_id=daily_run.id,
            job_id=job.id,
            notification_type=notification_type,
            telegram_chat_id=recipient_chat_id,
            telegram_message_id=msg_id,
            status=NotificationStatus.SENT if sent_ok else NotificationStatus.FAILED,
            error_details=err_details,
        )
        session.add(n_log)
        await session.commit()
        return sent_ok

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
            daily_run, should_run = await self._acquire_or_create_run(
                session=session,
                run_key=run_key,
                run_date=date_str,
                force=force,
            )
            if not should_run:
                return daily_run

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
                await self._mark_run_failed(session, daily_run_id, run_key, exc)
                raise

    async def execute_fast_radar_run(
        self,
        session: AsyncSession,
        force: bool = False,
        target_chat_id: int | None = None,
    ) -> DailyRun:
        """
        Execute a lean Fast-Radar pulse across high-velocity fresh sources only
        (Wuzzuf, LinkedIn Jobs, LinkedIn Social in fast_mode=True <= 2 Serper credits).
        Alerts immediately ONLY for unsent active matches >= FAST_RADAR_MIN_SCORE (max 5);
        stays completely silent on Telegram when 0 hot matches are found.
        """
        async with _get_pipeline_run_lock():
            now_cairo = self.get_cairo_now()
            run_key = f"fast-radar-{now_cairo.strftime('%Y-%m-%d-%H')}"
            # Compact 10-char unique key for daily_runs.run_date (never collides with YYYY-MM-DD daily digest)
            run_date = f"{now_cairo.strftime('%y%m%d')}-{now_cairo.strftime('%H')}h"

            daily_run, should_run = await self._acquire_or_create_run(
                session=session,
                run_key=run_key,
                run_date=run_date,
                force=force,
            )
            if not should_run:
                return daily_run

            daily_run_id = daily_run.id
            try:
                profile = await get_or_create_candidate_profile(session)
                recipient_chat_id = target_chat_id or settings.TELEGRAM_OWNER_ID

                fast_adapters = [
                    a
                    for a in self.registry.list_adapters()
                    if a.source_metadata().name in FAST_RADAR_SOURCE_NAMES
                ]
                source_records, enabled_adapters = await self._load_enabled_adapters(session, fast_adapters)
                fetch_results = await self._fetch_sources_concurrently(enabled_adapters, fast_mode=True)
                total_discovered, total_new, _saved, source_metrics = await self._ingest_fetch_results(
                    session=session,
                    daily_run=daily_run,
                    profile=profile,
                    source_records=source_records,
                    fetch_results=fetch_results,
                )

                notified_count = 0
                if recipient_chat_id and profile.digest_enabled:
                    hot_jobs = await self._query_unsent_eligible_jobs(
                        session=session,
                        min_score=float(settings.FAST_RADAR_MIN_SCORE),
                        limit=FAST_RADAR_MAX_ALERTS,
                    )
                    for job in hot_jobs:
                        if await self._dispatch_telegram_card(
                            session=session,
                            daily_run=daily_run,
                            job=job,
                            recipient_chat_id=recipient_chat_id,
                            notification_type=NotificationType.REAL_TIME_ALERT,
                        ):
                            notified_count += 1
                        await asyncio.sleep(0.5)

                daily_run.status = RunStatus.COMPLETED
                daily_run.completed_at = datetime.now(UTC)
                daily_run.jobs_discovered = total_discovered
                daily_run.jobs_new = total_new
                daily_run.jobs_notified = notified_count
                daily_run.metrics = {"mode": "fast_radar", "sources": source_metrics}

                await session.commit()
                await session.refresh(daily_run)
                logger.info(
                    f"Fast-Radar run {run_key} completed: discovered={total_discovered}, new={total_new}, notified={notified_count}"
                )
                return daily_run
            except Exception as exc:
                logger.error(f"Fast-Radar run {run_key} failed with unhandled error: {exc}", exc_info=True)
                await self._mark_run_failed(session, daily_run_id, run_key, exc)
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

        adapters = self.registry.list_adapters()
        source_records, enabled_adapters = await self._load_enabled_adapters(session, adapters)

        if progress_callback:
            await progress_callback(f"📡 Scanning {len(enabled_adapters)} job sources in parallel...", 30)

        fetch_results = await self._fetch_sources_concurrently(enabled_adapters, fast_mode=False)

        total_discovered_raw = sum(len(res[1]) for res in fetch_results)
        if progress_callback:
            await progress_callback(f"📥 Ingested {total_discovered_raw} listings. Matching against 32 verified skills...", 60)

        total_discovered, total_new, _newly_saved_jobs, source_metrics = await self._ingest_fetch_results(
            session=session,
            daily_run=daily_run,
            profile=profile,
            source_records=source_records,
            fetch_results=fetch_results,
        )
        metrics: dict[str, Any] = {"sources": source_metrics}

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
            eligible_for_digest = await self._query_unsent_eligible_jobs(
                session=session,
                min_score=profile.digest_threshold,
            )

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
                        sent_ok = await self._dispatch_telegram_card(
                            session=session,
                            daily_run=daily_run,
                            job=j,
                            recipient_chat_id=recipient_chat_id,
                            notification_type=NotificationType.DAILY_DIGEST,
                        )
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
