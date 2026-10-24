"""Fixture-based tests for innovation normalization (innovation-funding task 7, Req 1-3)."""

from dataclasses import replace

from pipelines.common.validation import validate_graph
from pipelines.innovation.config import BU_ASSIGNEE_PATTERN, InnovationConfig
from pipelines.innovation.fetch_patents import select_patents
from pipelines.innovation.normalize import normalize_awards, normalize_patents, safe_local_id

from .conftest import BU_NAMES, PATENTSVIEW_FIXTURES

BU_ORG = "organization:ror:05qwgg493"
NIH_ORG = "organization:ror:01cwqze88"


def awards_doc(projects, links, works, known=None):
    g, stats = normalize_awards(projects, links, works, "2026-10-24", BU_NAMES, known_publication_ids=known)
    return g, stats, g.to_document("innovation", generated_at="2026-10-24T00:00:00Z")


def patents_doc(cpc_prefixes=("G16H", "G06N", "G06T7")):
    config = replace(InnovationConfig(), cpc_prefixes=cpc_prefixes)
    records = select_patents(PATENTSVIEW_FIXTURES, config)
    g, stats = normalize_patents(records, "2026-10-24", BU_ASSIGNEE_PATTERN)
    return g, stats, g.to_document("innovation", generated_at="2026-10-24T00:00:00Z")


def edges(doc, edge_type):
    return {(e["source"], e["target"]): e for e in doc["edges"] if e["type"] == edge_type}


# --- Awards ------------------------------------------------------------------


def test_award_output_passes_validator_without_warnings(nih_projects, nih_links, pmid_works):
    _, _, doc = awards_doc(nih_projects, nih_links, pmid_works)
    result = validate_graph(doc)
    assert result.errors == [] and result.warnings == []


def test_one_award_per_core_project_with_every_year_as_a_source(nih_projects, nih_links, pmid_works):
    g, stats, _ = awards_doc(nih_projects, nih_links, pmid_works)
    award = g.nodes["award:nih:R01EX000001"]
    assert award["label"] == "MOCK Example Machine Learning for Clinical Triage (renewal)"  # latest year
    assert [s["record_id"] for s in award["sources"]] == ["1R01EX000001-01", "5R01EX000001-02"]
    assert award["attributes"] == {
        "agency": "NIH",
        "award_number": "R01EX000001",
        "latest_project_number": "5R01EX000001-02",
        "fiscal_year": 2022,
        "amount_usd": 120000,
        "institute": "EXIC",
        "activity_code": "R01",
        "start_date": "2021-01-01",
        "end_date": "2025-12-31",
        "awardee": "BOSTON UNIVERSITY MEDICAL CAMPUS",
    }
    assert stats.awards == 2


def test_non_bu_and_core_less_projects_are_dropped(nih_projects, nih_links, pmid_works):
    g, stats, _ = awards_doc(nih_projects, nih_links, pmid_works)
    assert "award:nih:R01EX000003" not in g.nodes  # Tufts (NIH's org filter matches substrings)
    assert "person:nih:9000003" not in g.nodes
    assert stats.skipped["project_not_at_bu"] == 1
    assert stats.skipped["project_without_valid_core_number"] == 1


def test_only_contact_pi_is_bu_affiliated(nih_projects, nih_links, pmid_works):
    """Req 3.2: NIH lists the awardee organization of the contact PI only."""
    g, _, doc = awards_doc(nih_projects, nih_links, pmid_works)
    contact = g.nodes["person:nih:9000001"]
    co = g.nodes["person:nih:9000002"]
    assert contact["label"] == "Example Q Investigator"
    assert contact["bu_affiliation"]["status"] == "bu_affiliated_researcher"
    assert {r["record_id"] for r in contact["bu_affiliation"]["evidence"]} == {"1R01EX000001-01", "5R01EX000001-02"}
    assert co["bu_affiliation"] == {"status": "unverified", "evidence": []}
    assert set(edges(doc, "AFFILIATED_WITH")) == {("person:nih:9000001", BU_ORG)}


def test_received_award_and_funder_edges(nih_projects, nih_links, pmid_works):
    _, _, doc = awards_doc(nih_projects, nih_links, pmid_works)
    received = edges(doc, "RECEIVED_AWARD")
    assert set(received) == {
        ("person:nih:9000001", "award:nih:R01EX000001"),
        ("person:nih:9000002", "award:nih:R01EX000001"),
        ("person:nih:9000002", "award:nih:R21EX000002"),
    }
    assert received[("person:nih:9000001", "award:nih:R01EX000001")]["note"] == "Contact PI"
    funded = edges(doc, "FUNDED_BY")
    assert ("award:nih:R01EX000001", NIH_ORG) in funded
    assert all(e["confidence"] == "high" and e["derivation"] == "source_record" for e in doc["edges"])


def test_funded_by_publication_only_from_nih_listed_pmids(nih_projects, nih_links, pmid_works):
    """Req 2 / N3: a FUNDED_BY publication edge needs NIH's PMID link and an OpenAlex work for it."""
    g, stats, doc = awards_doc(nih_projects, nih_links, pmid_works)
    pub_edges = {k for k in edges(doc, "FUNDED_BY") if k[0].startswith("publication:")}
    assert pub_edges == {
        ("publication:openalex:W9100000001", "award:nih:R01EX000001"),
        ("publication:openalex:W9100000001", "award:nih:R21EX000002"),
        ("publication:openalex:W9100000002", "award:nih:R01EX000001"),
    }
    assert g.nodes["publication:openalex:W9100000001"]["attributes"] == {
        "pmid": "10000001", "doi": "10.0000/example.funded1", "year": 2022}
    assert stats.skipped["funded_pmid_not_resolved_by_openalex"] == 1  # PMID 10000009


def test_funded_publications_can_be_limited_to_known_ids(nih_projects, nih_links, pmid_works):
    g, stats, _ = awards_doc(nih_projects, nih_links, pmid_works, known={"publication:openalex:W9100000002"})
    assert "publication:openalex:W9100000001" not in g.nodes
    assert "publication:openalex:W9100000002" in g.nodes
    assert stats.skipped["funded_publication_outside_research_graph"] == 2


# --- Patents -----------------------------------------------------------------


def test_patent_selection_uses_bu_assignee_and_cpc():
    config = replace(InnovationConfig(), cpc_prefixes=("G16H", "G06N", "G06T7"))
    records = select_patents(PATENTSVIEW_FIXTURES, config)
    # 9000002 is BU but C12Q; 9000004 is G16H but not BU.
    assert [r["patent_id"] for r in records] == ["9000001", "9000003"]
    first = records[0]
    assert first["filing_date"] == "2020-03-01"
    assert first["cpc_codes"] == ["G16H50/20", "G06N20/00"]
    assert first["inventors"][0]["location"] == {"city": "Example City", "state": "MA", "country": "US"}
    assert [a["organization"] for a in first["assignees"]] == ["Trustees of Boston University", "Example Partner Corp"]


def test_empty_cpc_prefixes_keep_every_bu_patent():
    records = select_patents(PATENTSVIEW_FIXTURES, replace(InnovationConfig(), cpc_prefixes=()))
    assert [r["patent_id"] for r in records] == ["9000001", "9000002", "9000003"]


def test_patent_output_passes_validator_without_warnings():
    _, _, doc = patents_doc()
    result = validate_graph(doc)
    assert result.errors == [] and result.warnings == []


def test_patent_nodes_and_edges():
    g, stats, doc = patents_doc()
    patent = g.nodes["patent:uspto:US9000001B2"]
    assert patent["label"] == "MOCK Example System for Machine Learning Triage"
    assert patent["sources"][0]["record_id"] == "9000001"
    assert patent["sources"][0]["url"] == "https://patents.google.com/patent/US9000001B2"
    assert patent["attributes"] == {
        "patent_number": "US9000001B2",
        "grant_date": "2022-05-03",
        "filing_date": "2020-03-01",
        "cpc_codes": ["G16H50/20", "G06N20/00"],
    }
    assert set(edges(doc, "ASSIGNED_TO")) == {
        ("patent:uspto:US9000001B2", BU_ORG),
        ("patent:uspto:US9000001B2", "organization:patentsview:mockasg-co"),
        ("patent:uspto:US9000003B2", BU_ORG),
    }
    assert ("person:patentsview:mockinv001", "patent:uspto:US9000001B2") in edges(doc, "INVENTED")
    assert stats.patents == 2


def test_inventor_ids_that_do_not_fit_the_contract_are_hashed_and_kept_as_record_id():
    g, _, _ = patents_doc()
    local = safe_local_id("mock:inv/002")
    person = g.nodes[f"person:patentsview:{local}"]
    assert local.startswith("h") and person["attributes"]["patentsview_inventor_id"] == "mock:inv/002"
    assert safe_local_id("mockinv001") == "mockinv001"


def test_inventor_without_id_is_skipped_not_invented():
    g, _, _ = patents_doc()
    assert not any(n["label"] == "No Identifier" for n in g.nodes.values())


def test_inventors_on_bu_patents_are_bu_affiliated_never_alumni():
    g, _, _ = patents_doc()
    inv = g.nodes["person:patentsview:mockinv001"]
    assert inv["bu_affiliation"]["status"] == "bu_affiliated_researcher"
    assert inv["bu_affiliation"]["evidence"][0]["note"] == "Patent assigned to Trustees of Boston University"
    assert inv["attributes"]["location"] == {"city": "Example City", "state": "MA", "country": "US"}
    assert inv["attributes"]["assignees"] == ["Example Partner Corp", "Trustees of Boston University"]
    assert all(n["bu_affiliation"]["status"] != "verified_alumnus" for n in g.nodes.values() if n["type"] == "person")
