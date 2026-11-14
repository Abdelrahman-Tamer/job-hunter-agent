"""Unit tests for the daily scheduler, idempotency lock, and failure handling."""

from datetime import datetime, timezone
from unittest.mock import AsyncMock
import pytest
from sqlalchemy import select

from src.engine.gemini_extractor import ExtractedJobAttributes
from src.models import (
    DailyRun,
    Job,
    NotificationLog,
    NotificationType,
    RunStatus,
    Source,
)
from src.scheduler.runner import DailyPipelineRunner
from src.sources.base import BaseSourceAdapter, NormalizedJobData, RawJobData, SourceMetadata
from src.sources.registry import SourceRegistry


def create_mock_gemini():
    mock = AsyncMock()
    mock.extract_attributes.return_value = ExtractedJobAttributes()
    return mock


class MockFailingSourceAdapter(BaseSourceAdapter):
    """Adapter that intentionally throws an exception to test isolation."""
    def source_metadata(self) -> SourceMetadata:
        return SourceMetadata(
            name="failing_source",
            source_type="custom",
            base_url="https://fail.example.com",
            doc_url="https://fail.example.com",
            allowed_usage_summary="Mock test source",
            rate_limit_req_per_minute=10,
            attribution_requirement="Mock",
            freshness_limitations="None",
            fields_provided=["title"],
        )

    async def health_check(self) -> bool:
        return False

    async def fetch_jobs(self, since=None, query_config=None):
        raise ConnectionResetError("Simulated provider outage or timeout")

    def normalize(self, raw_job: RawJobData) -> NormalizedJobData:
        raise NotImplementedError()


class MockHealthySourceAdapter(BaseSourceAdapter):
    """Adapter that returns valid jobs."""
    def source_metadata(self) -> SourceMetadata:
        return SourceMetadata(
            name="healthy_source",
            source_type="custom",
            base_url="https://healthy.example.com",
            doc_url="https://healthy.example.com",
            allowed_usage_summary="Mock healthy test source",
            rate_limit_req_per_minute=10,
            attribution_requirement="Mock",
            freshness_limitations="None",
            fields_provided=["title", "companyName"],
        )

    async def health_check(self) -> bool:
        return True

    async def fetch_jobs(self, since=None, query_config=None):
        return [
            RawJobData(
                source_name="healthy_source",
                source_job_id="healthy-101",
                source_url="https://healthy.example.com/job/101",
                payload={
                    "title": "Angular Frontend Engineer",
                    "company": "SuperCorp",
                    "location": "Worldwide",
                    "skills": ["Angular", "TypeScript"],
                },
            )
        ]

    def normalize(self, raw_job: RawJobData) -> NormalizedJobData:
        return NormalizedJobData(
            source_name="healthy_source",
            source_job_id="healthy-101",
            source_url="https://healthy.example.com/job/101",
            canonical_url="https://healthy.example.com/job/101",
            original_application_url="https://healthy.example.com/job/101",
            company="SuperCorp",
            title="Angular Frontend Engineer",
            description_text="Building modern web apps in Angular and TypeScript.",
            raw_location="Worldwide",
            remote_scope="Worldwide",
            required_skills=["Angular", "TypeScript"],
            published_at=datetime.now(timezone.utc),
        )


@pytest.mark.asyncio
async def test_scheduler_idempotency_prevents_duplicate_runs(db_session):
    """Verify that running the pipeline twice for the same date does not duplicate runs or alerts."""
    registry = SourceRegistry()
    registry.register(MockHealthySourceAdapter())
    mock_telegram = AsyncMock()

    runner = DailyPipelineRunner(
        registry=registry,
        telegram_client=mock_telegram,
        gemini_extractor=create_mock_gemini(),
    )

    # First run: completes
    run1 = await runner.execute_daily_run(db_session, target_chat_id=123456)
    assert run1.status == RunStatus.COMPLETED
    assert run1.jobs_new == 1
    assert mock_telegram.send_message.call_count >= 1

    # Record telegram call count
    first_call_count = mock_telegram.send_message.call_count

    # Second run without force: should detect existing completed run and skip!
    run2 = await runner.execute_daily_run(db_session, target_chat_id=123456)
    assert run2.id == run1.id
    assert run2.run_key == run1.run_key
    # No new messages sent!
    assert mock_telegram.send_message.call_count == first_call_count


@pytest.mark.asyncio
async def test_source_failure_isolation(db_session):
    """Verify that one failing source does not stop other sources from executing."""
    registry = SourceRegistry()
    registry.register(MockFailingSourceAdapter())
    registry.register(MockHealthySourceAdapter())
    mock_telegram = AsyncMock()

    runner = DailyPipelineRunner(
        registry=registry,
        telegram_client=mock_telegram,
        gemini_extractor=create_mock_gemini(),
    )
    run = await runner.execute_daily_run(db_session, force=True, target_chat_id=123456)

    assert run.status == RunStatus.COMPLETED
    assert run.metrics["sources"]["failing_source"]["status"] == "FAILED"
    assert run.metrics["sources"]["healthy_source"]["status"] == "SUCCESS"
    assert run.jobs_new == 1


@pytest.mark.asyncio
async def test_zero_results_truthful_summary(db_session):
    """When no new jobs match the threshold, sends honest zero-results report with source health."""
    registry = SourceRegistry()
    mock_telegram = AsyncMock()

    # Empty registry -> 0 discovered
    runner = DailyPipelineRunner(
        registry=registry,
        telegram_client=mock_telegram,
        gemini_extractor=create_mock_gemini(),
    )
    run = await runner.execute_daily_run(db_session, force=True, target_chat_id=123456)

    assert run.jobs_notified == 0
    mock_telegram.send_message.assert_called_once()
    args, kwargs = mock_telegram.send_message.call_args
    assert "لا توجد فرص عمل جديدة تطابق معايير ملفك الشخصي اليوم" in kwargs["text"]
    assert "تقرير النشرة اليومية" in kwargs["text"]
