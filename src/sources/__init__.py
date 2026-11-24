"""Job source adapters package."""

from src.sources.base import (
    BaseSourceAdapter,
    NormalizedJobData,
    RawJobData,
    SourceMetadata,
)
from src.sources.egypt_community import EgyptCommunityAdapter
from src.sources.greenhouse import GreenhouseAdapter
from src.sources.himalayas import HimalayasAdapter
from src.sources.jobicy import JobicyAdapter
from src.sources.lever import LeverAdapter
from src.sources.linkedin_posts import LinkedInSocialAdapter
from src.sources.registry import SourceRegistry, create_default_registry
from src.sources.remotive import RemotiveAdapter
from src.sources.rss import RSSAdapter
from src.sources.workable import WorkableAdapter

__all__ = [
    "BaseSourceAdapter",
    "SourceMetadata",
    "RawJobData",
    "NormalizedJobData",
    "EgyptCommunityAdapter",
    "JobicyAdapter",
    "WorkableAdapter",
    "HimalayasAdapter",
    "RemotiveAdapter",
    "GreenhouseAdapter",
    "LeverAdapter",
    "LinkedInSocialAdapter",
    "RSSAdapter",
    "SourceRegistry",
    "create_default_registry",
]
