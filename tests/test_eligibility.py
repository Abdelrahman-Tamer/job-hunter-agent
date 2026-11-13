"""Unit tests for geographic eligibility classification."""

import pytest
from src.engine.eligibility import GeographicEligibilityEngine
from src.models.enums import GeographicEligibility, WorkplaceType


@pytest.fixture
def engine():
    return GeographicEligibilityEngine(candidate_country="EG")


def test_egypt_onsite_and_hybrid(engine):
    """Verify that on-site and hybrid roles in Egypt are classified as EGYPT_ELIGIBLE."""
    status, reason = engine.classify(
        raw_location="Cairo, Egypt",
        workplace_type=WorkplaceType.ON_SITE,
    )
    assert status == GeographicEligibility.EGYPT_ELIGIBLE
    assert "Egypt" in reason

    status2, _ = engine.classify(
        raw_location="Alexandria, EG",
        workplace_type=WorkplaceType.HYBRID,
    )
    assert status2 == GeographicEligibility.EGYPT_ELIGIBLE


def test_worldwide_remote(engine):
    """Verify that remote jobs explicitly advertising worldwide availability are REMOTE_WORLDWIDE."""
    status, reason = engine.classify(
        raw_location="Worldwide",
        workplace_type=WorkplaceType.REMOTE,
        remote_scope="Worldwide",
    )
    assert status == GeographicEligibility.REMOTE_WORLDWIDE

    status2, _ = engine.classify(
        raw_location="Remote (Work from anywhere)",
        workplace_type=WorkplaceType.REMOTE,
    )
    assert status2 == GeographicEligibility.REMOTE_WORLDWIDE


def test_regional_remote_emea_mena_africa(engine):
    """Verify that EMEA/MENA/Africa remote roles without Egypt confirmation are REMOTE_REGION_POSSIBLE."""
    status, reason = engine.classify(
        raw_location="Home based - EMEA",
        workplace_type=WorkplaceType.REMOTE,
        remote_scope="EMEA",
    )
    assert status == GeographicEligibility.REMOTE_REGION_POSSIBLE
    assert "verification" in reason.lower()

    status2, _ = engine.classify(
        raw_location="Remote - Africa & Middle East",
        workplace_type=WorkplaceType.REMOTE,
    )
    assert status2 == GeographicEligibility.REMOTE_REGION_POSSIBLE


def test_explicit_exclusion_of_egypt_or_single_country_restriction(engine):
    """Verify that US only, UK only, or explicit exclusions result in NOT_ELIGIBLE."""
    status, reason = engine.classify(
        raw_location="Remote",
        workplace_type=WorkplaceType.REMOTE,
        remote_scope="US only",
    )
    assert status == GeographicEligibility.NOT_ELIGIBLE

    status2, _ = engine.classify(
        raw_location="Worldwide",
        workplace_type=WorkplaceType.REMOTE,
        excluded_countries=["Egypt", "Iran"],
    )
    assert status2 == GeographicEligibility.NOT_ELIGIBLE


def test_onsite_outside_egypt_is_relocation_required(engine):
    """Verify that on-site jobs outside Egypt are marked RELOCATION_REQUIRED, never assumed remote."""
    status, reason = engine.classify(
        raw_location="Berlin, Germany",
        workplace_type=WorkplaceType.ON_SITE,
    )
    assert status == GeographicEligibility.RELOCATION_REQUIRED
    assert "relocation required" in reason.lower()


def test_remote_alone_without_scope_is_unknown(engine):
    """Verify that plain 'Remote' without worldwide confirmation is marked UNKNOWN."""
    status, reason = engine.classify(
        raw_location="Remote",
        workplace_type=WorkplaceType.REMOTE,
        remote_scope=None,
    )
    assert status == GeographicEligibility.UNKNOWN
