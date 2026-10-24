"""Schema/lint checks for the curation files (identity-resolution task 1.2).

These are the asserts the task calls for, run against the real, hand-authored
curation files (not a fixture), so they double as a guardrail against anyone
later adding an entry that invents a degree or drops its evidence:

  - every people.yaml entry has a `slug`
  - every people.yaml entry has a `name`
  - every people.yaml entry has at least one evidence URL
  - no entry is `verified_alumnus` without a stated degree (Req 1.3 +
    .kiro/steering/data-integrity.md: never promote to verified_alumnus without
    a source that states a BU degree)

A few structural checks are included so the files stay loadable by the directory
builder in task 2 (slugs unique and in canonical-ID shape; statuses valid;
submitted_by is manual_curation or user_submitted). reviews.yaml is checked just
enough to stay a usable override fixture for task 5.

Run: python -m pytest tests/identity/test_curation_lint.py -v
"""

from __future__ import annotations

import re

import pytest
import yaml

from pipelines.common.contract import REPO_ROOT

PEOPLE_PATH = REPO_ROOT / "data" / "curation" / "people.yaml"
REVIEWS_PATH = REPO_ROOT / "data" / "curation" / "reviews.yaml"

# Canonical slug shape: becomes person:canonical:<slug>, so it must match the
# canonical-id local part allowed by both schemas ([a-z0-9-]+).
SLUG_RE = re.compile(r"^[a-z0-9-]+$")
CANONICAL_ID_RE = re.compile(r"^person:canonical:[a-z0-9-]+$")
PERSON_ID_RE = re.compile(r"^person:[a-z0-9_]+:[A-Za-z0-9._-]+$")

VALID_STATUSES = {"verified_alumnus", "bu_affiliated_researcher", "unverified", "ambiguous"}
VALID_SUBMITTERS = {"manual_curation", "user_submitted"}
VALID_SOURCES = {"institutional_bio", "user_submitted", "manual_curation", "professional_profile"}


def _load(path):
    with open(path, encoding="utf-8") as fh:
        return yaml.safe_load(fh)


@pytest.fixture(scope="module")
def people():
    data = _load(PEOPLE_PATH)
    assert isinstance(data, list) and data, "people.yaml must be a non-empty list"
    return data


@pytest.fixture(scope="module")
def reviews():
    data = _load(REVIEWS_PATH)
    assert isinstance(data, list) and data, "reviews.yaml must be a non-empty list"
    return data


def _evidence_urls(entry):
    """All evidence URLs attached to an entry (bu.evidence + profiles)."""
    urls = []
    bu = entry.get("bu") or {}
    for ev in bu.get("evidence") or []:
        if ev.get("url"):
            urls.append(ev["url"])
    for prof in entry.get("profiles") or []:
        if prof.get("url"):
            urls.append(prof["url"])
    return urls


# --- The four asserts the task names --------------------------------------

def test_every_entry_has_a_slug(people):
    for entry in people:
        assert entry.get("slug"), f"entry missing slug: {entry!r}"


def test_every_entry_has_a_name(people):
    for entry in people:
        assert entry.get("name"), f"entry missing name: {entry.get('slug')!r}"


def test_every_entry_has_at_least_one_evidence_url(people):
    for entry in people:
        urls = _evidence_urls(entry)
        assert urls, f"entry {entry.get('slug')!r} has no evidence URL"


def test_no_verified_alumnus_without_a_stated_degree(people):
    for entry in people:
        bu = entry.get("bu") or {}
        if bu.get("status") == "verified_alumnus":
            assert bu.get("degree"), (
                f"entry {entry.get('slug')!r} is verified_alumnus but states no degree; "
                "either record the degree (with evidence) or demote to bu_affiliated_researcher"
            )


# --- Structural guardrails so task 2 can consume the file ------------------

def test_slugs_are_canonical_shape_and_unique(people):
    seen = set()
    for entry in people:
        slug = entry["slug"]
        assert SLUG_RE.match(slug), f"slug {slug!r} not in [a-z0-9-] shape"
        assert CANONICAL_ID_RE.match(f"person:canonical:{slug}"), slug
        assert slug not in seen, f"duplicate slug {slug!r}"
        seen.add(slug)


def test_status_and_submitter_values_are_valid(people):
    for entry in people:
        status = (entry.get("bu") or {}).get("status")
        assert status in VALID_STATUSES, f"{entry['slug']}: bad status {status!r}"
        assert entry.get("submitted_by") in VALID_SUBMITTERS, (
            f"{entry['slug']}: submitted_by must be one of {VALID_SUBMITTERS}"
        )


def test_evidence_records_have_valid_source_and_url(people):
    for entry in people:
        bu = entry.get("bu") or {}
        for ev in bu.get("evidence") or []:
            assert ev.get("source") in VALID_SOURCES, f"{entry['slug']}: bad evidence source {ev!r}"
            assert str(ev.get("url", "")).startswith("http"), f"{entry['slug']}: evidence url {ev!r}"


def test_graduation_year_is_plausible_when_present(people):
    for entry in people:
        year = (entry.get("bu") or {}).get("graduation_year")
        if year is not None:
            assert isinstance(year, int) and 1900 <= year <= 2100, (
                f"{entry['slug']}: implausible graduation_year {year!r}"
            )


# --- reviews.yaml stays a usable override fixture for task 5 ---------------

def test_reviews_reference_known_people_and_record_reviewer(people, reviews):
    known = {f"person:canonical:{e['slug']}" for e in people}
    for dec in reviews:
        cid = dec.get("canonical_id")
        assert cid in known, f"review references unknown canonical_id {cid!r}"
        assert CANONICAL_ID_RE.match(cid), cid
        members = dec.get("member_ids") or []
        assert members, f"review {cid} has no member_ids"
        assert all(PERSON_ID_RE.match(m) for m in members), members
        assert dec.get("status") in {"merged", "candidate", "rejected"}, dec
        # A merged decision is never low confidence (schema invariant).
        if dec.get("status") == "merged":
            assert dec.get("confidence") in {"high", "medium"}, dec
        # Req 3.4: a review records the reviewer and date.
        assert dec.get("by"), f"review {cid} missing reviewer `by`"
        assert re.match(r"^\d{4}-\d{2}-\d{2}$", str(dec.get("at", ""))), (
            f"review {cid} missing/!ISO `at` date"
        )


# --- Photo blocks (identity-resolution task 9, Requirement 7) ---------------
# Independent of pipelines/identity/directory.py on purpose: the builder silently
# drops a bad photo, while this lint fails loudly so a bad block never lands.

PHOTO_REQUIRED_FIELDS = ("url", "source", "license", "attribution", "evidence")
PHOTO_ALLOWED_SOURCES = {"user_submitted", "wikimedia_commons", "institutional_permission"}


def _is_http_url(value) -> bool:
    return isinstance(value, str) and re.match(r"^https?://\S+$", value) is not None


def _photo_problems(photo) -> list[str]:
    """Return lint problems for one `photo` block (empty list = valid)."""
    if not isinstance(photo, dict):
        return ["photo must be a mapping"]
    problems = []
    for field in PHOTO_REQUIRED_FIELDS:
        value = photo.get(field)
        if not isinstance(value, str) or not value.strip():
            problems.append(f"missing/empty {field!r}")
    if photo.get("source") not in PHOTO_ALLOWED_SOURCES:
        problems.append(f"source {photo.get('source')!r} not in {sorted(PHOTO_ALLOWED_SOURCES)}")
    for field in ("url", "evidence"):
        if not _is_http_url(photo.get(field)):
            problems.append(f"{field!r} is not an http(s) URL")
    return problems


def test_photo_blocks_have_required_fields_and_allowed_source(people):
    for entry in people:
        if "photo" not in entry:
            continue
        problems = _photo_problems(entry["photo"])
        assert not problems, f"{entry['slug']}: bad photo block: {problems}"


_GOOD_PHOTO = {
    "url": "https://upload.wikimedia.org/wikipedia/commons/a/ab/Example.jpg",
    "source": "wikimedia_commons",
    "license": "CC BY-SA 4.0",
    "attribution": "Example Author",
    "evidence": "https://commons.wikimedia.org/wiki/File:Example.jpg",
}


def test_photo_lint_accepts_a_valid_block():
    assert _photo_problems(dict(_GOOD_PHOTO)) == []


@pytest.mark.parametrize(
    "bad",
    [
        {k: v for k, v in _GOOD_PHOTO.items() if k != "license"},  # missing field
        {**_GOOD_PHOTO, "attribution": "  "},  # empty field
        {**_GOOD_PHOTO, "source": "scraped"},  # disallowed source
        {**_GOOD_PHOTO, "url": "ftp://example.org/x.jpg"},  # non-http url
        {**_GOOD_PHOTO, "evidence": "commons page"},  # non-URL evidence
        "https://example.org/x.jpg",  # not a mapping
    ],
)
def test_photo_lint_catches_bad_blocks(bad):
    assert _photo_problems(bad), f"lint failed to flag {bad!r}"
