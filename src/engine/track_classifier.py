"""Track Classification Engine.

Classifies job opportunities into three target tracks:
1. WEB_ANGULAR: Web & Frontend Engineering (priority Angular)
2. NO_EXP_REMOTE: Remote Entry-Level / No Experience (Data Entry, Call Center, Virtual Assistant)
3. SOFTWARE_INTERN: Software Engineering Internships across all disciplines (Frontend, Backend, AI/ML, Fullstack, DevOps, Mobile)
4. OTHER: Unclassified or outside target scope
"""

import re
from typing import List, Optional

from src.models.enums import EmploymentType, JobTrack, SeniorityLevel, WorkplaceType


# ---------------------------------------------------------------------------
# Track 3: Software & AI Internships Patterns
# ---------------------------------------------------------------------------
INTERN_TITLE_PATTERN = re.compile(
    r"\b(intern|internship|interns|trainee|traineeship|co-op|coop|apprentice|apprenticeship|fellowship|fellow|متدرب|تدريب)\b",
    re.IGNORECASE,
)

SOFTWARE_TECH_PATTERN = re.compile(
    r"\b("
    r"software|developer|engineer|engineering|programmer|programming|"
    r"frontend|front-end|front end|web|ui|ux|"
    r"backend|back-end|back end|fullstack|full-stack|full stack|"
    r"ai|artificial intelligence|machine learning|ml|deep learning|data science|data scientist|"
    r"nlp|natural language|computer vision|llm|generative ai|neural|"
    r"python|java|javascript|typescript|angular|react|vue|node|nodejs|golang|go developer|c\+\+|c#|\.net|dotnet|php|ruby|rust|"
    r"devops|cloud|infrastructure|sre|qa|quality assurance|testing|test|"
    r"mobile|android|ios|flutter|react native|swift|kotlin|sql|database"
    r")\b",
    re.IGNORECASE,
)

# ---------------------------------------------------------------------------
# Track 1: Web & Angular Frontend Patterns
# ---------------------------------------------------------------------------
ANGULAR_PATTERN = re.compile(
    r"\b(angular|angularjs|ngrx|rxjs)\b",
    re.IGNORECASE,
)

WEB_FRONTEND_TITLE_PATTERN = re.compile(
    r"\b("
    r"frontend|front-end|front end|web developer|web development|web engineer|"
    r"ui developer|ui engineer|ui/ux developer|ui/ux engineer|"
    r"javascript developer|typescript developer|react developer|vue developer|"
    r"fullstack|full-stack|full stack|web programmer"
    r")\b",
    re.IGNORECASE,
)

# ---------------------------------------------------------------------------
# Track 2: Remote No-Experience Patterns (Data Entry, Call Center, Support)
# ---------------------------------------------------------------------------
DATA_ENTRY_PATTERN = re.compile(
    r"\b("
    r"data entry|data clerk|data typist|data processor|data processing|"
    r"data specialist|data operator|typing|transcription|transcriptionist|"
    r"مدخل بيانات|إدخال بيانات"
    r")\b",
    re.IGNORECASE,
)

CALL_CENTER_SUPPORT_PATTERN = re.compile(
    r"\b("
    r"call center|customer service|customer support|customer care|"
    r"chat support|support agent|help desk|client support|support specialist|"
    r"service representative|support representative|inbound|outbound|"
    r"telemarketing|customer experience|خدمة عملاء|خدمه عملاء|كول سنتر"
    r")\b",
    re.IGNORECASE,
)

VIRTUAL_ASSISTANT_PATTERN = re.compile(
    r"\b("
    r"virtual assistant|va|office assistant|administrative assistant|"
    r"admin assistant|content moderator|moderator|operations assistant|"
    r"receptionist|clerk|مساعد افتراضي"
    r")\b",
    re.IGNORECASE,
)

SENIOR_EXCLUSIONS_FOR_NO_EXP = re.compile(
    r"\b(senior|lead|manager|director|head of|vp|principal|chief|architect|supervisor)\b",
    re.IGNORECASE,
)

REMOTE_INDICATORS = re.compile(
    r"\b(remote|anywhere|worldwide|work from home|wfh|telecommute|virtual|home-based)\b",
    re.IGNORECASE,
)


def classify_job_track(
    title: str,
    description: str = "",
    seniority: SeniorityLevel = SeniorityLevel.UNKNOWN,
    employment_type: EmploymentType = EmploymentType.UNKNOWN,
    workplace_type: WorkplaceType = WorkplaceType.UNKNOWN,
    raw_location: Optional[str] = None,
    remote_scope: Optional[str] = None,
    required_experience_years: Optional[float] = None,
) -> JobTrack:
    """Classify a job into one of the three candidate target tracks or OTHER."""
    title_clean = title.strip()
    title_lower = title_clean.lower()
    desc_sample = (description or "")[:2000].lower()

    # 1. Track 3: Software & AI Internships
    # Priority check: Any software/AI role marked as intern/trainee
    is_intern_seniority = (
        seniority == SeniorityLevel.INTERNSHIP
        or employment_type == EmploymentType.INTERNSHIP
    )
    has_intern_title = bool(INTERN_TITLE_PATTERN.search(title_lower))
    is_intern_signal = is_intern_seniority or has_intern_title

    if is_intern_signal:
        # Must belong to software / tech / AI domain
        if SOFTWARE_TECH_PATTERN.search(title_lower) or SOFTWARE_TECH_PATTERN.search(desc_sample):
            return JobTrack.SOFTWARE_INTERN

    # 2. Track 1: Web & Angular Frontend
    # Matches Angular explicitly or Frontend / Web Development roles
    if ANGULAR_PATTERN.search(title_lower) or ANGULAR_PATTERN.search(desc_sample[:800]):
        return JobTrack.WEB_ANGULAR

    if WEB_FRONTEND_TITLE_PATTERN.search(title_lower):
        return JobTrack.WEB_ANGULAR

    # Check description for strong frontend/web focus when title is developer/engineer
    if any(term in desc_sample[:1000] for term in ["frontend", "angular", "typescript", "web development"]) and (
        "developer" in title_lower or "engineer" in title_lower or "web" in title_lower
    ):
        return JobTrack.WEB_ANGULAR

    # 3. Track 2: Remote No-Experience (Data Entry, Call Center, Virtual Assistant)
    is_remote = (
        workplace_type == WorkplaceType.REMOTE
        or bool(REMOTE_INDICATORS.search(title_lower))
        or bool(REMOTE_INDICATORS.search(raw_location or ""))
        or bool(REMOTE_INDICATORS.search(remote_scope or ""))
        or bool(REMOTE_INDICATORS.search(desc_sample[:500]))
    )

    is_no_exp_role = (
        bool(DATA_ENTRY_PATTERN.search(title_lower))
        or bool(CALL_CENTER_SUPPORT_PATTERN.search(title_lower))
        or bool(VIRTUAL_ASSISTANT_PATTERN.search(title_lower))
        or bool(DATA_ENTRY_PATTERN.search(desc_sample[:500]))
        or bool(CALL_CENTER_SUPPORT_PATTERN.search(desc_sample[:500]))
    )

    is_not_senior = not bool(SENIOR_EXCLUSIONS_FOR_NO_EXP.search(title_lower))
    exp_ok = required_experience_years is None or required_experience_years <= 1.0

    if is_remote and is_no_exp_role and is_not_senior and exp_ok:
        return JobTrack.NO_EXP_REMOTE

    # Default: outside target tracks
    return JobTrack.OTHER
