"""Tests for person profiles from ORCID and OpenAlex (pipelines/profiles). No live API calls.

Records below are fictional (MOCK) with example.org URLs.
"""

from __future__ import annotations

import copy

import requests
from hypothesis import given
from hypothesis import strategies as st

from pipelines.common.validation import validate_graph
from pipelines.profiles.build import apply_profiles, build_profiles, openalex_profile, orcid_profile
from pipelines.profiles.fetch import fetch_openalex_authors, fetch_orcid

from ..research.conftest import FakeClient, FakeResponse

ORCID = "0000-0000-0000-0001"


def emp(title, org, start, end=None, dept=None):
    return {"summaries": [{"employment-summary": {
        "role-title": title, "department-name": dept, "organization": {"name": org},
        "start-date": {"year": {"value": str(start)}} if start else None,
        "end-date": {"year": {"value": str(end)}} if end else None,
    }}]}


RECORD = {
    "person": {
        "biography": {"content": "MOCK Example researcher studying   clinical prediction."},
        "keywords": {"keyword": [{"content": "machine learning; epidemiology"}, {"content": "Machine Learning"}, {"content": "EHR"}]},
        "researcher-urls": {"researcher-url": [
            {"url-name": "Lab website", "url": {"value": "https://example.org/lab"}},
            {"url-name": None, "url": {"value": "https://www.example.edu/people/example"}},
            {"url-name": "Not a URL", "url": {"value": "javascript:alert(1)"}},
            {"url-name": "Duplicate", "url": {"value": "https://example.org/lab"}},
        ]},
        "emails": {"email": [{"email": "mock@example.org"}]},
        "addresses": {"address": [{"country": {"value": "US"}}]},
    },
    "employments": {"affiliation-group": [
        emp("Assistant Professor", "Example University", 2015, end=2019),
        emp("Associate Professor", "Example University", 2019, dept="Biostatistics"),
        emp("Adjunct", "Example Hospital", 2012),
    ]},
}

AUTHOR = {
    "id": "https://openalex.org/A9000000001",
    "works_count": 120,
    "cited_by_count": 3400,
    "summary_stats": {"h_index": 30, "i10_index": 70},
    "last_known_institutions": [{"display_name": "Example University"}, {"display_name": "Example University"}, {"display_name": "Example Hospital"}],
    "topics": [{"display_name": f"Example Topic {i}"} for i in range(5)],
}


def test_orcid_profile_reads_only_stated_current_fields():
    p = orcid_profile(ORCID, RECORD)
    # Most recent position without an end date; the ended one is ignored.
    assert p["position"] == {"organization": "Example University", "title": "Associate Professor", "department": "Biostatistics", "since": 2019}
    assert p["biography"] == "MOCK Example researcher studying clinical prediction."
    assert p["keywords"] == ["machine learning", "epidemiology", "EHR"]  # split, trimmed, case-insensitive dedupe
    assert p["links"] == [
        {"label": "Lab website", "url": "https://example.org/lab"},
        {"label": "example.edu", "url": "https://www.example.edu/people/example"},
    ]
    assert "mock@example.org" not in str(p) and "addresses" not in p  # personal contact data is never read


def test_orcid_profile_without_current_position_or_fields_is_empty():
    record = {"person": {}, "employments": {"affiliation-group": [emp("Postdoc", "Example University", 2010, end=2012)]}}
    assert orcid_profile(ORCID, record) == {}
    long_bio = {"person": {"biography": {"content": "word " * 400}}}
    assert orcid_profile(ORCID, long_bio)["biography"].endswith("…")
    assert len(orcid_profile(ORCID, long_bio)["biography"]) <= 700


def test_openalex_profile():
    assert openalex_profile(AUTHOR) == {
        "metrics": {"works": 120, "citations": 3400, "h_index": 30, "i10_index": 70},
        "institutions": ["Example University", "Example Hospital"],
        "topics": ["Example Topic 0", "Example Topic 1", "Example Topic 2"],
    }
    assert openalex_profile({}) == {}


def _graph():
    return {
        "schema_version": "0.1.0",
        "generated_at": "2026-10-25T00:00:00Z",
        "producer": "merge",
        "nodes": [
            {"id": "person:canonical:example-person", "type": "person", "label": "Example Person",
             "sources": [{"source": "openalex", "record_id": "A9000000002", "url": "https://openalex.org/A9000000002"},
                         {"source": "openalex", "record_id": "A9000000001", "url": "https://openalex.org/A9000000001"}],
             "bu_affiliation": {"status": "verified_alumnus", "evidence": [{"source": "bu_repository", "url": "https://example.org/thesis"}]},
             "attributes": {"orcid": ORCID}},
            {"id": "person:nih:9000001", "type": "person", "label": "Example Investigator",
             "sources": [{"source": "nih_reporter", "url": "https://example.org/nih"}], "bu_affiliation": {"status": "unverified", "evidence": []}},
            {"id": "publication:openalex:W9000000001", "type": "publication", "label": "MOCK paper",
             "sources": [{"source": "openalex", "record_id": "W9000000001", "url": "https://openalex.org/W9000000001"}]},
        ],
        "edges": [
            {"id": "edge:authored:person:canonical:example-person|publication:openalex:W9000000001", "type": "AUTHORED",
             "source": "person:canonical:example-person", "target": "publication:openalex:W9000000001",
             "evidence": [{"source": "openalex", "url": "https://openalex.org/W9000000001"}], "confidence": "high", "derivation": "source_record"},
            {"id": "edge:authored:person:nih:9000001|publication:openalex:W9000000001", "type": "AUTHORED",
             "source": "person:nih:9000001", "target": "publication:openalex:W9000000001",
             "evidence": [{"source": "openalex", "url": "https://openalex.org/W9000000001"}], "confidence": "high", "derivation": "source_record"},
        ],
    }


def test_apply_profiles_attaches_by_orcid_and_openalex_id():
    small = dict(AUTHOR, works_count=3, id="https://openalex.org/A9000000002")
    profiles, stats = build_profiles({ORCID: RECORD}, {"A9000000001": AUTHOR, "A9000000002": small}, "2026-10-25")
    assert stats.orcid_records == 1 and stats.with_position == 1 and stats.openalex_authors == 2
    graph = _graph()
    applied = apply_profiles(graph, profiles)
    assert applied.applied == 1
    node = graph["nodes"][0]
    profile = node["attributes"]["profile"]
    assert profile["openalex_id"] == "A9000000001"  # the author ID with the most works
    assert profile["metrics"]["works"] == 120 and profile["position"]["title"] == "Associate Professor"
    assert profile["retrieved_at"] == "2026-10-25"
    assert {"source": "user_submitted", "record_id": ORCID} .items() <= next(s for s in node["sources"] if s["source"] == "user_submitted").items()
    assert "profile" not in (graph["nodes"][1].get("attributes") or {})  # no ORCID, no OpenAlex ID
    assert validate_graph(graph).errors == []


def test_fetch_orcid_caches_and_tolerates_missing_records(tmp_path):
    missing = FakeResponse({}, status_code=404)
    missing.response = missing
    client = FakeClient([RECORD["person"], RECORD["employments"], requests.HTTPError("404", response=missing), {}])
    out = fetch_orcid([ORCID, "0000-0000-0000-0002", "bad"], client=client, cache_dir=tmp_path)
    assert out[ORCID] == RECORD and out["0000-0000-0000-0002"] == {"person": {}, "employments": {}}
    assert fetch_orcid([ORCID], client=FakeClient([]), cache_dir=tmp_path) == {ORCID: RECORD}


def test_fetch_openalex_batches_and_caches_missing_as_empty(tmp_path):
    client = FakeClient([{"results": [AUTHOR]}])
    out = fetch_openalex_authors(["A9000000001", "A9000000003", "W1"], client=client, cache_dir=tmp_path, api_key="secret")
    assert out == {"A9000000001": AUTHOR, "A9000000003": {}}
    assert client.calls[0][2]["params"]["filter"] == "openalex_id:A9000000001|A9000000003"
    assert not any("secret" in p.read_text() for p in tmp_path.rglob("*.json"))
    assert fetch_openalex_authors(["A9000000001"], client=FakeClient([]), cache_dir=tmp_path) == {"A9000000001": AUTHOR}


@given(st.dictionaries(st.sampled_from([ORCID, "0000-0000-0000-0009"]), st.just(RECORD)),
       st.dictionaries(st.sampled_from(["A9000000001", "A9000000002", "A9000000005"]), st.just(AUTHOR)))
def test_apply_profiles_only_adds_profiles(orcids, authors):
    """Property P1: applying profiles never changes node IDs, types, labels, BU status, or edges; it only
    adds attributes.profile and source refs to person nodes, and the graph stays valid."""
    profiles, _ = build_profiles(orcids, authors, "2026-10-25")
    before = _graph()
    after = copy.deepcopy(before)
    apply_profiles(after, profiles)
    assert after["edges"] == before["edges"]
    for b, a in zip(before["nodes"], after["nodes"]):
        assert (a["id"], a["type"], a["label"], a.get("bu_affiliation")) == (b["id"], b["type"], b["label"], b.get("bu_affiliation"))
        assert {k: v for k, v in (a.get("attributes") or {}).items() if k != "profile"} == (b.get("attributes") or {})
        assert all(s in a["sources"] for s in b["sources"])
        if a["type"] != "person":
            assert a == b
    assert validate_graph(after).errors == []
