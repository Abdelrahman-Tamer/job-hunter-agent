"""Deterministic Job Matching Engine.

Computes an explainable 0-100 score across 6 distinct dimensions:
1. Role-family relevance (weight: 20)
2. Confirmed skills / technology overlap (weight: 25)
3. Experience and seniority compatibility (weight: 20)
4. Work eligibility and location confidence (weight: 20)
5. Employment-type fit (weight: 10)
6. Freshness and source evidence quality (weight: 5)
"""

from datetime import datetime, timezone
import re
from typing import Any, Dict, List, Optional, Tuple
from pydantic import BaseModel, Field

from src.models.enums import (
    EmploymentType,
    GeographicEligibility,
    JobTrack,
    MatchBand,
    SeniorityLevel,
    WorkplaceType,
)
from src.models.profile import CandidateProfile
from src.engine.track_classifier import classify_job_track


_SKILL_ALIASES: Dict[str, str] = {
    "html5": "html",
    "css3": "css",
    "reactjs": "react",
    "react.js": "react",
    "angularjs": "angular",
    "angular.js": "angular",
    "vuejs": "vue",
    "vue.js": "vue",
    "nodejs": "node",
    "node.js": "node",
    "nextjs": "next.js",
    "nuxtjs": "nuxt",
    "nuxt.js": "nuxt",
    "tailwindcss": "tailwind",
    "tailwind css": "tailwind",
    "bootstrap 5": "bootstrap",
    "bootstrap 4": "bootstrap",
    "restful apis": "rest",
    "rest apis": "rest",
    "rest api": "rest",
}

_KNOWN_SCAN_TECHS: List[str] = [
    "angular",
    "typescript",
    "javascript",
    "html",
    "css",
    "rxjs",
    "ngrx",
    "react",
    "vue",
    "node",
    "python",
    "docker",
    "git",
    "graphql",
]

_RECOGNIZED_TECH_SKILLS = set(_KNOWN_SCAN_TECHS) | set(_SKILL_ALIASES.keys()) | set(_SKILL_ALIASES.values()) | {
    "scss",
    "sass",
    "svelte",
    "sveltekit",
    "redux",
    "pinia",
    "vuex",
    "firebase",
    "supabase",
    "github",
    "vite",
    "webpack",
    "jest",
    "karma",
    "jasmine",
    "cypress",
    "playwright",
    "json",
    "httpclient",
    "next.js",
}


def _normalize_skill_name(skill: str) -> str:
    s = skill.lower().strip()
    return _SKILL_ALIASES.get(s, s)


def _skills_match(job_skill: str, confirmed_skill: str) -> bool:
    """Compare two skill names using canonical aliases and strict word boundaries (no raw substring overlap)."""
    njs = _normalize_skill_name(job_skill)
    ncs = _normalize_skill_name(confirmed_skill)
    if not njs or not ncs:
        return False
    if njs == ncs:
        return True

    # Explicit cross-framework guards (e.g. React vs React Native, Java vs JavaScript)
    if {njs, ncs} == {"java", "javascript"}:
        return False
    if ("react" in (njs, ncs)) and ("react native" in (njs, ncs) or "react-native" in (njs, ncs)):
        return False

    # Boundary-delimited containment only (prevents "react" matching "reactive forms", "c" matching "c#", etc.)
    for shorter, longer in ((njs, ncs), (ncs, njs)):
        if len(shorter) >= 3 and re.search(rf"(?<![\w.#+-]){re.escape(shorter)}(?![\w.#+-])", longer):
            return True
    return False


class ScoreBreakdown(BaseModel):
    role_relevance: float = 0.0
    confirmed_skills: float = 0.0
    experience_seniority: float = 0.0
    work_eligibility: float = 0.0
    employment_type: float = 0.0
    freshness_evidence: float = 0.0
    total: float = 0.0


class MatchResult(BaseModel):
    score: float
    band: MatchBand
    breakdown: ScoreBreakdown
    reasons: List[str] = Field(default_factory=list)
    skill_gaps: List[str] = Field(default_factory=list)
    confidence: float = 1.0
    is_student_conflict: bool = False
    job_track: JobTrack = JobTrack.OTHER


class MatchingEngine:
    """Deterministic, explainable scoring engine in pure Python."""

    WEIGHT_ROLE: float = 20.0
    WEIGHT_SKILLS: float = 25.0
    WEIGHT_EXPERIENCE: float = 20.0
    WEIGHT_ELIGIBILITY: float = 20.0
    WEIGHT_EMPLOYMENT: float = 10.0
    WEIGHT_FRESHNESS: float = 5.0

    def evaluate(
        self,
        job_title: str,
        job_description: str,
        job_skills: List[str],
        seniority: SeniorityLevel,
        employment_type: EmploymentType,
        eligibility: GeographicEligibility,
        published_at: Optional[datetime],
        required_experience_years: Optional[float],
        profile: CandidateProfile,
        job_track: Optional[JobTrack] = None,
    ) -> MatchResult:
        reasons: List[str] = []
        gaps: List[str] = []
        confidence_factors: List[float] = []
        title_lower = job_title.lower()
        desc_lower = job_description[:3000].lower()

        # Classify track if not provided
        if job_track is None:
            job_track = classify_job_track(
                title=job_title,
                description=job_description,
                seniority=seniority,
                employment_type=employment_type,
                required_experience_years=required_experience_years,
            )

        # Check if role is in software / web engineering domain
        is_software_or_tech = (
            any(
                t in title_lower
                for t in [
                    "developer", "engineer", "software", "frontend", "front-end", "front end",
                    "web", "programmer", "angular", "ui", "fullstack", "full stack",
                    "backend", "tech", "coding", "javascript", "typescript", "intern"
                ]
            )
            or any(
                t in desc_lower[:1000]
                for t in ["angular", "typescript", "frontend", "software engineer", "web development"]
            )
        )

        role_score = 0.0
        skills_score = 0.0
        exp_score = 10.0
        is_student_conflict = False

        # -------------------------------------------------------------
        # Track 2: Remote No-Experience Track (Data Entry, Call Center, etc.)
        # -------------------------------------------------------------
        if job_track == JobTrack.NO_EXP_REMOTE:
            # 1. Role Relevance (max 20)
            role_score = 20.0
            reasons.append("Exact track match: Remote entry-level role (Data Entry / Customer Support / Call Center).")

            # 2. Operational / Communication Skills (max 25)
            skills_score = 20.0
            profile_soft = {
                s.lower().strip()
                for s in (
                    (getattr(profile, "soft_skills", []) or [])
                    + (getattr(profile, "languages", []) or [])
                    + (profile.confirmed_skills or [])
                )
            }
            support_skills = {"english", "arabic", "communication", "customer service", "data entry", "excel", "typing"}
            matched_soft = support_skills.intersection(profile_soft)
            if matched_soft:
                skills_score = min(25.0, skills_score + 5.0)
                reasons.append(f"Confirmed operational/communication competencies: {', '.join(sorted(matched_soft))}.")
            else:
                reasons.append("Standard remote operational & customer communication requirements met.")

            # 3. Experience and Seniority (max 20)
            if required_experience_years is None or required_experience_years <= 1.0:
                exp_score = 20.0
                reasons.append("Entry-level / no prior experience required.")
            else:
                exp_score = 14.0
                gaps.append(f"Experience requested ({required_experience_years:.0f}y) exceeds entry-level expectation (-6 pts)")

        # -------------------------------------------------------------
        # Track 3: Frontend & Software Internships Track
        # -------------------------------------------------------------
        elif job_track in (JobTrack.FRONTEND_INTERN, JobTrack.SOFTWARE_INTERN):
            # 1. Role Relevance (max 20)
            role_score = 20.0
            if eligibility == GeographicEligibility.EGYPT_ELIGIBLE:
                reasons.append("🇪🇬 Local Egyptian Technology Internship / Trainee Program.")
            elif any(term in title_lower for term in ["frontend", "front-end", "web", "angular", "react", "vue"]):
                reasons.append("Frontend & Web Engineering Internship opportunity.")
            elif any(term in title_lower for term in ["ai", "machine learning", "data science", "deep learning"]):
                reasons.append("AI & Machine Learning Internship opportunity.")
            else:
                reasons.append("Software Engineering Internship program.")

            # 2. Foundational Tech Skills (max 25)
            confirmed_set = {s.lower().strip() for s in (profile.confirmed_skills or [])}
            target_set = {s.lower().strip() for s in (profile.target_skills or [])}
            all_job_skills = {s.lower().strip() for s in job_skills}
            matched_confirmed = confirmed_set.intersection(all_job_skills)
            matched_targets = target_set.intersection(all_job_skills)

            if matched_confirmed:
                skills_score = min(25.0, 18.0 + len(matched_confirmed) * 3.0)
                reasons.append(f"Confirmed skills matched: {', '.join(sorted(matched_confirmed))}.")
            elif matched_targets:
                skills_score = min(22.0, 15.0 + len(matched_targets) * 2.0)
                reasons.append(f"Technical learning interest matched: {', '.join(sorted(matched_targets))}.")
            else:
                skills_score = 18.0 if eligibility == GeographicEligibility.EGYPT_ELIGIBLE else 15.0
                reasons.append("Internship baseline: Foundational software engineering capability.")

            # 3. Experience & Seniority (max 20)
            is_student_only = "student" in title_lower or "current student" in desc_lower or "currently enrolled" in desc_lower
            is_graduate_friendly = "graduate" in title_lower or "recent graduate" in desc_lower or "entry" in title_lower or "junior" in title_lower

            if is_student_only and not is_graduate_friendly:
                is_student_conflict = True
                exp_score = 4.0
                gaps.append("Job appears restricted to currently-enrolled students; candidate is already a graduate (-16 pts)")
            else:
                exp_score = 20.0
                reasons.append("Seniority target: Software Engineering Internship / Trainee role.")

        # -------------------------------------------------------------
        # Track 1: Web & Angular Frontend (and default OTHER)
        # -------------------------------------------------------------
        else:
            # 1. Role-family relevance (max 20)
            if not is_software_or_tech or job_track == JobTrack.OTHER:
                role_score = 0.0
                gaps.append("Role domain: Non-frontend role outside target Frontend Engineering scope (-20 pts)")
            elif "angular" in title_lower:
                role_score = 20.0
                reasons.append("Exact target match: Title explicitly mentions Angular.")
            elif any(f in title_lower for f in ["frontend", "front-end", "front end", "ui engineer", "web developer"]):
                role_score = 18.0
                reasons.append("Primary domain match: Frontend / Web Development role.")
                gaps.append("Role title: General web/frontend focus, not exclusively Angular (-2 pts)")
            elif any(f in title_lower for f in ["fullstack", "full stack", "full-stack"]):
                role_score = 16.0
                reasons.append("Web engineering: Full-stack role covering modern frontend.")
                gaps.append("Role title: Full-stack role with backend scope alongside frontend (-4 pts)")
            elif any(r.lower() in title_lower for r in profile.target_role_terms):
                role_score = 15.0
                reasons.append("Approved target role family match (Software Engineering).")
                gaps.append(f"Role title: ({job_title}) targets general software engineering (-5 pts)")
            elif "angular" in desc_lower:
                role_score = 14.0
                reasons.append("Angular mentioned prominently in role description.")
                gaps.append("Role title: Angular is not in the job title (mentioned in description) (-6 pts)")
            elif any(f in desc_lower for f in ["frontend", "javascript", "typescript"]):
                role_score = 10.0
                reasons.append("Frontend technologies required in job description.")
                gaps.append("Role title: Technical role not dedicated to Angular frontend (-10 pts)")
            else:
                role_score = 5.0
                gaps.append("Role title: Tangential to Frontend/Angular target (-15 pts)")

            # 2. Confirmed Skills / Tech overlap (max 25)
            confirmed_set = {s.lower().strip() for s in (profile.confirmed_skills or [])}
            all_job_skills = {s.lower().strip() for s in job_skills}
            recognized_tag_count = sum(
                1 for s in all_job_skills if s in _RECOGNIZED_TECH_SKILLS or _normalize_skill_name(s) in _RECOGNIZED_TECH_SKILLS
            )
            if recognized_tag_count < 2:
                for tech in _KNOWN_SCAN_TECHS:
                    pattern = r"\breact(?![\s-]*native)\b" if tech == "react" else rf"\b{re.escape(tech)}\b"
                    if re.search(pattern, desc_lower) or re.search(pattern, title_lower):
                        all_job_skills.add(tech)

            if not confirmed_set:
                skills_score = 0.0
                gaps.append("Profile has no confirmed skills verified from CV yet (0/25).")
                confidence_factors.append(0.5)
            else:
                matched_confirmed = set()
                for js in all_job_skills:
                    for cs in confirmed_set:
                        if _skills_match(js, cs):
                            matched_confirmed.add(js)
                            break

                unmatched_job_skills = all_job_skills - matched_confirmed

                if matched_confirmed:
                    ratio = len(matched_confirmed) / max(len(all_job_skills), 1)
                    skills_score = min(25.0, 25.0 * ratio + (5.0 if any("angular" in m for m in matched_confirmed) else 0.0))
                    skills_score = min(25.0, skills_score)
                    reasons.append(f"Confirmed skills matched: {', '.join(sorted(matched_confirmed))}.")
                else:
                    skills_score = 3.0
                    gaps.append(f"Missing confirmed overlap with job skills: {', '.join(sorted(unmatched_job_skills)[:4])}.")

                if unmatched_job_skills:
                    missing_sorted = sorted(list(unmatched_job_skills))
                    missing_display = ", ".join(missing_sorted[:5])
                    deduction = 25.0 - skills_score
                    if deduction > 0.0:
                        gaps.append(f"Missing required skills from CV: {missing_display}{' and others' if len(missing_sorted) > 5 else ''} (-{deduction:.1f} pts)")

            target_set = {s.lower().strip() for s in (profile.target_skills or [])}
            matched_targets = target_set.intersection(all_job_skills)
            if matched_targets and not ("angular" in confirmed_set):
                reasons.append(f"Matches candidate learning/target interest: {', '.join(sorted(matched_targets))} (does not inflate confirmed skill points).")

            # 3. Experience and Seniority Compatibility (max 20)
            is_student_only = "student" in title_lower or "current student" in desc_lower or "currently enrolled" in desc_lower
            is_graduate_friendly = "graduate" in title_lower or "recent graduate" in desc_lower or "entry" in title_lower or "junior" in title_lower

            if is_student_only and not is_graduate_friendly:
                is_student_conflict = True
                exp_score = 4.0
                gaps.append("Job appears restricted to currently-enrolled students; candidate is already a graduate (-16 pts)")
            elif seniority in (SeniorityLevel.GRADUATE, SeniorityLevel.ENTRY, SeniorityLevel.JUNIOR, SeniorityLevel.INTERNSHIP):
                exp_score = 18.0
                reasons.append(f"Seniority ({seniority.value}) matches entry/graduate profile.")
            elif seniority in (SeniorityLevel.ASSOCIATE, SeniorityLevel.MID):
                exp_score = 14.0
                reasons.append(f"Mid/Associate seniority ({seniority.value}); feasible with demonstrated project proficiency.")
                gaps.append(f"Seniority requested is mid-level ({seniority.value}) vs. junior/entry candidate profile (-6 pts)")
            elif seniority in (SeniorityLevel.SENIOR, SeniorityLevel.LEAD, SeniorityLevel.STAFF, SeniorityLevel.PRINCIPAL, SeniorityLevel.MANAGER):
                exp_score = 6.0
                gaps.append(f"Seniority requested ({seniority.value}) requires advanced production experience (-14 pts)")
            else:
                exp_score = 12.0
                confidence_factors.append(0.7)

            if required_experience_years is not None:
                if required_experience_years <= 2.0:
                    exp_score = max(exp_score, 18.0)
                    reasons.append(f"Experience requirement ({required_experience_years:.0f}y) is accessible.")
                elif required_experience_years > 2.0:
                    exp_score = min(exp_score, 8.0)
                    gaps.append(f"Experience required ({required_experience_years:.0f}+ years) exceeds 1-2 years (-12 pts)")

        # -------------------------------------------------------------
        # 4. Work Eligibility & Location (max 20)
        # Hard penalty for NOT_ELIGIBLE and On-site outside Egypt
        # -------------------------------------------------------------
        elig_score = 0.0
        if eligibility == GeographicEligibility.EGYPT_ELIGIBLE:
            elig_score = 20.0
            reasons.append("🇪🇬 Local Egypt Focus: Direct hiring in Egypt (on-site, hybrid, or verified local remote).")
        elif eligibility == GeographicEligibility.REMOTE_WORLDWIDE:
            elig_score = 18.0
            reasons.append("Worldwide remote: Applicants in Egypt permitted.")
            gaps.append("Worldwide remote: International competition and timezone alignment (-2 pts)")
        elif eligibility == GeographicEligibility.REMOTE_REGION_POSSIBLE:
            elig_score = 12.0
            reasons.append("Regional remote (EMEA/MENA): Egypt hiring likely but requires verification.")
            confidence_factors.append(0.7)
            gaps.append("Regional remote: Requires employer confirmation for Egypt hiring (-8 pts)")
        elif eligibility == GeographicEligibility.RELOCATION_REQUIRED:
            elig_score = 0.0
            reasons.append("Relocation required to destination country; relocation willingness not assumed.")
            gaps.append("On-site outside Egypt: Requires physical relocation (-20 pts)")
        elif eligibility == GeographicEligibility.NOT_ELIGIBLE:
            elig_score = 0.0
            gaps.append("Hard filter: Candidate is not geographically eligible (-20 pts)")
        else:
            elig_score = 10.0
            confidence_factors.append(0.5)
            gaps.append("Geographic eligibility is unconfirmed/unknown (-10 pts)")

        # -------------------------------------------------------------
        # 5. Employment-Type Fit (max 10)
        # Full-time, Contract, Internship, Part-time
        # -------------------------------------------------------------
        emp_score = 8.0
        if employment_type == EmploymentType.FULL_TIME:
            emp_score = 10.0
            reasons.append("Full-time employment opportunity.")
        elif employment_type in (EmploymentType.CONTRACT, EmploymentType.INTERNSHIP):
            emp_score = 8.0
            gaps.append(f"Contract type: {employment_type.value} rather than permanent full-time (-2 pts)")
        elif employment_type == EmploymentType.PART_TIME:
            emp_score = 6.0
            gaps.append("Contract type: Part-time rather than full-time (-4 pts)")

        # -------------------------------------------------------------
        # 6. Freshness & Source Evidence Quality (max 5)
        # -------------------------------------------------------------
        fresh_score = 3.0
        if published_at:
            if published_at.tzinfo is None:
                published_at = published_at.replace(tzinfo=timezone.utc)
            age_days = (datetime.now(timezone.utc) - published_at).days
            if age_days <= 3:
                fresh_score = 5.0
                reasons.append("Recently published listing (≤ 3 days ago).")
            elif age_days <= 7:
                fresh_score = 4.0
                gaps.append(f"Posting age: Published {age_days} days ago (full score for ≤ 3 days) (-1 pt)")
            elif age_days <= 14:
                fresh_score = 3.0
                gaps.append(f"Posting age: Published {age_days} days ago (-2 pts)")
            elif age_days <= 30:
                fresh_score = 2.0
                gaps.append(f"Posting age: Published {age_days} days ago (-3 pts)")
            else:
                fresh_score = 1.0
                gaps.append(f"Posting age: Older posting ({age_days} days ago) (-4 pts)")
        else:
            fresh_score = 3.0
            confidence_factors.append(0.8)

        # Total Calculation
        total = role_score + skills_score + exp_score + elig_score + emp_score + fresh_score

        # Hard Cap for Ineligible jobs
        if eligibility == GeographicEligibility.NOT_ELIGIBLE:
            total = min(total, 40.0)

        # Hard Cap for Unclassified Non-Software/Non-Tech jobs outside target tracks
        if not is_software_or_tech and job_track != JobTrack.NO_EXP_REMOTE:
            total = min(total, 25.0)

        # Hard Cap if role is tangential with zero confirmed skills overlap
        if role_score <= 5.0 and skills_score <= 3.0:
            total = min(total, 45.0)

        # Round to 1 decimal place
        total = round(total, 1)

        # Determine Band
        if total >= 85.0:
            band = MatchBand.EXCELLENT
        elif total >= 70.0:
            band = MatchBand.STRONG
        elif total >= 60.0:
            band = MatchBand.POSSIBLE
        else:
            band = MatchBand.LOW

        breakdown = ScoreBreakdown(
            role_relevance=round(role_score, 1),
            confirmed_skills=round(skills_score, 1),
            experience_seniority=round(exp_score, 1),
            work_eligibility=round(elig_score, 1),
            employment_type=round(emp_score, 1),
            freshness_evidence=round(fresh_score, 1),
            total=total,
        )

        overall_confidence = 1.0
        if confidence_factors:
            overall_confidence = round(sum(confidence_factors) / len(confidence_factors), 2)

        return MatchResult(
            score=total,
            band=band,
            breakdown=breakdown,
            reasons=reasons,
            skill_gaps=gaps,
            confidence=overall_confidence,
            is_student_conflict=is_student_conflict,
            job_track=job_track,
        )
