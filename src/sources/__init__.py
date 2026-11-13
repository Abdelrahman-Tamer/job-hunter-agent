"""Job source adapters package."""

from src.sources.base import (
    BaseSourceAdapter,
    NormalizedJobData,
    RawJobData,
    SourceMetadata,
)
from src.sources.greenhouse import GreenhouseAdapter
from src.sources.himalayas import HimalayasAdapter
from src.sources.lever import LeverAdapter
from src.sources.registry import SourceRegistry, create_default_registry
from src.sources.remotive import RemotiveAdapter
from src.sources.rss import RSSAdapter

__all__ = [
    "BaseSourceAdapter",
    "SourceMetadata",
    "RawJobData",
    "NormalizedJobData",
    "HimalayasAdapter",
    "RemotiveAdapter",
    "GreenhouseAdapter",
    "LeverAdapter",
    "RSSAdapter",
    "SourceRegistry",
    "create_default_registry",
]
