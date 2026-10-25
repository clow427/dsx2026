"""Tests for alumni discovery from ORCID educations and OpenBU theses (identity-resolution Req 1.1-1.4).

Fixtures in tests/identity/fixtures/ are fictional (MOCK). No live API calls.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
import requests
from hypothesis import given
from hypothesis import strategies as st

from pipelines.common.validation import validate_graph
from pipelines.identity.directory import build_document
from pipelines.identity.discover import discover, slugify, write_discovered
from pipelines.identity.openbu import Thesis, display_name, harvest_theses, parse_page
from pipelines.identity.orcid_education import bu_degrees, fetch_educations, is_bu_organization, is_degree
from pipelines.identity.run import merge_entries

from ..research.conftest import FakeClient, FakeResponse

FIXTURES = Path(__file__).parent / "fixtures"
ORCID_A = "0000-0000-0000-0001"
ORCID_B = "0000-0000-0000-0002"
ORCID_C = "0000-0000-0000-0003"


@pytest.fixture
def educations():
    return json.loads((FIXTURES / "orcid_educations.json").read_text())


@pytest.fixture
def page_xml():
    return (FIXTURES / "openbu_page.xml").read_text()


def graph(*people):
    """A minimal source graph with one person node per (id, label, orcid)."""
    return {"nodes": [{"id": pid, "type": "person", "label": label, "attributes": {"orcid": orcid} if orcid else {}}
                      for pid, label, orcid in people]}


# --- ORCID --------------------------------------------------------------------


@pytest.mark.parametrize("name, expected", [
    ("Boston University", True),
    ("Boston University School of Public Health", True),
    ("Boston University Questrom School of Business", True),
    ("Trustees of Boston University", True),
    ("Boston University Medical Campus", True),
    ("Boston University Medical Center", False),  # a hospital, not a degree grantor
    ("Boston College", False),
    ("University of Massachusetts Boston", False),
])
def test_bu_organization_names(name, expected):
    assert is_bu_organization({"name": name}) is expected


def test_bu_organization_by_ror():
    assert is_bu_organization({"name": "Example Org", "disambiguated-organization": {
        "disambiguation-source": "ROR", "disambiguated-organization-identifier": "https://ror.org/05qwgg493"}})


@pytest.mark.parametrize("role, expected", [
    ("Ph.D.", True), ("PhD", True), ("MPH", True), ("M.S.", True), ("Master of Science", True), ("MSE", True),
    ("Doctor of Medicine", True), ("BA", True),
    ("Postdoctoral Fellow", False), ("PhD candidate", False), ("Graduate Certificate", False),
    ("Visiting Scholar", False), ("Radiology Residency", False), ("MD/PhD Candidate", False), ("", False), (None, False),
])
def test_degree_titles(role, expected):
    assert is_degree(role) is expected


def test_bu_degrees_keeps_only_completed_bu_degrees(educations):
    degrees = bu_degrees(ORCID_A, educations, this_year=2026)
    # Kept: 2015 Ph.D. (BU), 2011 M.S. (BU SPH), 2009 MD (BU by ROR).
    # Dropped: non-BU MPH, postdoc, BU Medical Center, no end date, future year.
    assert [(d.degree, d.year) for d in degrees] == [("Doctor of Medicine", 2009), ("M.S.", 2011), ("Ph.D.", 2015)]
    assert degrees[1].department == "Epidemiology" and degrees[1].asserted_by == "Boston University"
    assert degrees[-1].url == f"https://orcid.org/{ORCID_A}"


def test_fetch_educations_caches_and_records_missing_records(tmp_path, educations):
    missing = FakeResponse({}, status_code=404)
    missing.response = missing
    client = FakeClient([educations, requests.HTTPError("404", response=missing)])
    out = fetch_educations([ORCID_A, ORCID_B, "not-an-orcid"], client=client, cache_dir=tmp_path)
    assert out[ORCID_A] == educations and out[ORCID_B] == {}
    assert len(client.calls) == 2  # the invalid ID is never requested
    again = fetch_educations([ORCID_A, ORCID_B], client=FakeClient([]), cache_dir=tmp_path)
    assert again == out


# --- OpenBU -------------------------------------------------------------------


def test_display_name():
    assert display_name("Doe, Jane Q.") == "Jane Q. Doe"
    assert display_name("Sample, Name Only, 1925-") == "Name Only Sample"
    assert display_name("Prince") == "Prince"


def test_parse_page_keeps_bu_theses_only(page_xml):
    theses, token, count = parse_page(page_xml)
    assert token == "mock-token-1" and count == 4
    assert [t.handle_id for t in theses] == ["90001", "90002"]  # 90003 not BU-granted; 90004 deleted
    first = theses[0]
    assert first.author == "Thesis Writer Example"
    assert first.orcid == ORCID_B
    assert (first.degree, first.discipline, first.level, first.year) == ("Doctor of Philosophy", "Biostatistics", "doctoral", 2019)
    assert first.advisors == ("Example A. Advisor",)
    assert theses[1].orcid is None


class _TextClient:
    def __init__(self, texts):
        self.texts, self.calls = list(texts), []

    def request(self, method, url, **kwargs):
        self.calls.append(kwargs.get("params"))
        resp = FakeResponse(None)
        resp.text = self.texts.pop(0)
        return resp


def test_harvest_follows_resumption_tokens_and_caches(tmp_path, page_xml):
    last = page_xml.replace('<resumptionToken completeListSize="5" cursor="0">mock-token-1</resumptionToken>', "")
    client = _TextClient([page_xml, last])
    theses, _ = harvest_theses(client=client, cache_dir=tmp_path)
    assert len(theses) == 4
    assert client.calls[1] == {"verb": "ListRecords", "resumptionToken": "mock-token-1"}
    cached, _ = harvest_theses(client=_TextClient([]), cache_dir=tmp_path)
    assert cached == theses


# --- Discovery ----------------------------------------------------------------


def _thesis(orcid, year=2019, handle="90001"):
    return Thesis(f"https://hdl.handle.net/2144/{handle}", "Thesis Writer Example", "MOCK title", "Doctor of Philosophy",
                  "doctoral", "Biostatistics", year, orcid, ())


def test_discover_creates_entries_only_for_graph_orcids_with_bu_degrees(educations):
    docs = [graph(("person:openalex:A1", "Example Alum", ORCID_A),
                  ("person:openalex:A2", "Example Thesis Author", ORCID_B),
                  ("person:openalex:A3", "Example Nobody", ORCID_C),
                  ("person:openalex:A4", "Example No Orcid", None))]
    edus = {ORCID_A: educations, ORCID_B: {}, ORCID_C: {}}
    entries, stats = discover(docs, [], edus, [_thesis(ORCID_B), _thesis(None, handle="90002")], this_year=2026)

    by_orcid = {e["orcid"]: e for e in entries}
    assert set(by_orcid) == {ORCID_A, ORCID_B}
    alum = by_orcid[ORCID_A]
    assert alum["slug"] == "example-alum-0001" and alum["name"] == "Example Alum"
    assert alum["bu"]["status"] == "verified_alumnus"
    assert (alum["bu"]["degree"], alum["bu"]["graduation_year"]) == ("Ph.D.", 2015)  # most recent BU degree
    assert alum["submitted_by"] == "user_submitted" and alum["discovered_by"] == ["orcid"]
    assert "Doctor of Medicine" in alum["bu"]["evidence"][0]["note"]  # every BU degree is cited

    author = by_orcid[ORCID_B]
    assert author["bu"]["evidence"] == [{"source": "bu_repository", "url": "https://hdl.handle.net/2144/90001",
                                         "note": _thesis(ORCID_B).note()}]
    assert author["submitted_by"] == "bu_repository" and author["bu"]["department"] == "Biostatistics"
    assert stats.theses_with_orcid == 1 and stats.theses_linked == 1


def test_hand_curated_people_win(educations):
    docs = [graph(("person:openalex:A1", "Example Alum", ORCID_A))]
    curated = [{"slug": "example-alum", "name": "Example Alum", "orcid": ORCID_A}]
    entries, stats = discover(docs, curated, {ORCID_A: educations}, [], this_year=2026)
    assert entries == [] and stats.skipped["already_hand_curated"] == 1
    assert merge_entries(curated, [{"slug": "x-0001", "orcid": ORCID_A}, {"slug": "y-0002", "orcid": ORCID_B}]) == [
        curated[0], {"slug": "y-0002", "orcid": ORCID_B}]


def test_discovered_entries_build_a_valid_directory(tmp_path, educations):
    docs = [graph(("person:openalex:A1", "José Example-Alum", ORCID_A), ("person:openalex:A2", "Example Writer", ORCID_B))]
    entries, _ = discover(docs, [], {ORCID_A: educations}, [_thesis(ORCID_B)], this_year=2026)
    path = write_discovered(entries, tmp_path / "people.discovered.yaml")
    assert path.read_text().startswith("# GENERATED")
    doc = build_document(entries, generated_at="2026-10-25T00:00:00Z")
    node = next(n for n in doc["nodes"] if n["attributes"]["orcid"] == ORCID_A)
    assert node["id"] == "person:canonical:jose-example-alum-0001"
    assert node["bu_affiliation"]["details"] == {"degree": "Ph.D.", "graduation_year": 2015, "department": "Biostatistics"}
    assert validate_graph(doc).errors == []
    assert slugify("  Ñame  O'Brien ") == "name-o-brien"


# --- Property ------------------------------------------------------------------

ORCIDS = [f"0000-0000-0001-{i:04d}" for i in range(6)]
DEGREE_ROWS = [("Ph.D.", "Boston University"), ("MPH", "Example University"), ("Postdoctoral Fellow", "Boston University")]


@st.composite
def discovery_inputs(draw):
    in_graph = draw(st.lists(st.sampled_from(ORCIDS), unique=True))
    edus = {}
    for orcid in ORCIDS:
        rows = draw(st.lists(st.sampled_from(DEGREE_ROWS), max_size=2))
        edus[orcid] = {"affiliation-group": [{"summaries": [{"education-summary": {
            "role-title": role, "organization": {"name": org}, "end-date": {"year": {"value": "2010"}}}}]}
            for role, org in rows]}
    theses = [_thesis(o, handle=str(90000 + i)) for i, o in enumerate(draw(st.lists(st.sampled_from(ORCIDS + [None]))))]
    curated = draw(st.lists(st.sampled_from(ORCIDS), unique=True, max_size=2))
    return in_graph, edus, theses, curated


@given(discovery_inputs())
def test_entry_iff_graph_orcid_has_a_stated_bu_degree(inputs):
    """Property D1 (Req 1.3, 4.1): a discovered entry exists iff its ORCID is on a graph person, is not
    hand-curated, and an ORCID education entry or an OpenBU thesis states a BU degree for it. Every
    entry is verified_alumnus with a degree, a graduation year, and at least one evidence URL."""
    in_graph, edus, theses, curated = inputs
    docs = [graph(*[(f"person:openalex:A{i}", f"Example Person {i}", o) for i, o in enumerate(in_graph)])]
    entries, _ = discover(docs, [{"slug": f"c{i}", "orcid": o} for i, o in enumerate(curated)], edus, theses, 2026)

    def has_degree(o):
        rows = [g["summaries"][0]["education-summary"] for g in edus[o]["affiliation-group"]]
        orcid_degree = any(r["role-title"] in ("Ph.D.",) and r["organization"]["name"] == "Boston University" for r in rows)
        return orcid_degree or any(t.orcid == o for t in theses)

    assert {e["orcid"] for e in entries} == {o for o in in_graph if o not in curated and has_degree(o)}
    for e in entries:
        assert e["bu"]["status"] == "verified_alumnus" and e["bu"]["degree"] and e["bu"]["graduation_year"]
        assert e["bu"]["evidence"] and all(ev["url"].startswith("https://") for ev in e["bu"]["evidence"])
