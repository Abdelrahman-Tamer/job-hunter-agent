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
    Explicit search and classification tracks for opportunities:
    1. WEB_ANGULAR: Web & Frontend Development with primary Angular focus.
    2. NO_EXP_REMOTE: Remote entry-level roles (Data Entry, Call Center, Virtual Assistant, Support).
    3. SOFTWARE_INTERN: Software engineering internships across all disciplines (Frontend, Backend, AI/ML, Fullstack).
    4. OTHER: Unclassified or outside target scope.
    """
    WEB_ANGULAR = "WEB_ANGULAR"
    NO_EXP_REMOTE = "NO_EXP_REMOTE"
    SOFTWARE_INTERN = "SOFTWARE_INTERN"
    OTHER = "OTHER"


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
