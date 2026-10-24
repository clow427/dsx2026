"""Tests for the read-only shortlist extractor (identity-resolution task 1.1).

Fixture tests prove the extractor is correct on small handcrafted input. A final
check runs against the committed real output, data/modules/research.json, when it
is present. All reads are local; nothing is written.

Run: python -m pytest tests/identity/test_shortlist.py -v
"""

from __future__ import annotations

import json

import pytest

from pipelines.identity.shortlist import (
    BU_AFFILIATED,
    Candidate,
    extract_shortlist,
    format_shortlist,
    load_doc,
)
from pipelines.research.config import OUTPUT_PATH


def _person(node_id, label, *, status=None, orcid=None, url="https://openalex.org/A1"):
    node = {
        "id": node_id,
        "type": "person",
        "label": label,
        "sources": [{"source": "openalex", "record_id": node_id.split(":")[-1], "url": url}],
    }
    if status is not None:
        node["bu_affiliation"] = {"status": status, "evidence": []}
    if orcid is not None:
        node["attributes"] = {"orcid": orcid}
    return node


@pytest.fixture
def doc():
    """A small graph mixing qualifying and non-qualifying nodes."""
    return {
        "schema_version": "0.1.0",
        "producer": "research",
        "nodes": [
            # qualifies: BU affiliated + ORCID
            _person(
                "person:openalex:A001",
                "Jane Doe",
                status=BU_AFFILIATED,
                orcid="0000-0000-0000-0001",
                url="https://openalex.org/A001",
            ),
            # qualifies: BU affiliated + ORCID
            _person(
                "person:openalex:A002",
                "amy adams",
                status=BU_AFFILIATED,
                orcid="0000-0000-0000-0002",
                url="https://openalex.org/A002",
            ),
            # excluded: BU affiliated but no ORCID
            _person("person:openalex:A003", "No Orcid", status=BU_AFFILIATED, orcid=None),
            # excluded: has ORCID but not BU affiliated
            _person(
                "person:openalex:A004",
                "Not Affiliated",
                status="unverified",
                orcid="0000-0000-0000-0004",
            ),
            # excluded: wrong type
            {
                "id": "organization:ror:abc",
                "type": "organization",
                "label": "Some Org",
                "sources": [{"source": "openalex", "record_id": "I1", "url": "https://openalex.org/I1"}],
                "attributes": {"orcid": "0000-0000-0000-0009"},
            },
            # excluded: person but not an openalex namespace id
            _person(
                "person:canonical:jane-doe",
                "Canonical Jane",
                status=BU_AFFILIATED,
                orcid="0000-0000-0000-0005",
            ),
        ],
    }


def test_returns_only_bu_affiliated_people_with_orcid(doc):
    result = extract_shortlist(doc)
    ids = {c.node_id for c in result}
    assert ids == {"person:openalex:A001", "person:openalex:A002"}


def test_every_result_is_a_person_node_with_orcid_and_affiliation(doc):
    """Task 1.1 test: only type == person, carrying ORCID and affiliation fields."""
    nodes = {n["id"]: n for n in doc["nodes"]}
    for c in extract_shortlist(doc):
        source_node = nodes[c.node_id]
        assert source_node["type"] == "person"
        # ORCID field copied from the source node where present.
        assert c.orcid == source_node["attributes"]["orcid"]
        # Affiliation field copied from the source node where present.
        assert c.affiliation_status == source_node["bu_affiliation"]["status"]
        assert c.affiliation_status == BU_AFFILIATED
        assert c.has_orcid and c.is_bu_affiliated


def test_excludes_non_person_and_non_openalex_nodes(doc):
    result = extract_shortlist(doc)
    assert all(c.node_id.startswith("person:openalex:") for c in result)
    assert all("organization" not in c.node_id for c in result)
    assert all("canonical" not in c.node_id for c in result)


def test_ranked_by_signal_then_label(doc):
    """All qualifying candidates share the top signal, so ties fall back to label."""
    result = extract_shortlist(doc)
    assert all(c.signal_score == 2 for c in result)
    assert [c.label for c in result] == ["amy adams", "Jane Doe"]


def test_source_url_prefers_openalex(doc):
    result = extract_shortlist(doc)
    by_id = {c.node_id: c for c in result}
    assert by_id["person:openalex:A001"].source_url == "https://openalex.org/A001"


def test_limit_caps_the_shortlist(doc):
    assert len(extract_shortlist(doc, limit=1)) == 1
    # limit <= 0 returns everything that qualifies
    assert len(extract_shortlist(doc, limit=0)) == 2


def test_empty_when_nothing_qualifies():
    doc = {"nodes": [_person("person:openalex:A1", "Nobody", status="unverified")]}
    assert extract_shortlist(doc) == []
    assert "No BU-affiliated" in format_shortlist([])


def test_format_shortlist_includes_label_orcid_and_source():
    cand = Candidate(
        node_id="person:openalex:A001",
        label="Jane Doe",
        orcid="0000-0000-0000-0001",
        affiliation_status=BU_AFFILIATED,
        source_url="https://openalex.org/A001",
        signal_score=2,
    )
    text = format_shortlist([cand])
    assert "Jane Doe" in text
    assert "0000-0000-0000-0001" in text
    assert "https://openalex.org/A001" in text


# --- Real committed output -------------------------------------------------

@pytest.mark.skipif(not OUTPUT_PATH.exists(), reason="run `python -m pipelines.research.run` first")
def test_real_research_output_yields_valid_shortlist():
    before = OUTPUT_PATH.read_bytes()
    doc = load_doc(OUTPUT_PATH)
    result = extract_shortlist(doc, limit=15)

    assert result, "expected at least one BU-affiliated researcher with an ORCID"
    assert len(result) <= 15
    nodes = {n["id"]: n for n in doc["nodes"]}
    for c in result:
        source_node = nodes[c.node_id]
        assert source_node["type"] == "person"
        assert c.orcid == source_node["attributes"]["orcid"]
        assert c.affiliation_status == source_node["bu_affiliation"]["status"] == BU_AFFILIATED

    # Read-only: reading the real file must not have changed it.
    assert OUTPUT_PATH.read_bytes() == before
