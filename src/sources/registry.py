"""Source registry to configure, manage, and coordinate all active adapters."""

from typing import Dict, List, Optional
from src.core.config import settings
from src.core.logging import logger
from src.sources.base import BaseSourceAdapter, SourceMetadata
from src.sources.greenhouse import GreenhouseAdapter
from src.sources.himalayas import HimalayasAdapter
from src.sources.lever import LeverAdapter
from src.sources.remotive import RemotiveAdapter
from src.sources.rss import RSSAdapter


class SourceRegistry:
    """Central registry and lifecycle manager for job source adapters."""

    def __init__(self):
        self._adapters: Dict[str, BaseSourceAdapter] = {}

    def register(self, adapter: BaseSourceAdapter) -> None:
        """Register an adapter instance."""
        meta = adapter.source_metadata()
        self._adapters[meta.name] = adapter
        logger.debug(f"Registered source adapter: {meta.name} ({meta.source_type})")

    def get(self, name: str) -> Optional[BaseSourceAdapter]:
        """Retrieve an adapter by unique name."""
        return self._adapters.get(name)

    def list_adapters(self) -> List[BaseSourceAdapter]:
        """Return all registered adapters."""
        return list(self._adapters.values())

    def list_metadata(self) -> List[SourceMetadata]:
        """Return metadata for all registered adapters."""
        return [adapter.source_metadata() for adapter in self._adapters.values()]

    async def check_all_health(self) -> Dict[str, bool]:
        """Execute health checks across all registered adapters concurrently."""
        results: Dict[str, bool] = {}
        for name, adapter in self._adapters.items():
            try:
                results[name] = await adapter.health_check()
            except Exception as exc:
                logger.error(f"Health check exception for {name}: {exc}")
                results[name] = False
        return results


def create_default_registry() -> SourceRegistry:
    """Factory creating registry populated with approved default adapters."""
    registry = SourceRegistry()

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
