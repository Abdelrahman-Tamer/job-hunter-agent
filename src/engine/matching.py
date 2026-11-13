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
    MatchBand,
    SeniorityLevel,
    WorkplaceType,
)
from src.models.profile import CandidateProfile


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
    ) -> MatchResult:
        reasons: List[str] = []
        gaps: List[str] = []
        confidence_factors: List[float] = []
        title_lower = job_title.lower()
        desc_lower = job_description[:3000].lower()

        # -------------------------------------------------------------
        # 1. Role-family relevance (max 20)
        # Priority: Angular / Frontend > Web Dev / Fullstack > General SE
        # -------------------------------------------------------------
        role_score = 0.0
        if "angular" in title_lower:
            role_score = 20.0
            reasons.append("Exact target match: Title explicitly mentions Angular.")
        elif any(f in title_lower for f in ["frontend", "front-end", "front end", "ui engineer", "web developer"]):
            role_score = 18.0
            reasons.append("Primary domain match: Frontend / Web Development role.")
        elif any(r.lower() in title_lower for r in profile.target_role_terms):
            role_score = 15.0
            reasons.append("Approved target role family match (Software Engineering).")
        elif "angular" in desc_lower:
            role_score = 14.0
            reasons.append("Angular mentioned prominently in role description.")
        elif any(f in desc_lower for f in ["frontend", "javascript", "typescript"]):
            role_score = 10.0
            reasons.append("Frontend technologies required in job description.")
        else:
            role_score = 5.0
            gaps.append("Role title is tangential to Frontend/Angular target.")

        # -------------------------------------------------------------
        # 2. Confirmed Skills / Tech overlap (max 25)
        # CRITICAL RULE: Target skills MUST NOT earn confirmed-skill points!
        # -------------------------------------------------------------
        skills_score = 0.0
        confirmed_set = {s.lower().strip() for s in (profile.confirmed_skills or [])}

        # Analyze job requirements
        all_job_skills = {s.lower().strip() for s in job_skills}
        # Check text if job_skills list is empty
        for tech in ["angular", "typescript", "javascript", "html", "css", "rxjs", "ngrx", "react", "vue", "node", "python"]:
            if re.search(rf"\b{re.escape(tech)}\b", desc_lower) or re.search(rf"\b{re.escape(tech)}\b", title_lower):
                all_job_skills.add(tech)

        if not confirmed_set:
            # Candidate has zero confirmed skills verified yet
            skills_score = 0.0
            gaps.append("Profile has no confirmed skills verified from CV yet (0/25).")
            confidence_factors.append(0.5)
        else:
            matched_confirmed = confirmed_set.intersection(all_job_skills)
            unmatched_job_skills = all_job_skills - confirmed_set

            if matched_confirmed:
                ratio = len(matched_confirmed) / max(len(all_job_skills), 1)
                skills_score = min(25.0, 25.0 * ratio + (5.0 if "angular" in matched_confirmed else 0.0))
                skills_score = min(25.0, skills_score)
                reasons.append(f"Confirmed skills matched: {', '.join(sorted(matched_confirmed))}.")
            else:
                skills_score = 3.0
                gaps.append(f"Missing confirmed overlap with job skills: {', '.join(sorted(unmatched_job_skills)[:4])}.")

        # Note target skill alignment transparently without awarding confirmed skill points
        target_set = {s.lower().strip() for s in (profile.target_skills or [])}
        matched_targets = target_set.intersection(all_job_skills)
        if matched_targets and not ("angular" in confirmed_set):
            reasons.append(f"Matches candidate learning/target interest: {', '.join(sorted(matched_targets))} (does not inflate confirmed skill points).")

        # -------------------------------------------------------------
        # 3. Experience and Seniority Compatibility (max 20)
        # Candidate years: unknown/null.
        # Check student-only vs graduate conflict.
        # -------------------------------------------------------------
        exp_score = 10.0  # Base neutral for unknown
        is_student_conflict = False

        # Check student conflict: candidate is a graduate of Egyptian E-Learning University
        is_student_only = "student" in title_lower or "current student" in desc_lower or "currently enrolled" in desc_lower
        is_graduate_friendly = "graduate" in title_lower or "recent graduate" in desc_lower or "entry" in title_lower or "junior" in title_lower

        if is_student_only and not is_graduate_friendly:
            is_student_conflict = True
            exp_score = 4.0
            gaps.append("Job appears restricted to currently-enrolled students; candidate is already a graduate.")
        elif seniority in (SeniorityLevel.GRADUATE, SeniorityLevel.ENTRY, SeniorityLevel.JUNIOR, SeniorityLevel.INTERNSHIP):
            exp_score = 18.0
            reasons.append(f"Seniority ({seniority.value}) matches entry/graduate profile.")
        elif seniority in (SeniorityLevel.ASSOCIATE, SeniorityLevel.MID):
            exp_score = 14.0
            reasons.append(f"Mid/Associate seniority ({seniority.value}); feasible with demonstrated project proficiency.")
        elif seniority in (SeniorityLevel.SENIOR, SeniorityLevel.LEAD, SeniorityLevel.STAFF, SeniorityLevel.PRINCIPAL, SeniorityLevel.MANAGER):
            exp_score = 6.0
            gaps.append(f"Seniority is {seniority.value}; may require substantial industry track record.")
        else:
            # Seniority UNKNOWN
            exp_score = 12.0
            confidence_factors.append(0.7)

        if required_experience_years is not None:
            if required_experience_years <= 2.0:
                exp_score = max(exp_score, 18.0)
                reasons.append(f"Experience requirement ({required_experience_years:.0f}y) is accessible.")
            elif required_experience_years > 4.0:
                exp_score = min(exp_score, 8.0)
                gaps.append(f"Requires {required_experience_years:.0f}+ years experience.")

        # -------------------------------------------------------------
        # 4. Work Eligibility & Location (max 20)
        # Hard penalty for NOT_ELIGIBLE
        # -------------------------------------------------------------
        elig_score = 0.0
        if eligibility == GeographicEligibility.EGYPT_ELIGIBLE:
            elig_score = 20.0
            reasons.append("Full geographic eligibility: Egypt on-site, hybrid, or verified remote.")
        elif eligibility == GeographicEligibility.REMOTE_WORLDWIDE:
            elig_score = 19.0
            reasons.append("Worldwide remote: Applicants in Egypt permitted.")
        elif eligibility == GeographicEligibility.REMOTE_REGION_POSSIBLE:
            elig_score = 12.0
            reasons.append("Regional remote (EMEA/MENA): Egypt hiring likely but requires verification.")
            confidence_factors.append(0.7)
        elif eligibility == GeographicEligibility.RELOCATION_REQUIRED:
            elig_score = 8.0
            reasons.append("Relocation required to destination country; relocation willingness not assumed.")
        elif eligibility == GeographicEligibility.NOT_ELIGIBLE:
            elig_score = 0.0
            gaps.append("Hard filter: Candidate is not geographically eligible.")
        else:
            elig_score = 10.0
            confidence_factors.append(0.5)
            gaps.append("Geographic eligibility is unconfirmed/unknown.")

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
        elif employment_type == EmploymentType.PART_TIME:
            emp_score = 6.0

        # -------------------------------------------------------------
        # 6. Freshness & Source Evidence Quality (max 5)
        # -------------------------------------------------------------
        fresh_score = 3.0
        if published_at:
            age_days = (datetime.now(timezone.utc) - published_at).days
            if age_days <= 3:
                fresh_score = 5.0
                reasons.append("Recently published listing (≤ 3 days ago).")
            elif age_days <= 14:
                fresh_score = 4.0
            else:
                fresh_score = 2.0
        else:
            fresh_score = 3.0
            confidence_factors.append(0.8)

        # Total Calculation
        total = role_score + skills_score + exp_score + elig_score + emp_score + fresh_score

        # Hard Cap for Ineligible jobs
        if eligibility == GeographicEligibility.NOT_ELIGIBLE:
            total = min(total, 40.0)

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
        )
