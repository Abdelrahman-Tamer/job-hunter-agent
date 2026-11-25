"""Application configuration via pydantic-settings."""

from pathlib import Path

from pydantic import Field, model_validator
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
    FRONTEND_ORIGIN: str = "https://bottajobs.onrender.com"

    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./data/job_hunter.db"

    # Timezone & Schedule
    TIMEZONE: str = "Africa/Cairo"
    DAILY_DIGEST_TIME: str = "09:00"

    # Telegram Bot
    TELEGRAM_BOT_TOKEN: str | None = None
    TELEGRAM_OWNER_ID: int | None = None
    TELEGRAM_POLLING: bool = True

    # Gemini AI
    GEMINI_API_KEY: str | None = None
    GEMINI_MODEL: str = "gemini-3.8-flash"
    GEMINI_EXTRACTION_ENABLED: bool = True
    GEMINI_MAX_REQUESTS_PER_RUN: int = 25

    # Candidate Baseline Defaults
    CANDIDATE_COUNTRY: str = "EG"
    CANDIDATE_TIMEZONE: str = "Africa/Cairo"

    # Match thresholds (0 - 100)
    MATCH_THRESHOLD_DIGEST: float = 70.0
    MATCH_THRESHOLD_STORE: float = 50.0
    FAST_RADAR_MIN_SCORE: int = 78

    # Freshness policy (maximum job age in days)
    MAX_JOB_AGE_DAYS: int = 30

    # Default Sources Configuration
    LINKEDIN_SOCIAL_ENABLED: bool = True
    SOCIAL_SEARCH_PROVIDER: str = "auto"
    SOCIAL_SEARCH_API_KEY: str | None = None
    SERPER_API_KEY: str | None = None
    SERPER_FRESHNESS_TBS: str = "qdr:d3"
    SOCIAL_SEARCH_RECENCY: str = "qdr:d3"
    SOCIAL_FEED_URLS: list[str] = Field(default_factory=list)

    WUZZUF_ENABLED: bool = True
    ATS_DORK_ENABLED: bool = True
    LINKEDIN_JOBS_ENABLED: bool = True
    MAJOR_BOARDS_DORK_ENABLED: bool = True
    EGYPT_COMMUNITY_ENABLED: bool = True
    JOBICY_ENABLED: bool = True
    WORKABLE_ENABLED: bool = True
    HIMALAYAS_ENABLED: bool = True
    REMOTIVE_ENABLED: bool = True
    GREENHOUSE_ENABLED: bool = True
    LEVER_ENABLED: bool = True
    RSS_ENABLED: bool = True

    WORKABLE_COMPANY_SLUGS: list[str] = Field(
        default_factory=lambda: ["integrant", "robusta", "lamdax", "foodics", "petroapp"]
    )
    GREENHOUSE_BOARD_TOKENS: list[str] = Field(
        default_factory=lambda: ["canonical", "speechify", "tamara", "cloudflare", "reddit"]
    )
    LEVER_COMPANY_SLUGS: list[str] = Field(
        default_factory=lambda: ["palantir"]
    )
    RSS_JOB_FEEDS: list[str] = Field(
        default_factory=lambda: [
            "https://weworkremotely.com/categories/remote-front-end-programming-jobs.rss",
            "https://weworkremotely.com/categories/remote-programming-jobs.rss",
        ]
    )

    # Rate limiting & timeouts
    DEFAULT_HTTP_TIMEOUT: float = 15.0
    MAX_CONCURRENT_SOURCE_REQUESTS: int = 4
    SOURCE_RETRY_COUNT: int = 3

    @model_validator(mode="after")
    def _sync_serper_keys(self) -> "Settings":
        """Keep SERPER_API_KEY and SOCIAL_SEARCH_API_KEY synchronized when one is configured."""
        if not self.SERPER_API_KEY and self.SOCIAL_SEARCH_API_KEY:
            self.SERPER_API_KEY = self.SOCIAL_SEARCH_API_KEY
        elif not self.SOCIAL_SEARCH_API_KEY and self.SERPER_API_KEY:
            self.SOCIAL_SEARCH_API_KEY = self.SERPER_API_KEY
        return self


settings = Settings()
