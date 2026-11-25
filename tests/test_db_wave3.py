"""Wave 3 PostgreSQL, SQLAlchemy ORM performance, and Alembic migration regression tests (TDD)."""

import asyncio
import time
from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import event, inspect, select
from sqlalchemy.ext.asyncio import AsyncSession

from alembic import command
from alembic.config import Config
from src.api.main import app
from src.core.database import get_db_session
from src.models import (
    ApplicationNote,
    ApplicationStatus,
    CandidateProfile,
    DailyRun,
    GeographicEligibility,
    Job,
    JobStatusTracker,
    JobTrack,
    NotificationLog,
    NotificationStatus,
    NotificationType,
    SeniorityLevel,
    Source,
    WorkplaceType,
)
from src.models.profile import DEFAULT_TARGET_ROLES, DEFAULT_TARGET_TECH
from src.sources.base import BaseSourceAdapter, SourceMetadata
from src.sources.registry import SourceRegistry


class _TimedHealthAdapter(BaseSourceAdapter):
    def __init__(self, name: str, delay: float, healthy: bool = True, explode: bool = False):
        self._name = name
        self._delay = delay
        self._healthy = healthy
        self._explode = explode

    def source_metadata(self) -> SourceMetadata:
        return SourceMetadata(
            name=self._name,
            source_type="custom",
            base_url="https://example.com",
            doc_url="https://example.com",
            allowed_usage_summary="Test",
            rate_limit_req_per_minute=60,
            attribution_requirement="Test",
            freshness_limitations="None",
            fields_provided=["title"],
        )

    async def health_check(self) -> bool:
        await asyncio.sleep(self._delay)
        if self._explode:
            raise TimeoutError("simulated timeout")
        return self._healthy

    async def fetch_jobs(self, since=None, query_config=None):
        return []

    def normalize(self, raw_job):
        raise NotImplementedError


def _track_sql(session: AsyncSession) -> list[str]:
    """Attach a listener to record executed SQL statements on the session engine."""
    executed: list[str] = []
    sync_engine = session.bind.sync_engine

    def _before_cursor(conn, cursor, statement, parameters, context, executemany):
        executed.append(statement)

    event.listen(sync_engine, "before_cursor_execute", _before_cursor)
    return executed


# ---------------------------------------------------------------------------
# 1. URL Normalization, PgBouncer Args & Engine Lifecycle
# ---------------------------------------------------------------------------


def test_prepare_async_database_url_and_pgbouncer_pool_config():
    """Verify asyncpg URL normalization strips unsupported params, enables ssl/pool, and skips future=True."""
    from src.core.database import build_async_engine_kwargs, prepare_async_database_url

    supabase_url = (
        "postgres://postgres.proj:secret%23pw@aws-0-eu-central-1.pooler.supabase.com:6543/"
        "postgres?sslmode=require&pgbouncer=true&channel_binding=require"
    )
    sa_url, connect_args, is_sqlite = prepare_async_database_url(supabase_url)

    assert is_sqlite is False
    assert sa_url.drivername == "postgresql+asyncpg"
    assert "sslmode" not in sa_url.query
    assert "pgbouncer" not in sa_url.query
    assert "channel_binding" not in sa_url.query
    assert connect_args["ssl"] is True
    assert connect_args["timeout"] == 10
    assert connect_args["command_timeout"] == 30
    assert connect_args["statement_cache_size"] == 0

    engine_kwargs = build_async_engine_kwargs(supabase_url)
    assert "future" not in engine_kwargs
    assert engine_kwargs["pool_size"] == 5
    assert engine_kwargs["max_overflow"] == 5
    assert engine_kwargs["pool_timeout"] == 10
    assert engine_kwargs["pool_pre_ping"] is True
    assert engine_kwargs["pool_recycle"] == 300
    assert engine_kwargs["connect_args"]["statement_cache_size"] == 0

    # Non-SQLite check must use backend name, not naive `'sqlite' in url`
    _, sqlite_connect_args, pg_named_sqlite_flag = prepare_async_database_url(
        "postgresql://user:pass@db.example.com:5432/not_sqlite_db"
    )
    assert pg_named_sqlite_flag is False
    assert sqlite_connect_args["statement_cache_size"] == 0

    sq_url, sq_args, sq_flag = prepare_async_database_url("sqlite+aiosqlite:///./data/test.db")
    assert sq_flag is True
    assert sq_args == {}
    assert sq_url.get_backend_name() == "sqlite"


def test_alembic_env_shares_url_helper_and_lifespan_disposes_engine():
    """Verify alembic/env.py reuses the shared URL normalizer and main.py disposes the engine on shutdown."""
    alembic_env_text = Path("alembic/env.py").read_text(encoding="utf-8")
    main_text = Path("src/api/main.py").read_text(encoding="utf-8")

    assert "prepare_async_database_url" in alembic_env_text
    assert "engine.dispose()" in main_text


# ---------------------------------------------------------------------------
# 2. Elimination of lazy="selectin" Cascades & Route N+1 Queries
# ---------------------------------------------------------------------------


def test_orm_relationships_do_not_use_default_selectin_cascade():
    """Verify heavy collection/FK relationships do not carry default lazy='selectin'."""
    assert inspect(Source).relationships["jobs"].lazy != "selectin"
    assert inspect(Source).relationships["sync_logs"].lazy != "selectin"
    assert inspect(Job).relationships["source"].lazy != "selectin"
    assert inspect(Job).relationships["tracker"].lazy != "selectin"
    assert inspect(Job).relationships["notifications"].lazy != "selectin"
    assert inspect(Job).relationships["notes"].lazy != "selectin"
    assert inspect(DailyRun).relationships["notifications"].lazy != "selectin"


@pytest.mark.asyncio
async def test_sources_and_jobs_endpoints_stay_within_bounded_query_counts(db_session):
    """Verify GET /api/v1/sources runs <= 2 SQL queries and GET /api/v1/jobs runs <= 3 without descriptions."""
    src1 = Source(
        name="himalayas",
        source_type="api",
        base_url="https://himalayas.app",
        doc_url="https://himalayas.app",
        is_enabled=True,
        attribution_text="Himalayas",
    )
    src2 = Source(
        name="remotive",
        source_type="api",
        base_url="https://remotive.com",
        doc_url="https://remotive.com",
        is_enabled=True,
        attribution_text="Remotive",
    )
    db_session.add_all([src1, src2])
    await db_session.flush()

    jobs = []
    for idx in range(10):
        jobs.append(
            Job(
                source_id=src1.id,
                source_name="himalayas",
                source_job_id=f"perf-{idx}",
                source_url=f"https://example.com/perf/{idx}",
                canonical_url_hash=f"perfhash{idx}",
                original_application_url=f"https://example.com/perf/{idx}",
                company=f"PerfCo {idx}",
                title=f"Angular Engineer {idx}",
                description_text="Heavy description body " * 50,
                description_html="<p>Heavy HTML body</p>" * 50,
                raw_location="Cairo, Egypt",
                workplace_type=WorkplaceType.REMOTE,
                eligibility=GeographicEligibility.EGYPT_ELIGIBLE,
                seniority=SeniorityLevel.JUNIOR,
                job_track=JobTrack.FRONTEND_EGYPT,
                match_score=80.0 + (idx % 3),
                opportunity_segment="EGYPT",
                is_social_post=False,
            )
        )
    db_session.add_all(jobs)
    await db_session.flush()

    for j in jobs:
        db_session.add(JobStatusTracker(job_id=j.id, status=ApplicationStatus.SAVED))
        db_session.add(ApplicationNote(job_id=j.id, note_text="Note"))
        db_session.add(
            NotificationLog(
                job_id=j.id,
                notification_type=NotificationType.DAILY_DIGEST,
                telegram_chat_id=12345,
                status=NotificationStatus.SENT,
            )
        )
    await db_session.commit()

    app.dependency_overrides[get_db_session] = lambda: db_session
    executed = _track_sql(db_session)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        executed.clear()
        resp_src = await ac.get("/api/v1/sources")
        assert resp_src.status_code == 200
        assert len(resp_src.json()) >= 2
        assert len(executed) <= 2, f"Expected <= 2 queries for /sources, got {len(executed)}: {executed}"

        executed.clear()
        resp_jobs = await ac.get("/api/v1/jobs?page=1&limit=5")
        assert resp_jobs.status_code == 200
        payload = resp_jobs.json()
        assert len(payload["items"]) == 5
        assert payload["items"][0]["tracker_status"] == ApplicationStatus.SAVED.value
        assert len(executed) <= 3, f"Expected <= 3 queries for /jobs, got {len(executed)}: {executed}"

        # Ensure list query defers heavy description columns and does not cascade into notes/notifications
        jobs_selects = [q for q in executed if "from jobs" in q.lower()]
        assert jobs_selects
        main_select = [q for q in jobs_selects if "count(" not in q.lower()][0]
        assert "description_text" not in main_select.lower()
        assert "description_html" not in main_select.lower()
        assert "ORDER BY" in main_select.upper() and "jobs.id DESC" in main_select

    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_tracker_list_single_join_defers_descriptions_and_paginates(db_session):
    """Verify GET /api/v1/tracker performs a single jobs JOIN without description blobs and supports pagination."""
    src = Source(
        name="tr_src",
        source_type="api",
        base_url="https://example.com",
        doc_url="https://example.com",
        is_enabled=True,
        attribution_text="Test",
    )
    db_session.add(src)
    await db_session.flush()

    for idx in range(4):
        job = Job(
            source_id=src.id,
            source_name="tr_src",
            source_job_id=f"tr-{idx}",
            source_url=f"https://example.com/tr/{idx}",
            canonical_url_hash=f"trhash{idx}",
            original_application_url=f"https://example.com/tr/{idx}",
            company=f"TrackCo {idx}",
            title=f"Frontend Dev {idx}",
            description_text="Large text " * 40,
            description_html="<div>Large HTML</div>" * 40,
        )
        db_session.add(job)
        await db_session.flush()
        db_session.add(JobStatusTracker(job_id=job.id, status=ApplicationStatus.APPLIED, applied_at=datetime.now(UTC)))
    await db_session.commit()

    app.dependency_overrides[get_db_session] = lambda: db_session
    executed = _track_sql(db_session)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        executed.clear()
        resp = await ac.get("/api/v1/tracker?limit=2&offset=1")
        assert resp.status_code == 200
        items = resp.json()
        assert len(items) == 2
        assert len(executed) == 1, f"Expected single SQL query for /tracker, got {len(executed)}: {executed}"

        sql_stmt = executed[0]
        assert sql_stmt.lower().count("join jobs") == 1, f"Redundant double join detected: {sql_stmt}"
        assert "description_text" not in sql_stmt.lower()
        assert "description_html" not in sql_stmt.lower()

    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# 3. First-Class Indexed Columns & Query Filtering Without JSON Casts
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_jobs_segment_and_is_social_post_column_filtering(db_session):
    """Verify opportunity_segment and is_social_post filter via real columns without CAST(... AS BOOLEAN)."""
    src = Source(
        name="col_src",
        source_type="api",
        base_url="https://example.com",
        doc_url="https://example.com",
        is_enabled=True,
        attribution_text="Test",
    )
    db_session.add(src)
    await db_session.flush()

    j_social_eg = Job(
        source_id=src.id,
        source_name="linkedin_social",
        source_job_id="col-1",
        source_url="https://example.com/1",
        canonical_url_hash="colh1",
        original_application_url="https://example.com/1",
        company="SocialEG",
        title="Angular Dev",
        description_text="Cairo",
        job_track=JobTrack.FRONTEND_EGYPT,
        opportunity_segment="EGYPT",
        is_social_post=True,
        raw_payload={},
    )
    j_board_gcc = Job(
        source_id=src.id,
        source_name="workable_ksa",
        source_job_id="col-2",
        source_url="https://example.com/2",
        canonical_url_hash="colh2",
        original_application_url="https://example.com/2",
        company="GccBoard",
        title="Frontend Dev",
        description_text="Riyadh",
        job_track=JobTrack.FRONTEND_REMOTE_GCC,
        opportunity_segment="REMOTE_GCC_ABROAD",
        is_social_post=False,
        raw_payload={},
    )
    db_session.add_all([j_social_eg, j_board_gcc])
    await db_session.commit()

    app.dependency_overrides[get_db_session] = lambda: db_session
    executed = _track_sql(db_session)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        executed.clear()
        resp_eg = await ac.get("/api/v1/jobs?segment=EGYPT&is_social_post=true")
        assert resp_eg.status_code == 200
        assert resp_eg.json()["total"] == 1
        assert resp_eg.json()["items"][0]["company"] == "SocialEG"
        assert resp_eg.json()["items"][0]["opportunity_segment"] == "EGYPT"
        assert resp_eg.json()["items"][0]["is_social_post"] is True

        for stmt_sql in executed:
            assert "as boolean" not in stmt_sql.lower(), f"Fragile JSON boolean cast found: {stmt_sql}"

        resp_gcc = await ac.get("/api/v1/jobs?segment=REMOTE_GCC_ABROAD&is_social_post=false")
        assert resp_gcc.status_code == 200
        assert resp_gcc.json()["total"] == 1
        assert resp_gcc.json()["items"][0]["company"] == "GccBoard"

    app.dependency_overrides.clear()


def test_alembic_upgrade_downgrade_head_creates_wave3_columns_and_indexes(tmp_path):
    """Verify Alembic upgrade/downgrade/upgrade cleanly manages new columns and composite/partial indexes."""
    db_file = tmp_path / "alembic_wave3_test.db"
    async_db_url = f"sqlite+aiosqlite:///{db_file.as_posix()}"
    sync_db_url = f"sqlite:///{db_file.as_posix()}"

    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", async_db_url)

    with patch("src.core.config.settings.DATABASE_URL", async_db_url):
        command.upgrade(cfg, "head")

        from sqlalchemy import create_engine

        sync_engine = create_engine(sync_db_url)
        insp = inspect(sync_engine)

        job_cols = {c["name"] for c in insp.get_columns("jobs")}
        assert "opportunity_segment" in job_cols
        assert "is_social_post" in job_cols

        job_indexes = {idx["name"] for idx in insp.get_indexes("jobs")}
        for expected_idx in (
            "ix_jobs_opportunity_segment",
            "ix_jobs_is_social_post",
            "ix_jobs_is_expired",
            "ix_jobs_active_score_seen",
            "ix_jobs_active_track_score",
            "ix_jobs_segment_social_score",
            "ix_jobs_expiry_scan",
        ):
            assert expected_idx in job_indexes, f"Missing index {expected_idx} in {job_indexes}"

        tracker_indexes = {idx["name"] for idx in insp.get_indexes("job_status_trackers")}
        assert "ix_job_status_trackers_follow_up_at" in tracker_indexes
        assert "ix_trackers_status_updated" in tracker_indexes

        run_indexes = {idx["name"] for idx in insp.get_indexes("daily_runs")}
        assert "ix_daily_runs_started_at" in run_indexes
        sync_engine.dispose()

        # Verify clean downgrade -1 removes columns and indexes
        command.downgrade(cfg, "-1")
        sync_engine = create_engine(sync_db_url)
        insp_down = inspect(sync_engine)
        job_cols_down = {c["name"] for c in insp_down.get_columns("jobs")}
        assert "opportunity_segment" not in job_cols_down
        assert "is_social_post" not in job_cols_down
        sync_engine.dispose()

        # Re-upgrade cleanly
        command.upgrade(cfg, "head")


@pytest.mark.asyncio
async def test_profile_mutable_defaults_do_not_alias_module_constants(db_session):
    """Verify CandidateProfile list defaults use callable factories and isolate per-instance lists."""
    for col_name in ("target_role_terms", "target_technology_terms", "target_skills"):
        col = CandidateProfile.__table__.columns[col_name]
        assert col.default is not None and col.default.is_callable, f"{col_name} must use callable default factory"

    p1 = CandidateProfile(country="EG")
    p2 = CandidateProfile(country="EG")
    db_session.add_all([p1, p2])
    await db_session.flush()

    assert p1.target_role_terms is not DEFAULT_TARGET_ROLES
    assert p1.target_technology_terms is not DEFAULT_TARGET_TECH
    assert p1.target_skills is not DEFAULT_TARGET_TECH
    p1.target_skills.append("React")
    assert "React" not in p2.target_skills
    assert "React" not in DEFAULT_TARGET_TECH


# ---------------------------------------------------------------------------
# 4. Concurrent Health Checks & Short-Transaction Hygiene
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_registry_check_all_health_runs_concurrently():
    """Verify check_all_health probes adapters concurrently rather than sequentially."""
    registry = SourceRegistry()
    registry.register(_TimedHealthAdapter("a1", delay=0.12, healthy=True))
    registry.register(_TimedHealthAdapter("a2", delay=0.12, healthy=False))
    registry.register(_TimedHealthAdapter("a3", delay=0.12, explode=True))

    start = time.monotonic()
    res = await registry.check_all_health()
    elapsed = time.monotonic() - start

    assert elapsed < 0.30, f"Expected concurrent execution (<0.30s), took {elapsed:.3f}s"
    assert res == {"a1": True, "a2": False, "a3": False}


@pytest.mark.asyncio
async def test_outreach_and_verify_links_release_db_transaction_before_external_calls(db_session, monkeypatch):
    """Verify /outreach, /cover-letter, and /verify-links release DB read transaction before external I/O."""
    src = Source(
        name="tx_src",
        source_type="api",
        base_url="https://example.com",
        doc_url="https://example.com",
        is_enabled=True,
        attribution_text="Test",
    )
    db_session.add(src)
    await db_session.flush()
    job = Job(
        source_id=src.id,
        source_name="tx_src",
        source_job_id="tx-1",
        source_url="https://example.com/tx/1",
        canonical_url_hash="txhash1",
        original_application_url="https://example.com/tx/1",
        company="TxCo",
        title="Frontend Engineer",
        description_text="Angular",
        is_active=True,
        is_expired=False,
    )
    db_session.add(job)
    await db_session.commit()
    target_job_id = job.id

    tx_state_during_gemini: list[bool] = []

    async def fake_outreach(self, **kwargs):
        tx_state_during_gemini.append(db_session.in_transaction())
        return {"connection_note": "Hi", "inmail_dm": "Hello", "follow_up_note": "Follow"}

    async def fake_cover(self, **kwargs):
        tx_state_during_gemini.append(db_session.in_transaction())
        return "Cover Letter"

    monkeypatch.setattr("src.engine.gemini_extractor.GeminiJobExtractor.generate_linkedin_outreach", fake_outreach)
    monkeypatch.setattr("src.engine.gemini_extractor.GeminiJobExtractor.generate_cover_letter", fake_cover)

    async def fake_check_job_url(url, client):
        tx_state_during_gemini.append(db_session.in_transaction())
        return False, "Active (200 OK)"

    monkeypatch.setattr("src.services.expiry_detector.check_job_url", fake_check_job_url)

    app.dependency_overrides[get_db_session] = lambda: db_session
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post(f"/api/v1/jobs/{target_job_id}/outreach")
        assert resp.status_code == 200
        resp_cov = await ac.post(f"/api/v1/jobs/{target_job_id}/cover-letter")
        assert resp_cov.status_code == 200
        resp_ver = await ac.post("/api/v1/jobs/verify-links?limit=5")
        assert resp_ver.status_code == 200
        assert tx_state_during_gemini == [False, False, False], (
            f"DB transaction stayed open during external calls: {tx_state_during_gemini}"
        )

    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_runner_preloads_sources_in_single_query(db_session, monkeypatch):
    """Verify DailyPipelineRunner preloads existing Source rows in one batch query instead of per-adapter SELECTs."""
    from src.scheduler.runner import DailyPipelineRunner

    registry = SourceRegistry()
    for i in range(6):
        registry.register(_TimedHealthAdapter(f"batch_src_{i}", delay=0.0))

    db_session.add_all(
        [
            Source(
                name=f"batch_src_{i}",
                source_type="custom",
                base_url="https://example.com",
                doc_url="https://example.com",
                is_enabled=False,
                attribution_text="Test",
            )
            for i in range(6)
        ]
    )
    await db_session.commit()

    monkeypatch.setattr(
        "src.scheduler.runner.scan_and_mark_expired_jobs",
        AsyncMock(return_value={"checked": 0, "expired": 0, "active": 0}),
    )

    mock_tg = AsyncMock()
    mock_tg.send_message.return_value = {"ok": True, "result": {"message_id": 1}}
    runner = DailyPipelineRunner(registry=registry, telegram_client=mock_tg, gemini_extractor=AsyncMock())

    executed = _track_sql(db_session)
    executed.clear()
    await runner.execute_daily_run(db_session, force=True, target_chat_id=None)

    source_selects = [q for q in executed if "from sources" in q.lower()]
    assert len(source_selects) == 1, f"Expected 1 batch SELECT on sources, got {len(source_selects)}: {source_selects}"
