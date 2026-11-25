"""Job source adapters package."""

from src.sources.ats_dork import GlobalAtsDorkAdapter
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
from src.sources.linkedin_jobs import LinkedInJobsAdapter
from src.sources.linkedin_posts import LinkedInSocialAdapter
from src.sources.major_boards import MajorBoardsDorkAdapter
from src.sources.registry import SourceRegistry, create_default_registry
from src.sources.remotive import RemotiveAdapter
from src.sources.rss import RSSAdapter
from src.sources.workable import WorkableAdapter
from src.sources.wuzzuf import WuzzufAdapter

__all__ = [
    "BaseSourceAdapter",
    "EgyptCommunityAdapter",
    "GlobalAtsDorkAdapter",
    "GreenhouseAdapter",
    "HimalayasAdapter",
    "JobicyAdapter",
    "LeverAdapter",
    "LinkedInJobsAdapter",
    "LinkedInSocialAdapter",
    "MajorBoardsDorkAdapter",
    "NormalizedJobData",
    "RSSAdapter",
    "RawJobData",
    "RemotiveAdapter",
    "SourceMetadata",
    "SourceRegistry",
    "WorkableAdapter",
    "WuzzufAdapter",
    "create_default_registry",
]
