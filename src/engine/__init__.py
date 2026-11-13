"""Intelligence and scoring engine package root."""

from src.engine.eligibility import GeographicEligibilityEngine
from src.engine.matching import MatchingEngine, MatchResult, ScoreBreakdown
from src.engine.deduplication import DeduplicationEngine, compute_url_hash
from src.engine.gemini_extractor import GeminiJobExtractor, ExtractedJobAttributes

__all__ = [
    "GeographicEligibilityEngine",
    "MatchingEngine",
    "MatchResult",
    "ScoreBreakdown",
    "DeduplicationEngine",
    "compute_url_hash",
    "GeminiJobExtractor",
    "ExtractedJobAttributes",
]
