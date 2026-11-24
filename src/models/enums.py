"""Domain enums for Job Hunter Agent."""

from enum import Enum


class GeographicEligibility(str, Enum):
    """
    Geographic eligibility classification according to approved product rules.
    """
    EGYPT_ELIGIBLE = "EGYPT_ELIGIBLE"
    REMOTE_WORLDWIDE = "REMOTE_WORLDWIDE"
    REMOTE_REGION_POSSIBLE = "REMOTE_REGION_POSSIBLE"
    RELOCATION_REQUIRED = "RELOCATION_REQUIRED"
    NOT_ELIGIBLE = "NOT_ELIGIBLE"
    UNKNOWN = "UNKNOWN"


class JobTrack(str, Enum):
    """
    Explicit search and classification tracks for Frontend opportunities:
    1. FRONTEND_EGYPT: Frontend Engineering opportunities based in Egypt (Cairo, Giza, Alexandria, Egypt-wide Remote; On-site, Hybrid, Remote).
    2. FRONTEND_REMOTE_GCC: Frontend Engineering opportunities outside Egypt (Arab Gulf / GCC & International; Remote ONLY).
    3. FRONTEND_INTERN: Frontend Internships / Trainee / Fresh graduate roles.
    4. WEB_ANGULAR: Web & Frontend Development with primary Angular/modern frontend focus.
    5. NO_EXP_REMOTE: Legacy track (deprecated in frontend-only radar).
    6. SOFTWARE_INTERN: Legacy track (deprecated in frontend-only radar).
    7. OTHER: Unclassified or outside target frontend engineering scope.
    """
    FRONTEND_EGYPT = "FRONTEND_EGYPT"
    FRONTEND_REMOTE_GCC = "FRONTEND_REMOTE_GCC"
    FRONTEND_INTERN = "FRONTEND_INTERN"
    WEB_ANGULAR = "WEB_ANGULAR"
    NO_EXP_REMOTE = "NO_EXP_REMOTE"
    SOFTWARE_INTERN = "SOFTWARE_INTERN"
    OTHER = "OTHER"


class OpportunitySegment(str, Enum):
    """
    The two top-level geographic segments for the Frontend Radar:
    1. EGYPT: Cairo, Giza, Alexandria, and Egypt-wide remote (On-site, Hybrid, Remote).
    2. REMOTE_GCC_ABROAD: Arab Gulf / GCC (KSA, UAE, Qatar, Kuwait, Bahrain, Oman) and International remote (Remote ONLY).
    3. OTHER: Outside eligible geography or work-mode boundaries.
    """
    EGYPT = "EGYPT"
    REMOTE_GCC_ABROAD = "REMOTE_GCC_ABROAD"
    OTHER = "OTHER"


class SourceCategory(str, Enum):
    """Origin category of job opportunity."""
    JOB_BOARD = "JOB_BOARD"
    SOCIAL_POST = "SOCIAL_POST"



class WorkplaceType(str, Enum):
    """Workplace setting."""
    ON_SITE = "ON_SITE"
    HYBRID = "HYBRID"
    REMOTE = "REMOTE"
    UNKNOWN = "UNKNOWN"


class SeniorityLevel(str, Enum):
    """Job seniority level."""
    INTERNSHIP = "INTERNSHIP"
    GRADUATE = "GRADUATE"
    ENTRY = "ENTRY"
    JUNIOR = "JUNIOR"
    ASSOCIATE = "ASSOCIATE"
    MID = "MID"
    SENIOR = "SENIOR"
    LEAD = "LEAD"
    STAFF = "STAFF"
    PRINCIPAL = "PRINCIPAL"
    MANAGER = "MANAGER"
    UNKNOWN = "UNKNOWN"


class EmploymentType(str, Enum):
    """Employment relationship."""
    FULL_TIME = "FULL_TIME"
    PART_TIME = "PART_TIME"
    CONTRACT = "CONTRACT"
    INTERNSHIP = "INTERNSHIP"
    TEMPORARY = "TEMPORARY"
    UNKNOWN = "UNKNOWN"


class SalaryPeriod(str, Enum):
    """Frequency of compensation."""
    YEARLY = "YEARLY"
    MONTHLY = "MONTHLY"
    HOURLY = "HOURLY"


class MatchBand(str, Enum):
    """Deterministic score bracket."""
    EXCELLENT = "EXCELLENT"  # 85 - 100
    STRONG = "STRONG"        # 70 - 84
    POSSIBLE = "POSSIBLE"    # 60 - 69
    LOW = "LOW"              # < 60


class ApplicationStatus(str, Enum):
    """Lifecycle state of an opportunity in the application tracker."""
    DISCOVERED = "DISCOVERED"
    SAVED = "SAVED"
    INTERESTED = "INTERESTED"
    APPLIED = "APPLIED"
    INTERVIEW = "INTERVIEW"
    REJECTED = "REJECTED"
    OFFER = "OFFER"
    ARCHIVED = "ARCHIVED"
    NOT_RELEVANT = "NOT_RELEVANT"


class RunStatus(str, Enum):
    """Daily ingestion run status."""
    PENDING = "PENDING"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class NotificationType(str, Enum):
    """Type of message dispatched."""
    DAILY_DIGEST = "DAILY_DIGEST"
    ZERO_RESULTS = "ZERO_RESULTS"
    REAL_TIME_ALERT = "REAL_TIME_ALERT"
    STATUS_UPDATE = "STATUS_UPDATE"


class NotificationStatus(str, Enum):
    """Status of notification delivery."""
    SENT = "SENT"
    FAILED = "FAILED"
    SKIPPED = "SKIPPED"
