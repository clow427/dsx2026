"""Property-based tests for innovation normalization (Hypothesis).

Each test checks a correctness property from `.kiro/specs/innovation-funding/design.md`
("Correctness properties") against a small oracle computed straight from the
generated input. Generated records are fictional (MOCK).
"""

from __future__ import annotations

from hypothesis import given
from hypothesis import strategies as st

from pipelines.common.validation import validate_graph
from pipelines.innovation.config import BU_ASSIGNEE_PATTERN
from pipelines.innovation.normalize import normalize_awards, normalize_patents, safe_local_id

from .conftest import BU_NAMES

RETRIEVED = "2026-10-24"
ORGS = ["BOSTON UNIVERSITY MEDICAL CAMPUS", "BOSTON UNIVERSITY (CHARLES RIVER CAMPUS)", "TUFTS UNIVERSITY BOSTON"]
PIS = [(9100000 + i, f"Example{i}", f"Investigator{i}") for i in range(6)]
CORES = [f"R01EX{i:06d}" for i in range(6)]
PMIDS = [str(20000000 + i) for i in range(8)]
INVENTORS = ["mockinv1", "mockinv2", "mock:inv|3", "mock inv\n4", "mockinv5"]
ASSIGNEES = [("asg-bu", "Trustees of Boston University"), ("asg-bu2", "Boston University"),
             ("asg-x", "Example Partner Corp"), ("asg-y", "Example University")]


@st.composite
def nih_inputs(draw):
    projects = []
    for appl in draw(st.lists(st.integers(1, 10_000), max_size=8, unique=True)):
        pis = []
        for profile, first, last in draw(st.lists(st.sampled_from(PIS), max_size=3, unique=True)):
            pis.append({"profile_id": profile, "first_name": first, "middle_name": "", "last_name": last,
                        "is_contact_pi": draw(st.booleans())})
        projects.append({
            "appl_id": appl,
            "project_num": f"1{draw(st.sampled_from(CORES))}-0{appl % 9}",
            "core_project_num": draw(st.sampled_from(CORES + [""])),
            "fiscal_year": draw(st.integers(2015, 2026)),
            "project_title": draw(st.sampled_from(["MOCK Example Study", "  ", "MOCK Example Trial"])),
            "organization": {"org_name": draw(st.sampled_from(ORGS))},
            "principal_investigators": pis,
            "project_detail_url": f"https://example.org/nih/{appl}",
        })
    links = [{"coreproject": draw(st.sampled_from(CORES)), "pmid": int(p), "applid": draw(st.integers(1, 10_000))}
             for p in draw(st.lists(st.sampled_from(PMIDS), max_size=10))]
    resolved = draw(st.lists(st.sampled_from(PMIDS), unique=True))
    works = {p: {"id": f"https://openalex.org/W9{p}", "display_name": f"MOCK Example Work {p}"} for p in resolved}
    return projects, links, works


@st.composite
def patent_inputs(draw):
    records = []
    for n in draw(st.lists(st.integers(1, 99_999), max_size=6, unique=True)):
        inventors = [{"inventor_id": i, "sequence": s, "first": "Example", "last": f"Inventor {i[-1:]}"}
                     for s, i in enumerate(draw(st.lists(st.sampled_from(INVENTORS + [""]), max_size=3, unique=True)))]
        assignees = [{"assignee_id": a, "sequence": s, "organization": o}
                     for s, (a, o) in enumerate(draw(st.lists(st.sampled_from(ASSIGNEES), max_size=2, unique=True)))]
        records.append({"patent_id": f"9{n:06d}", "title": draw(st.sampled_from(["MOCK Example Device", ""])),
                        "kind": draw(st.sampled_from(["B1", "B2", None])), "inventors": inventors,
                        "assignees": assignees})
    return records


def run(nih, patents):
    projects, links, works = nih
    g, _ = normalize_awards(projects, links, works, RETRIEVED, BU_NAMES)
    normalize_patents(patents, RETRIEVED, BU_ASSIGNEE_PATTERN, builder=g)
    return g.to_document("innovation", generated_at="2026-10-24T00:00:00Z")


# --- Oracle ------------------------------------------------------------------


def _kept_projects(projects):
    return [p for p in projects if p["organization"]["org_name"] in BU_NAMES and p["core_project_num"]
            and p["project_title"].strip()]


def _kept_patents(records):
    for r in records:
        inventors = [i for i in r["inventors"] if i["inventor_id"]]
        if r["title"] and inventors:
            yield r, inventors


def _patent_node(r):
    return f"patent:uspto:US{r['patent_id']}{r['kind'] or ''}"


# --- Properties --------------------------------------------------------------


@given(nih_inputs(), patent_inputs())
def test_output_always_passes_validator_cleanly(nih, patents):
    """Property N1 (Req 4.2): for any input, the emitted graph has zero validator errors or warnings."""
    result = validate_graph(run(nih, patents))
    assert result.errors == []
    assert result.warnings == []


@given(patent_inputs())
def test_invented_and_assigned_edges_are_exactly_the_listings(patents):
    """Property N2 (Req 1.2, 1.3): INVENTED edges are exactly the identified inventor listings and
    ASSIGNED_TO edges exactly the organization assignee listings, each with its patent as evidence."""
    doc = run(([], [], {}), patents)
    expected_inv, expected_asg = set(), set()
    for r, inventors in _kept_patents(patents):
        for i in inventors:
            expected_inv.add((f"person:patentsview:{safe_local_id(i['inventor_id'])}", _patent_node(r)))
        for a in r["assignees"]:
            bu = a["organization"] in ("Trustees of Boston University", "Boston University")
            org = "organization:ror:05qwgg493" if bu else f"organization:patentsview:{a['assignee_id']}"
            expected_asg.add((_patent_node(r), org))

    patent_ids = {_patent_node(r): r["patent_id"] for r, _ in _kept_patents(patents)}
    by_type = lambda t: {(e["source"], e["target"]) for e in doc["edges"] if e["type"] == t}  # noqa: E731
    assert by_type("INVENTED") == expected_inv
    assert by_type("ASSIGNED_TO") == expected_asg
    for e in doc["edges"]:
        if e["type"] in ("INVENTED", "ASSIGNED_TO"):
            patent = e["target"] if e["type"] == "INVENTED" else e["source"]
            assert [r["record_id"] for r in e["evidence"]] == [patent_ids[patent]]


@given(nih_inputs())
def test_funded_by_publication_only_from_listed_and_resolved_pmids(nih):
    """Property N3 (Req 2): a publication FUNDED_BY edge exists iff NIH lists the PMID under a kept
    award and OpenAlex resolved that PMID. Nothing is inferred from titles."""
    projects, links, works = nih
    doc = run(nih, [])
    kept_cores = {p["core_project_num"] for p in _kept_projects(projects)}
    expected = {(f"publication:openalex:W9{link['pmid']}", f"award:nih:{link['coreproject']}")
                for link in links if link["coreproject"] in kept_cores and str(link["pmid"]) in works}
    got = {(e["source"], e["target"]) for e in doc["edges"]
           if e["type"] == "FUNDED_BY" and e["source"].startswith("publication:")}
    assert got == expected


@given(nih_inputs(), patent_inputs())
def test_status_rules_and_no_canonical_people(nih, patents):
    """Property N4 (Req 3.1, 3.2): no person is verified_alumnus or uses the canonical namespace, and a
    person is bu_affiliated_researcher iff they are a contact PI on a kept BU project or an inventor on a
    patent assigned to BU."""
    projects, _, _ = nih
    doc = run(nih, patents)
    bu_people = {f"person:nih:{pi['profile_id']}" for p in _kept_projects(projects)
                 for pi in p["principal_investigators"] if pi["is_contact_pi"]}
    for r, inventors in _kept_patents(patents):
        if any(a["organization"] in ("Trustees of Boston University", "Boston University") for a in r["assignees"]):
            bu_people |= {f"person:patentsview:{safe_local_id(i['inventor_id'])}" for i in inventors}

    for n in doc["nodes"]:
        if n["type"] != "person":
            continue
        assert not n["id"].startswith("person:canonical:")
        assert n["bu_affiliation"]["status"] != "verified_alumnus"
        assert (n["bu_affiliation"]["status"] == "bu_affiliated_researcher") == (n["id"] in bu_people)


@given(nih_inputs(), patent_inputs())
def test_normalization_is_deterministic(nih, patents):
    """Property N5 (Req 4): normalizing the same input twice gives identical documents."""
    assert run(nih, patents) == run(nih, patents)
