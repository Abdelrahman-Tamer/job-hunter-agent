"""Source registry to configure, manage, and coordinate all active adapters."""

import asyncio
import httpx

from src.core.config import settings
from src.core.logging import logger
from src.sources.base import BaseSourceAdapter, SourceMetadata
from src.sources.egypt_community import EgyptCommunityAdapter
from src.sources.greenhouse import GreenhouseAdapter
from src.sources.himalayas import HimalayasAdapter
from src.sources.jobicy import JobicyAdapter
from src.sources.lever import LeverAdapter
from src.sources.linkedin_posts import LinkedInSocialAdapter
from src.sources.remotive import RemotiveAdapter
from src.sources.rss import RSSAdapter
from src.sources.workable import WorkableAdapter


class SourceRegistry:
    """Central registry and lifecycle manager for job source adapters."""

    def __init__(self):
        self._adapters: dict[str, BaseSourceAdapter] = {}

    def register(self, adapter: BaseSourceAdapter) -> None:
        """Register an adapter instance."""
        meta = adapter.source_metadata()
        self._adapters[meta.name] = adapter
        logger.debug(f"Registered source adapter: {meta.name} ({meta.source_type})")

    def get(self, name: str) -> BaseSourceAdapter | None:
        """Retrieve an adapter by unique name."""
        return self._adapters.get(name)

    def list_adapters(self) -> list[BaseSourceAdapter]:
        """Return all registered adapters."""
        return list(self._adapters.values())

    def list_metadata(self) -> list[SourceMetadata]:
        """Return metadata for all registered adapters."""
        return [adapter.source_metadata() for adapter in self._adapters.values()]

    async def check_all_health(self) -> dict[str, bool]:
        """Execute health checks across all registered adapters concurrently."""
        async def _probe(name: str, adapter: BaseSourceAdapter) -> tuple[str, bool]:
            try:
                ok = bool(await asyncio.wait_for(adapter.health_check(), timeout=10.0))
                return name, ok
            except (asyncio.TimeoutError, httpx.HTTPError, ValueError, RuntimeError, OSError, TimeoutError, TypeError, AttributeError) as exc:
                logger.error(f"Health check exception for {name}: {exc}")
                return name, False
            except Exception as exc:  # noqa: BLE001
                logger.error(f"Unexpected health check error for {name}: {exc}")
                return name, False

        pairs = await asyncio.gather(*(_probe(n, a) for n, a in self._adapters.items()))
        return dict(pairs)


def create_default_registry() -> SourceRegistry:
    """Factory creating registry populated with approved default adapters."""
    registry = SourceRegistry()

    if getattr(settings, "LINKEDIN_SOCIAL_ENABLED", True):
        registry.register(LinkedInSocialAdapter())

    if getattr(settings, "EGYPT_COMMUNITY_ENABLED", True):
        registry.register(EgyptCommunityAdapter())

    if getattr(settings, "JOBICY_ENABLED", True):
        registry.register(JobicyAdapter())

    if getattr(settings, "WORKABLE_ENABLED", True):
        for slug in getattr(settings, "WORKABLE_COMPANY_SLUGS", []):
            registry.register(WorkableAdapter(company_slug=slug))

    if settings.HIMALAYAS_ENABLED:
        registry.register(HimalayasAdapter())

    if settings.REMOTIVE_ENABLED:
        registry.register(RemotiveAdapter())

    if settings.GREENHOUSE_ENABLED:
        for token in settings.GREENHOUSE_BOARD_TOKENS:
            registry.register(GreenhouseAdapter(board_token=token))

    if settings.LEVER_ENABLED:
        for slug in settings.LEVER_COMPANY_SLUGS:
            registry.register(LeverAdapter(company_slug=slug))

    if settings.RSS_ENABLED:
        for idx, feed_url in enumerate(settings.RSS_JOB_FEEDS):
            registry.register(RSSAdapter(feed_url=feed_url, name=f"rss_default_{idx}"))

    return registry
