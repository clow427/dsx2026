"""Tests for signal scoring and match decisions (identity-resolution task 4).

Covers the four required cases on small fixture graphs (fictional names,
example.org/example.edu URLs):
  - ORCID merge -> merged/high
  - name-only candidate -> candidate/low
  - ORCID conflict -> rejected/high
  - low-confidence matches are never merged (exhaustively over every
    combination of schema signals, and through the full pipeline)
plus the remaining decision-table rows, the Req 4.2 conflict rule, the photo
rule (Req 7.5), and the real research.json output.

Run: python -m pytest tests/identity/test_match.py -v
"""

from __future__ import annotations

import itertools
import json

import pytest

from pipelines.common.validation import validate_identity_matches
from pipelines.identity import match
from pipelines.identity import run as identity_run
from pipelines.identity.match import (
    PairDecision,
    Signal,
    aggregate,
    decide,
    enforce_invariants,
    run_matching,
)

BU = "organization:ror:05qwgg493"
SIGNAL_ENUM = (
    "orcid",
    "exact_name",
    "name_variant",
    "shared_affiliation",
    "shared_coauthor",
    "shared_topic",
    "institutional_bio",
    "user_submitted",
    "manual_review",
)


def _ref(source: str, url: str) -> dict:
    return {"source": source, "url": url}


def canonical(slug: str, name: str, orcid: str | None = None, bio: str | None = None, photo: dict | None = None) -> dict:
    attrs: dict = {}
    if orcid:
        attrs["orcid"] = orcid
    if photo:
        attrs["photo"] = photo
    evidence = [_ref("institutional_bio", bio or f"https://example.edu/bio/{slug}")]
    return {
        "id": f"person:canonical:{slug}",
        "type": "person",
        "label": name,
        "sources": [_ref("manual_curation", evidence[0]["url"])],
        "attributes": attrs,
        "bu_affiliation": {"status": "verified_alumnus", "evidence": evidence},
    }


def source_person(local: str, name: str, orcid: str | None = None, bu: bool = False, extra_urls=(), photo=None) -> dict:
    attrs: dict = {}
    if orcid:
        attrs["orcid"] = orcid
    if photo:
        attrs["photo"] = photo
    sources = [_ref("openalex", f"https://example.org/authors/{local}")]
    sources += [_ref("institutional_bio", u) for u in extra_urls]
    return {
        "id": f"person:openalex:{local}",
        "type": "person",
        "label": name,
        "sources": sources,
        "attributes": attrs,
        "bu_affiliation": {
            "status": "bu_affiliated_researcher" if bu else "unverified",
            "evidence": [_ref("openalex", f"https://example.org/works/{local}")] if bu else [],
        },
    }


def people_doc(*nodes: dict) -> dict:
    return {"nodes": list(nodes), "edges": []}


def source_doc(nodes: list[dict], edges: list[dict] | None = None) -> dict:
    return {"nodes": nodes, "edges": edges or []}


def coauthor(a: str, b: str) -> dict:
    x, y = sorted((f"person:openalex:{a}", f"person:openalex:{b}"))
    return {"type": "COAUTHORED_WITH", "source": x, "target": y}


def only_match(run, canonical_id: str) -> dict:
    found = [m for m in run.matches if m["canonical_id"] == canonical_id]
    assert len(found) == 1, run.matches
    return found[0]


def _doc(run) -> dict:
    return run.document(generated_at="2026-10-24T00:00:00Z")


# --- the four required cases ------------------------------------------------


def test_orcid_merge_is_merged_high():
    people = people_doc(canonical("jane-roe", "Jane Roe", orcid="0000-0001-0000-0001"))
    # Different spelling of the name: ORCID alone still merges.
    src = source_doc([source_person("A1", "J. Q. Roe-Smith", orcid="https://orcid.org/0000-0001-0000-0001")])
    run = run_matching(people, [src])

    m = only_match(run, "person:canonical:jane-roe")
    assert (m["status"], m["confidence"]) == ("merged", "high")
    assert m["member_ids"] == ["person:openalex:A1"]
    orcid = [s for s in m["signals"] if s["signal"] == "orcid"]
    assert orcid and orcid[0]["evidence_urls"] == ["https://orcid.org/0000-0001-0000-0001"]
    assert validate_identity_matches(_doc(run)).ok


def test_name_only_is_candidate_low():
    people = people_doc(canonical("jane-roe", "Jane Roe"))
    src = source_doc([source_person("A1", "Jane Roe")])  # no ORCID, no BU tie
    run = run_matching(people, [src])

    m = only_match(run, "person:canonical:jane-roe")
    assert (m["status"], m["confidence"]) == ("candidate", "low")
    assert [s["signal"] for s in m["signals"]] == ["exact_name"]


def test_orcid_conflict_is_rejected_high():
    people = people_doc(canonical("jane-roe", "Jane Roe", orcid="0000-0001-0000-0001"))
    # Same name and BU affiliation, but a different ORCID: a namesake.
    src = source_doc([source_person("A1", "Jane Roe", orcid="0000-0009-9999-9999", bu=True)])
    run = run_matching(people, [src])

    m = only_match(run, "person:canonical:jane-roe")
    assert (m["status"], m["confidence"]) == ("rejected", "high")
    assert validate_identity_matches(_doc(run)).ok


def test_low_confidence_is_never_merged_for_any_signal_combination():
    """Exhaustive over all 2^9 subsets of the signal enum (plus ORCID conflict)."""
    for r in range(len(SIGNAL_ENUM) + 1):
        for combo in itertools.combinations(SIGNAL_ENUM, r):
            for conflict in (False, True):
                signals = [Signal(k, k, conflict=(conflict and k == "orcid")) for k in combo]
                result = decide(signals)
                if result is None:
                    continue
                assert result != ("merged", "low"), combo
                # Merges need ORCID or an exact name with 2+ corroborating signals.
                if result[0] == "merged":
                    assert "orcid" in combo or "exact_name" in combo


def test_enforce_invariants_demotes_merged_low():
    d = PairDecision("person:canonical:x", "person:openalex:A1", "merged", "low", [Signal("name_variant", "v")])
    (out,) = enforce_invariants([d])
    assert (out.status, out.confidence) == ("candidate", "low")
    matches, _ = aggregate([out])
    assert validate_identity_matches({"schema_version": "0.1.0", "generated_at": "2026-10-24T00:00:00Z", "matches": matches}).ok


# --- the rest of the decision table -----------------------------------------


def test_name_variant_only_is_candidate_low_even_with_corroboration():
    people = people_doc(canonical("frank-parfitt", "Frank Parfitt"))
    src = source_doc([source_person("A1", "Frank Parftt", bu=True)])  # surname typo
    m = only_match(run_matching(people, [src]), "person:canonical:frank-parfitt")
    assert (m["status"], m["confidence"]) == ("candidate", "low")
    assert "name_variant" in {s["signal"] for s in m["signals"]}


def test_exact_name_plus_one_corroborating_is_candidate_medium():
    people = people_doc(canonical("jane-roe", "Jane Roe"))
    src = source_doc([source_person("A1", "Jane Roe", bu=True)])
    m = only_match(run_matching(people, [src]), "person:canonical:jane-roe")
    assert (m["status"], m["confidence"]) == ("candidate", "medium")


def test_exact_name_plus_two_corroborating_is_merged_medium():
    bio = "https://example.edu/bio/jane-roe"
    people = people_doc(canonical("jane-roe", "Jane Roe", bio=bio))
    src = source_doc([source_person("A1", "Jane Roe", bu=True, extra_urls=[bio])])
    m = only_match(run_matching(people, [src]), "person:canonical:jane-roe")
    assert (m["status"], m["confidence"]) == ("merged", "medium")
    assert {"exact_name", "shared_affiliation", "institutional_bio"} <= {s["signal"] for s in m["signals"]}


def test_shared_coauthor_comes_from_orcid_anchor():
    people = people_doc(canonical("jane-roe", "Jane Roe", orcid="0000-0001-0000-0001"))
    src = source_doc(
        [
            source_person("A1", "Jane Roe", orcid="0000-0001-0000-0001"),
            source_person("A2", "Jane Roe", bu=True),  # duplicate record, no ORCID
            source_person("C1", "Pat Coauthor"),
        ],
        [coauthor("A1", "C1"), coauthor("A2", "C1")],
    )
    run = run_matching(people, [src])
    by_member = {d.member_id: d for d in run.decisions}
    a2 = by_member["person:openalex:A2"]
    assert {s.signal for s in a2.signals} >= {"exact_name", "shared_affiliation", "shared_coauthor"}
    m = only_match(run, "person:canonical:jane-roe")
    assert m["status"] == "merged"
    assert m["confidence"] == "medium"  # lowest confidence among merged members
    assert m["member_ids"] == ["person:openalex:A1", "person:openalex:A2"]


def test_unrelated_names_produce_no_match():
    people = people_doc(canonical("jane-roe", "Jane Roe"))
    src = source_doc([source_person("A1", "Alex Example", bu=True)])
    assert run_matching(people, [src]).matches == []


# --- conflicts, precedence, photos ------------------------------------------


def test_conflicting_orcids_among_merges_are_not_merged():
    """Req 4.2: canonical without ORCID, two strong records with different ORCIDs."""
    bio = "https://example.edu/bio/jane-roe"
    people = people_doc(canonical("jane-roe", "Jane Roe", bio=bio))
    src = source_doc(
        [
            source_person("A1", "Jane Roe", orcid="0000-0001-0000-0001", bu=True, extra_urls=[bio]),
            source_person("A2", "Jane Roe", orcid="0000-0002-0000-0002", bu=True, extra_urls=[bio]),
        ]
    )
    run = run_matching(people, [src])
    m = only_match(run, "person:canonical:jane-roe")
    assert (m["status"], m["confidence"]) == ("candidate", "low")
    assert any(s["detail"].startswith("CONFLICT") for s in m["signals"])
    assert run.ambiguous == {"person:canonical:jane-roe"}
    assert validate_identity_matches(_doc(run)).ok


def test_record_matching_two_canonical_people_is_not_merged():
    people = people_doc(
        canonical("jane-roe-a", "Jane Roe", orcid="0000-0001-0000-0001"),
        canonical("jane-roe-b", "Jane Roe", orcid="0000-0001-0000-0001"),
    )
    src = source_doc([source_person("A1", "Jane Roe", orcid="0000-0001-0000-0001")])
    run = run_matching(people, [src])
    assert all(m["status"] != "merged" for m in run.matches)
    assert run.ambiguous == {"person:canonical:jane-roe-a", "person:canonical:jane-roe-b"}


def test_one_entry_per_canonical_with_lower_pairs_deferred():
    people = people_doc(canonical("jane-roe", "Jane Roe", orcid="0000-0001-0000-0001"))
    src = source_doc(
        [
            source_person("A1", "Jane Roe", orcid="0000-0001-0000-0001"),
            source_person("A2", "Jane Roee"),  # surname variant only -> candidate/low
        ]
    )
    run = run_matching(people, [src])
    m = only_match(run, "person:canonical:jane-roe")
    assert m["member_ids"] == ["person:openalex:A1"]
    assert [(d.member_id, d.status) for d in run.deferred] == [("person:openalex:A2", "candidate")]
    assert "person:openalex:A2" in _doc(run)["notes"]


def test_photos_are_never_a_matching_signal():
    photo = {
        "url": "https://example.org/photo.jpg",
        "source": "user_submitted",
        "license": "CC-BY-4.0",
        "attribution": "Example",
        "evidence": "https://example.org/photo",
    }
    with_photo = run_matching(
        people_doc(canonical("jane-roe", "Jane Roe", photo=photo)),
        [source_doc([source_person("A1", "Jane Roe", photo=photo)])],
    )
    without = run_matching(
        people_doc(canonical("jane-roe", "Jane Roe")),
        [source_doc([source_person("A1", "Jane Roe")])],
    )
    assert with_photo.matches == without.matches
    assert "photo" not in json.dumps(with_photo.matches)


def test_matches_sorted_by_canonical_id():
    people = people_doc(canonical("zed-roe", "Zed Roe"), canonical("amy-roe", "Amy Roe"))
    src = source_doc([source_person("A1", "Zed Roe"), source_person("A2", "Amy Roe")])
    ids = [m["canonical_id"] for m in run_matching(people, [src]).matches]
    assert ids == sorted(ids) == ["person:canonical:amy-roe", "person:canonical:zed-roe"]


# --- real data --------------------------------------------------------------


@pytest.mark.skipif(not match.RESEARCH_PATH.exists(), reason="research.json not present")
def test_real_run_writes_schema_valid_file_with_orcid_merge(tmp_path):
    people_out = tmp_path / "people.json"
    matches_out = tmp_path / "identity_matches.json"
    assert identity_run.main(["--output", str(people_out), "--matches-output", str(matches_out)]) == 0

    doc = json.loads(matches_out.read_text(encoding="utf-8"))
    assert validate_identity_matches(doc).ok
    ids = [m["canonical_id"] for m in doc["matches"]]
    assert ids == sorted(ids)
    assert any(
        m["status"] == "merged" and m["confidence"] == "high" and any(s["signal"] == "orcid" for s in m["signals"])
        for m in doc["matches"]
    )
    assert not any(m["status"] == "merged" and m["confidence"] == "low" for m in doc["matches"])
