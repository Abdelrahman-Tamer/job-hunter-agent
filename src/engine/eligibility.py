"""Geographic eligibility classification engine.

Evaluates job locations, remote restrictions, and country criteria
against the candidate's base country (Egypt) deterministically.
"""

import re
from typing import List, Optional, Set, Tuple
from src.models.enums import GeographicEligibility, OpportunitySegment, WorkplaceType


# Standard country references for Egypt, governorates, and major tech districts
EGYPT_IDENTIFIERS: Set[str] = {
    "egypt",
    "eg",
    "cairo",
    "giza",
    "alexandria",
    "alex",
    "egy",
    "smart village",
    "new cairo",
    "nasr city",
    "maadi",
    "dokki",
    "mohandessin",
    "mohandeseen",
    "heliopolis",
    "6th of october",
    "october",
    "sheikh zayed",
    "zayed",
    "sheraton",
    "tagamoa",
    "new capital",
    "mansoura",
    "tanta",
    "assiut",
    "aswan",
    "ismailia",
    "suez",
    "port said",
    "hurghada",
    "banha",
    "zagazig",
    "damietta",
}

# Arabic country and city references for Egypt
EGYPT_ARABIC_IDENTIFIERS: Set[str] = {
    "مصر",
    "القاهرة",
    "الجيزة",
    "الاسكندرية",
    "الإسكندرية",
    "المنصورة",
    "المعادي",
    "مدينة نصر",
    "المهندسين",
    "الدقي",
    "القرية الذكية",
    "التجمع",
    "التجمع الخامس",
    "أكتوبر",
    "زايد",
    "مصر الجديدة",
    "الشروق",
    "العبور",
    "العاصمة الإدارية",
    "طنطا",
    "أسيوط",
    "الإسماعيلية",
    "السويس",
    "بورسعيد",
}

# Gulf and Arab countries / regional terms where remote from Egypt is readily accessible
GULF_AND_ARAB_IDENTIFIERS: Set[str] = {
    "gcc",
    "gulf",
    "mena",
    "arab",
    "middle east",
    "north africa",
    "saudi",
    "saudi arabia",
    "ksa",
    "riyadh",
    "jeddah",
    "dammam",
    "khobar",
    "uae",
    "united arab emirates",
    "dubai",
    "abu dhabi",
    "sharjah",
    "ajman",
    "qatar",
    "doha",
    "kuwait",
    "bahrain",
    "manama",
    "oman",
    "muscat",
    "neom",
}

# Arabic identifiers for Gulf / GCC and Arab countries / major cities
GULF_AND_ARAB_ARABIC_IDENTIFIERS: Set[str] = {
    "السعودية",
    "المملكة العربية السعودية",
    "الرياض",
    "جدة",
    "الدمام",
    "الخبر",
    "مكة",
    "المدينة",
    "نيوم",
    "الامارات",
    "الإمارات",
    "دبي",
    "أبوظبي",
    "ابوظبي",
    "الشارقة",
    "عجمان",
    "قطر",
    "الدوحة",
    "الكويت",
    "البحرين",
    "المنامة",
    "عمان",
    "سلطنة عمان",
    "مسقط",
    "الخليج",
    "دول الخليج",
    "الشرق الأوسط",
    "شمال أفريقيا",
    "شمال افريقيا",
}

# Regional groupings that may include Egypt geographically
REGIONAL_KEYWORDS: List[str] = [
    "emea",
    "africa",
]

# Words indicating worldwide remote availability
WORLDWIDE_KEYWORDS: List[str] = [
    "worldwide",
    "global",
    "anywhere",
    "work from anywhere",
    "any location",
    "all countries",
    "distributed globally",
]

# Patterns explicitly excluding Egypt or limiting to other specific jurisdictions
EXCLUSION_PATTERNS = [
    r"\b(us|usa|united states|u\.s\.) only\b",
    r"\b(uk|united kingdom) only\b",
    r"\bcanada only\b",
    r"\beu only\b",
    r"\beurope only\b",
    r"\blatam only\b",
    r"\bapac only\b",
    r"\baustralia only\b",
    r"\bexcluding egypt\b",
    r"\bnot eligible:? .*egypt\b",
]


class GeographicEligibilityEngine:
    """Deterministic classifier for candidate geographic eligibility."""

    def __init__(self, candidate_country: str = "EG"):
        self.candidate_country = candidate_country.upper()

    def classify(
        self,
        raw_location: Optional[str],
        workplace_type: WorkplaceType,
        remote_scope: Optional[str] = None,
        eligible_countries: Optional[List[str]] = None,
        excluded_countries: Optional[List[str]] = None,
        description_text: Optional[str] = None,
    ) -> Tuple[GeographicEligibility, str]:
        """
        Classify geographic eligibility returning (status, reason).
        """
        loc_text = (raw_location or "").lower()
        scope_text = (remote_scope or "").lower()
        full_text = f"{loc_text} {scope_text}".strip()
        desc_sample = (description_text or "")[:2000].lower()

        eligible_set = {c.strip().lower() for c in (eligible_countries or [])}
        excluded_set = {c.strip().lower() for c in (excluded_countries or [])}

        # 1. Check explicit exclusion of Egypt
        if any(e in excluded_set for e in EGYPT_IDENTIFIERS):
            return GeographicEligibility.NOT_ELIGIBLE, "Egypt is explicitly in the excluded countries list."

        for pattern in EXCLUSION_PATTERNS:
            if re.search(pattern, full_text) or re.search(pattern, desc_sample):
                return (
                    GeographicEligibility.NOT_ELIGIBLE,
                    f"Job explicitly restricted to another jurisdiction ('{pattern.replace(r'\b', '')}').",
                )

        # 2. Check explicit inclusion of Egypt
        has_egypt_in_eligible = (
            any(e in eligible_set for e in EGYPT_IDENTIFIERS)
            or any(e in eligible_set for e in EGYPT_ARABIC_IDENTIFIERS)
        )
        has_egypt_in_location = (
            any(re.search(rf"\b{re.escape(ident)}\b", full_text) for ident in EGYPT_IDENTIFIERS)
            or any(ident in full_text for ident in EGYPT_ARABIC_IDENTIFIERS)
            or any(ident in desc_sample for ident in EGYPT_ARABIC_IDENTIFIERS)
        )

        # Safeguard: "Alexandria, VA" or "Alexandria, Virginia, US" is NOT Egypt
        if "alexandria" in full_text and any(us_ind in full_text for us_ind in [" va", ", va", "virginia", "usa", "united states", "u.s."]):
            if not any(eg_ind in full_text for eg_ind in ["egypt", "cairo", "مصر", "الاسكندرية", "الإسكندرية"]):
                has_egypt_in_location = False

        if has_egypt_in_eligible or has_egypt_in_location:
            if workplace_type in (WorkplaceType.ON_SITE, WorkplaceType.HYBRID):
                return GeographicEligibility.EGYPT_ELIGIBLE, "On-site or hybrid role located in Egypt."
            return GeographicEligibility.EGYPT_ELIGIBLE, "Remote role explicitly confirmed open to Egypt."

        # 3. Check for Worldwide Remote
        is_worldwide = any(kw in full_text for kw in WORLDWIDE_KEYWORDS) or any(kw in desc_sample for kw in WORLDWIDE_KEYWORDS)
        if workplace_type == WorkplaceType.REMOTE and is_worldwide:
            return GeographicEligibility.REMOTE_WORLDWIDE, "Explicitly advertised as worldwide / work-from-anywhere remote."

        # 4. Check for Gulf / Arab / MENA Remote (Directly open and desirable for Egyptian candidates)
        is_gulf_arab = (
            any(re.search(rf"\b{re.escape(kw)}\b", full_text) for kw in GULF_AND_ARAB_IDENTIFIERS)
            or any(kw in full_text for kw in GULF_AND_ARAB_ARABIC_IDENTIFIERS)
            or any(re.search(rf"\b{re.escape(kw)}\b", desc_sample) for kw in GULF_AND_ARAB_IDENTIFIERS)
            or any(kw in desc_sample for kw in GULF_AND_ARAB_ARABIC_IDENTIFIERS)
            or any(kw in eligible_set for kw in GULF_AND_ARAB_IDENTIFIERS)
            or any(kw in eligible_set for kw in GULF_AND_ARAB_ARABIC_IDENTIFIERS)
        )
        if workplace_type == WorkplaceType.REMOTE and is_gulf_arab:
            return (
                GeographicEligibility.EGYPT_ELIGIBLE,
                "Remote role in Gulf / MENA / Arab region open to Egyptian candidates.",
            )

        # 5. Check for Regional Remote (EMEA, Africa)
        is_regional = any(re.search(rf"\b{re.escape(kw)}\b", full_text) for kw in REGIONAL_KEYWORDS)
        if workplace_type == WorkplaceType.REMOTE and is_regional:
            return (
                GeographicEligibility.REMOTE_REGION_POSSIBLE,
                "Remote within regional boundary (EMEA/Africa); needs country-level verification before applying.",
            )

        # 6. On-site or Hybrid outside Egypt -> STRICTLY NOT_ELIGIBLE (User rule: On-site must be in Egypt only)
        if workplace_type in (WorkplaceType.ON_SITE, WorkplaceType.HYBRID):
            return (
                GeographicEligibility.NOT_ELIGIBLE,
                f"On-site/hybrid role in '{raw_location or 'outside Egypt'}'. Only on-site roles within Egypt are eligible; candidate is based in Egypt.",
            )

        # 7. Remote with ambiguous or missing scope
        if workplace_type == WorkplaceType.REMOTE:
            # If scope contains country names other than Egypt/Gulf (e.g. "Germany", "United States", "UK")
            if any(country in full_text for country in ["united states", "usa", "uk", "germany", "france", "canada", "australia"]):
                return (
                    GeographicEligibility.NOT_ELIGIBLE,
                    f"Remote role restricted to other specific country: {raw_location or remote_scope}.",
                )
            return (
                GeographicEligibility.UNKNOWN,
                "Remote role with unverified geographic hiring boundaries; verify before applying.",
            )

        # 7. Default fallback: UNKNOWN
        return GeographicEligibility.UNKNOWN, "Insufficient location information provided."

    def classify_segment(
        self,
        raw_location: Optional[str],
        workplace_type: WorkplaceType,
        remote_scope: Optional[str] = None,
        eligibility: Optional[GeographicEligibility] = None,
        description_text: Optional[str] = None,
    ) -> OpportunitySegment:
        """
        Classify an opportunity into one of the two top-level Frontend Radar segments:
        1. EGYPT: Cairo, Giza, Alexandria, and Egypt-wide remote (On-site, Hybrid, Remote).
        2. REMOTE_GCC_ABROAD: Arab Gulf / GCC (KSA, UAE, Qatar, Kuwait, Bahrain, Oman) and
           international remote roles open to Egyptian talent (strictly Remote ONLY).
        3. OTHER: Non-remote roles outside Egypt, or ambiguous/ineligible roles.
        """
        loc_text = (raw_location or "").lower()
        scope_text = (remote_scope or "").lower()
        full_text = f"{loc_text} {scope_text}".strip()
        desc_sample = (description_text or "")[:1500].lower()

        # If eligibility is not pre-computed, evaluate it now
        if eligibility is None:
            eligibility, _ = self.classify(
                raw_location=raw_location,
                workplace_type=workplace_type,
                remote_scope=remote_scope,
                description_text=description_text,
            )

        # Ineligible roles or on-site/hybrid outside Egypt are never placed in either bucket
        if eligibility == GeographicEligibility.NOT_ELIGIBLE:
            return OpportunitySegment.OTHER

        # 1. Inspect location for Egypt vs Gulf / Abroad indicators
        has_egypt_loc = (
            any(re.search(rf"\b{re.escape(ident)}\b", loc_text) for ident in EGYPT_IDENTIFIERS)
            or any(ident in loc_text for ident in EGYPT_ARABIC_IDENTIFIERS)
        )
        if "alexandria" in loc_text and any(us in loc_text for us in [" va", ", va", "virginia", "usa"]):
            if not any(eg in loc_text for eg in ["egypt", "cairo", "مصر"]):
                has_egypt_loc = False

        is_gulf_loc = (
            any(re.search(rf"\b{re.escape(kw)}\b", loc_text) for kw in GULF_AND_ARAB_IDENTIFIERS)
            or any(kw in loc_text for kw in GULF_AND_ARAB_ARABIC_IDENTIFIERS)
        )

        # 1. Egypt Bucket:
        # If the primary location is inside Egypt (and not a foreign headquarters hiring abroad)
        if has_egypt_loc and not is_gulf_loc:
            return OpportunitySegment.EGYPT

        # 2. Remote Abroad / GCC Bucket:
        # Strictly Remote ONLY! Non-remote roles outside Egypt are rejected.
        if workplace_type == WorkplaceType.REMOTE:
            is_gulf_arab = (
                is_gulf_loc
                or any(re.search(rf"\b{re.escape(kw)}\b", full_text) for kw in GULF_AND_ARAB_IDENTIFIERS)
                or any(kw in full_text for kw in GULF_AND_ARAB_ARABIC_IDENTIFIERS)
                or any(re.search(rf"\b{re.escape(kw)}\b", desc_sample) for kw in GULF_AND_ARAB_IDENTIFIERS)
                or any(kw in desc_sample for kw in GULF_AND_ARAB_ARABIC_IDENTIFIERS)
            )
            is_worldwide = (
                any(kw in full_text for kw in WORLDWIDE_KEYWORDS)
                or any(kw in desc_sample for kw in WORLDWIDE_KEYWORDS)
                or eligibility in (GeographicEligibility.REMOTE_WORLDWIDE, GeographicEligibility.REMOTE_REGION_POSSIBLE)
            )
            if is_gulf_arab or is_worldwide or (eligibility == GeographicEligibility.EGYPT_ELIGIBLE and not has_egypt_loc):
                return OpportunitySegment.REMOTE_GCC_ABROAD

        # Fallback for Egypt: scope/text confirmed Egypt and not in remote GCC
        if has_egypt_loc or any(re.search(rf"\b{re.escape(ident)}\b", full_text) for ident in EGYPT_IDENTIFIERS):
            return OpportunitySegment.EGYPT

        # Ambiguous locations or unconfirmed remote scope are never silently classified as Remote Abroad
        return OpportunitySegment.OTHER

