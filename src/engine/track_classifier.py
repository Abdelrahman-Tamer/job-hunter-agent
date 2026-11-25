"""Track Classification Engine refocused on Frontend Engineering.

Classifies verified frontend opportunities into:
1. JobTrack.FRONTEND_EGYPT / WEB_ANGULAR: Egypt-based Frontend Engineering (Cairo, Giza, Alexandria, Egypt Remote).
2. JobTrack.FRONTEND_REMOTE_GCC: Outside Egypt Remote Frontend Engineering (Arab Gulf / GCC & International).
3. JobTrack.FRONTEND_INTERN: Frontend Engineering Internships, Trainee programs, and Fresh Graduate roles.
4. JobTrack.OTHER: Any non-frontend, non-technical, or out-of-scope opportunities (strictly rejected).
"""

import re
from typing import List, Optional

from src.engine.frontend_filter import is_frontend_opportunity
from src.models.enums import EmploymentType, JobTrack, SeniorityLevel, WorkplaceType


INTERN_TITLE_PATTERN = re.compile(
    r"\b(intern|internship|interns|trainee|traineeship|co-op|coop|apprentice|apprenticeship|fellowship|fellow|متدرب|تدريب|تدريب صيفي|منحة|برنامج تدريب|مبادرة|nti|iti|depi|talent program|graduate program|graduate trainee|summer intern|summer trainee)\b",
    re.IGNORECASE,
)

EGYPT_LOC_PATTERN = re.compile(
    r"\b(egypt|cairo|giza|alexandria|alex|smart village|new cairo|nasr city|maadi|dokki|mohandessin|mohandeseen|6th of october|october|sheikh zayed|zayed|sheraton|tagamoa|new capital|mansoura|tanta|assiut|ismailia|suez|port said)\b|(مصر|القاهرة|الجيزة|الاسكندرية|الإسكندرية|المعادي|مدينة نصر|القرية الذكية|الدقي|المهندسين|أكتوبر|زايد|التجمع|طنطا|المنصورة|أسيوط|الإسماعيلية|السويس|بورسعيد)",
    re.IGNORECASE,
)

GCC_LOC_PATTERN = re.compile(
    r"\b(gcc|gulf|saudi|saudi arabia|ksa|riyadh|jeddah|dammam|khobar|neom|uae|united arab emirates|dubai|abu dhabi|sharjah|ajman|qatar|doha|kuwait|bahrain|manama|oman|muscat)\b|(الرياض|جدة|الدمام|الخبر|نيوم|دبي|أبوظبي|ابوظبي|الشارقة|عجمان|السعودية|المملكة العربية السعودية|الإمارات|الامارات|قطر|الدوحة|الكويت|البحرين|المنامة|عمان|سلطنة عمان|مسقط|الخليج|دول الخليج|الشرق الأوسط)",
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
    skills: Optional[List[str]] = None,
) -> JobTrack:
    """
    Classify opportunity into Frontend Radar tracks.
    Enforces strict frontend-only domain boundaries.
    """
    # Step 1: Strict Frontend-only check
    is_fe, _ = is_frontend_opportunity(title=title, description=description, skills=skills)
    if not is_fe:
        return JobTrack.OTHER

    title_lower = title.strip().lower()
    desc_sample = (description or "")[:1500].lower()
    full_loc = f"{raw_location or ''} {remote_scope or ''}".lower()

    # Step 2: Frontend Internship / Trainee
    is_intern = (
        seniority == SeniorityLevel.INTERNSHIP
        or employment_type == EmploymentType.INTERNSHIP
        or bool(INTERN_TITLE_PATTERN.search(title_lower))
    )
    if is_intern:
        return JobTrack.FRONTEND_INTERN

    # Step 3: Geographic segmentation if location is provided
    has_egypt = bool(EGYPT_LOC_PATTERN.search(full_loc)) or bool(EGYPT_LOC_PATTERN.search(desc_sample[:500]))
    if has_egypt:
        return JobTrack.FRONTEND_EGYPT

    has_gcc_in_loc = bool(GCC_LOC_PATTERN.search(full_loc))
    has_gcc = has_gcc_in_loc or bool(GCC_LOC_PATTERN.search(desc_sample[:500]))
    if workplace_type == WorkplaceType.REMOTE and (has_gcc or "worldwide" in full_loc or "emea" in full_loc):
        return JobTrack.FRONTEND_REMOTE_GCC

    # Reject non-remote (on-site, hybrid, or unknown workplace) roles located outside Egypt
    loc_clean = full_loc.strip()
    is_worldwide_or_remote_label = any(w in loc_clean for w in ("worldwide", "global", "anywhere", "remote"))
    if workplace_type in (WorkplaceType.ON_SITE, WorkplaceType.HYBRID) and not has_egypt and (has_gcc or bool(loc_clean)):
        return JobTrack.OTHER
    if workplace_type != WorkplaceType.REMOTE and not has_egypt and (has_gcc_in_loc or (bool(loc_clean) and not is_worldwide_or_remote_label)):
        return JobTrack.OTHER

    # Step 4: Default positive frontend match
    return JobTrack.WEB_ANGULAR
