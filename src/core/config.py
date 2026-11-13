"""Application configuration via pydantic-settings."""

from pathlib import Path
from typing import List, Optional
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


BASE_DIR = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    """Application settings loaded from environment variables and .env file."""

    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    APP_NAME: str = "Job Hunter Agent"
    APP_ENV: str = "development"
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"
    SECRET_KEY: str = "insecure-default-key-for-dev-only-change-in-production"

    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./data/job_hunter.db"

    # Timezone & Schedule
    TIMEZONE: str = "Africa/Cairo"
    DAILY_DIGEST_TIME: str = "09:00"

    # Telegram Bot
    TELEGRAM_BOT_TOKEN: Optional[str] = None
    TELEGRAM_OWNER_ID: Optional[int] = None
    TELEGRAM_POLLING: bool = False

    # Gemini AI
    GEMINI_API_KEY: Optional[str] = None
    GEMINI_MODEL: str = "gemini-3.8-flash"
    GEMINI_EXTRACTION_ENABLED: bool = True
    GEMINI_MAX_REQUESTS_PER_RUN: int = 25

    # Candidate Baseline Defaults
    CANDIDATE_COUNTRY: str = "EG"
    CANDIDATE_TIMEZONE: str = "Africa/Cairo"

    # Match thresholds (0 - 100)
    MATCH_THRESHOLD_DIGEST: float = 70.0
    MATCH_THRESHOLD_STORE: float = 50.0

    # Default Sources Configuration
    HIMALAYAS_ENABLED: bool = True
    REMOTIVE_ENABLED: bool = True
    GREENHOUSE_ENABLED: bool = True
    LEVER_ENABLED: bool = True
    RSS_ENABLED: bool = True

    GREENHOUSE_BOARD_TOKENS: List[str] = Field(
        default_factory=lambda: ["canonical", "cloudflare", "reddit"]
    )
    LEVER_COMPANY_SLUGS: List[str] = Field(
        default_factory=lambda: ["palantir"]
    )
    RSS_JOB_FEEDS: List[str] = Field(
        default_factory=lambda: [
            "https://weworkremotely.com/categories/remote-front-end-programming-jobs.rss"
        ]
    )

    # Rate limiting & timeouts
    DEFAULT_HTTP_TIMEOUT: float = 15.0
    MAX_CONCURRENT_SOURCE_REQUESTS: int = 4
    SOURCE_RETRY_COUNT: int = 3


settings = Settings()
