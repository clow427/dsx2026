"""Tests for manual review overrides (identity-resolution task 5, Req 3.4).

Fixture graphs use fictional names and example.org/example.edu URLs.

Run: python -m pytest tests/identity/test_reviews.py -v
"""

from __future__ import annotations

import datetime as dt
import itertools
import json

import pytest

from pipelines.common.validation import validate_identity_matches
from pipelines.identity import match
from pipelines.identity import run as identity_run
from pipelines.identity.match import load_reviews, parse_review, run_matching

from .test_match import _doc, canonical, only_match, people_doc, source_doc, source_person

JANE = "person:canonical:jane-roe"
A1 = "person:openalex:A1"
A2 = "person:openalex:A2"


def review(**overrides) -> match.Review:
    entry = {
        "canonical_id": JANE,
        "member_ids": [A1],
        "status": "rejected",
        "confidence": "high",
        "by": "fixture-reviewer",
        "at": dt.date(2026, 10, 24),  # what yaml.safe_load yields for 2026-10-24
        "note": "Fixture decision.",
    }
    entry.update(overrides)
    return parse_review(entry)


def name_only_fixture():
    """Automated result: candidate/low (exact name, nothing else)."""
    return people_doc(canonical("jane-roe", "Jane Roe")), source_doc([source_person("A1", "Jane Roe")])


def test_review_flips_candidate_to_rejected_and_records_reviewer():
    people, src = name_only_fixture()
    assert only_match(run_matching(people, [src]), JANE)["status"] == "candidate"

    run = run_matching(people, [src], [review(status="rejected", confidence="high")])
    m = only_match(run, JANE)
    assert (m["status"], m["confidence"]) == ("rejected", "high")
    assert m["member_ids"] == [A1]
    assert m["reviewed"] == {"by": "fixture-reviewer", "at": "2026-10-24", "note": "Fixture decision."}
    assert m["signals"][-1]["signal"] == "manual_review"
    assert any(s["signal"] == "exact_name" for s in m["signals"])  # automated evidence kept
    assert validate_identity_matches(_doc(run)).ok


def test_review_promotes_candidate_to_merged():
    people, src = name_only_fixture()
    run = run_matching(people, [src], [review(status="merged", confidence="medium", at="2026-11-02", note=None)])
    m = only_match(run, JANE)
    assert (m["status"], m["confidence"]) == ("merged", "medium")
    assert m["reviewed"] == {"by": "fixture-reviewer", "at": "2026-11-02"}
    assert validate_identity_matches(_doc(run)).ok


def test_review_of_unscored_pair_creates_the_match():
    # Unrelated names: automation produces no match at all.
    people = people_doc(canonical("jane-roe", "Jane Roe"))
    src = source_doc([source_person("A1", "Pat Example")])
    assert run_matching(people, [src]).matches == []

    run = run_matching(people, [src], [review(status="merged", confidence="high")])
    m = only_match(run, JANE)
    assert (m["status"], m["confidence"], m["member_ids"]) == ("merged", "high", [A1])
    assert [s["signal"] for s in m["signals"]] == ["manual_review"]
    assert m["reviewed"]["by"] == "fixture-reviewer"
    assert validate_identity_matches(_doc(run)).ok


def test_review_naming_absent_people_is_reported_not_applied():
    people, src = name_only_fixture()
    run = run_matching(people, [src], [review(member_ids=["person:openalex:ZZZ"], status="merged")])
    m = only_match(run, JANE)
    assert m["status"] == "candidate" and "reviewed" not in m
    assert [r.member_ids for r in run.unapplied_reviews] == [("person:openalex:ZZZ",)]


def test_review_overrides_orcid_conflict():
    people = people_doc(canonical("jane-roe", "Jane Roe", orcid="0000-0001-0000-0001"))
    src = source_doc([source_person("A1", "Jane Roe", orcid="0000-0001-0000-0002")])
    assert only_match(run_matching(people, [src]), JANE)["status"] == "rejected"
    run = run_matching(people, [src], [review(status="candidate", confidence="low")])
    m = only_match(run, JANE)
    assert (m["status"], m["confidence"]) == ("candidate", "low")
    assert m["reviewed"]["at"] == "2026-10-24"


def test_reviewed_merge_demotes_unreviewed_merge_of_same_member():
    people = people_doc(
        canonical("jane-roe", "Jane Roe"),
        canonical("jan-roe", "Jan Roe", orcid="0000-0001-0000-0009"),
    )
    src = source_doc([source_person("A1", "Jane Roe", orcid="0000-0001-0000-0009")])
    run = run_matching(people, [src], [review(status="merged", confidence="high")])
    assert only_match(run, JANE)["status"] == "merged"
    other = only_match(run, "person:canonical:jan-roe")
    assert other["status"] == "candidate" and "reviewed" not in other
    assert validate_identity_matches(_doc(run)).ok


@pytest.mark.parametrize(
    "status,confidence", [(s, c) for s, c in itertools.product(match.STATUS_RANK, match.CONFIDENCE_RANK)]
)
def test_every_valid_review_overrides_and_validates(status, confidence):
    if status == "merged" and confidence == "low":
        with pytest.raises(ValueError):
            review(status=status, confidence=confidence)
        return
    people, src = name_only_fixture()
    m = only_match(run_matching(people, [src], [review(status=status, confidence=confidence)]), JANE)
    assert (m["status"], m["confidence"]) == (status, confidence)
    assert m["reviewed"]["by"] == "fixture-reviewer"


@pytest.mark.parametrize(
    "bad",
    [
        {"status": "maybe"},
        {"confidence": "certain"},
        {"by": ""},
        {"at": "24/10/2026"},
        {"member_ids": []},
        {"canonical_id": "person:openalex:A1"},
        {"signal": "orcid"},
    ],
)
def test_malformed_reviews_are_rejected(bad):
    with pytest.raises(ValueError):
        review(**bad)


def test_load_reviews_normalizes_yaml_dates(tmp_path):
    path = tmp_path / "reviews.yaml"
    path.write_text(
        f"- canonical_id: {JANE}\n  member_ids: [{A1}]\n  status: rejected\n  confidence: high\n"
        "  by: fixture-reviewer\n  at: 2026-10-24\n",
        encoding="utf-8",
    )
    (r,) = load_reviews(path)
    assert r.at == "2026-10-24" and r.member_ids == (A1,)
    assert load_reviews(tmp_path / "missing.yaml") == []


@pytest.mark.skipif(not match.RESEARCH_PATH.exists(), reason="research.json not present")
def test_real_run_applies_seed_review(tmp_path):
    seeds = load_reviews(match.REVIEWS_PATH)
    assert seeds, "reviews.yaml has no seed decision"
    out = tmp_path / "identity_matches.json"
    assert identity_run.main(["--output", str(tmp_path / "people.json"), "--matches-output", str(out)]) == 0
    doc = json.loads(out.read_text(encoding="utf-8"))
    assert validate_identity_matches(doc).ok
    by_id = {m["canonical_id"]: m for m in doc["matches"]}
    for seed in seeds:
        m = by_id[seed.canonical_id]
        if set(seed.member_ids) <= set(m["member_ids"]):
            # The reviewed pair is the emitted match for this canonical person.
            assert m["status"] == seed.status
            assert m["reviewed"]["by"] == seed.by and m["reviewed"]["at"] == seed.at
        else:
            # One entry per canonical person: a reviewed pair outranked by a
            # stronger match is deferred and listed in notes with its review.
            for member in seed.member_ids:
                expected = (
                    f"{seed.canonical_id} ~ {member} ({seed.status}/{seed.confidence}, "
                    f"reviewed by {seed.by} {seed.at})"
                )
                assert expected in doc["notes"]

    # --no-reviews gives the automated result with no reviewed field.
    out2 = tmp_path / "auto.json"
    assert identity_run.main(["--output", str(tmp_path / "p2.json"), "--matches-output", str(out2), "--no-reviews"]) == 0
    assert not any("reviewed" in m for m in json.loads(out2.read_text(encoding="utf-8"))["matches"])
