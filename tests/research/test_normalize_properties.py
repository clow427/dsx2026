"""Property-based tests for research normalization and Semantic Scholar enrichment (Hypothesis).

Each test checks a correctness property from `.kiro/specs/research-graph/design.md`
("Correctness properties") against a small, independent oracle computed straight
from the generated input.

Generated works are fictional (MOCK): random IDs, random titles. The normalizer
builds openalex.org URLs from those IDs, but nothing here is written to disk.
"""

from __future__ import annotations

import tempfile
from itertools import combinations

from hypothesis import given
from hypothesis import strategies as st

from pipelines.common.validation import validate_graph
from pipelines.research.config import ResearchConfig
from pipelines.research.enrich_s2 import enrich_with_s2
from pipelines.research.normalize import normalize_works

from .conftest import FakeClient

BU = "I111088046"
OA = "https://openalex.org/"
RETRIEVED = "2026-10-24"

# Fixed pools so that authors, institutions, and topics recur across works.
AUTHORS = [(f"A90000000{i:02d}", f"Example Author {i}") for i in range(12)]
INSTITUTIONS = [
    {"id": f"{OA}{BU}", "display_name": "Boston University", "ror": "https://ror.org/05qwgg493",
     "lineage": [f"{OA}{BU}"], "bu": True},
    {"id": f"{OA}I9000000001", "display_name": "Example BU Child Institute",
     "lineage": [f"{OA}I9000000001", f"{OA}{BU}"], "bu": True},
    {"id": f"{OA}I9000000002", "display_name": "Example Hospital", "ror": "https://ror.org/00example0",
     "lineage": [f"{OA}I9000000002"], "bu": False},
    {"id": f"{OA}I9000000003", "display_name": "Example University", "lineage": [f"{OA}I9000000003"], "bu": False},
]
TOPICS = [(f"T9000{i}", f"Example Topic {i}") for i in range(5)]


@st.composite
def authorships(draw) -> dict:
    if draw(st.integers(0, 9)) == 0:  # ~10%: an authorship OpenAlex couldn't attribute to an author ID
        author = {"id": None, "display_name": draw(st.sampled_from(["", "Unattributed Example"]))}
    else:
        aid, name = draw(st.sampled_from(AUTHORS))
        author = {"id": f"{OA}{aid}", "display_name": name}
    insts = draw(st.lists(st.sampled_from(range(len(INSTITUTIONS))), max_size=2, unique=True))
    return {
        "author": author,
        "author_position": draw(st.sampled_from(["first", "middle", "last"])),
        "institutions": [{k: v for k, v in INSTITUTIONS[i].items() if k != "bu"} for i in insts],
    }


@st.composite
def works(draw) -> list[dict]:
    ids = draw(st.lists(st.integers(1, 10_000), min_size=0, max_size=8, unique=True))
    out = []
    for n in ids:
        topics = draw(st.lists(st.sampled_from(TOPICS), max_size=3, unique=True))
        out.append({
            "id": f"{OA}W9{n:09d}",
            "display_name": draw(st.sampled_from(["Example Study", "  Example Trial  ", "", "   "])),
            "publication_year": draw(st.one_of(st.none(), st.integers(2000, 2025))),
            "doi": draw(st.one_of(st.none(), st.just(f"https://doi.org/10.0000/example.{n}"))),
            "authorships": draw(st.lists(authorships(), max_size=6)),
            "topics": [{"id": f"{OA}{tid}", "display_name": name, "score": 0.9} for tid, name in topics],
        })
    return out


def normalize(ws, cap=25):
    g, stats = normalize_works(ws, retrieved_at=RETRIEVED, bu_institution_id=BU, max_authors_for_coauthor=cap)
    return g, stats, g.to_document("research", generated_at="2026-10-24T00:00:00Z")


# --- Oracle: what the requirements say the output must contain -------------


def _included(ws):
    """Works the pipeline must keep: an ID, a non-blank title, and at least one identified author."""
    for w in ws:
        identified = [a for a in w["authorships"] if a["author"]["id"] and a["author"]["display_name"].strip()]
        if w["display_name"].strip() and identified:
            yield w, identified


def _wid(w):
    return w["id"][len(OA):]


def _pid(a):
    return f"person:openalex:{a['author']['id'][len(OA):]}"


def _is_bu(inst):
    return any(i == f"{OA}{BU}" for i in inst.get("lineage", []))


# --- Properties ------------------------------------------------------------


@given(works(), st.integers(1, 6))
def test_output_always_passes_validator_cleanly(ws, cap):
    """Property R1 (Req 2, 5.2): for any input, the emitted graph has no validator errors or warnings."""
    _, _, doc = normalize(ws, cap)
    result = validate_graph(doc)
    assert result.errors == []
    assert result.warnings == []


@given(works())
def test_publications_and_authored_edges_come_only_from_input(ws):
    """Property R2 (Req 2.1, 2.2, 5.1): exactly the kept works become publications, exactly their
    identified authorships become AUTHORED edges, and each carries its work as evidence."""
    _, _, doc = normalize(ws)
    expected_pubs = {f"publication:openalex:{_wid(w)}" for w, _ in _included(ws)}
    expected_authored = {(_pid(a), f"publication:openalex:{_wid(w)}") for w, ids in _included(ws) for a in ids}

    pubs = {n["id"] for n in doc["nodes"] if n["type"] == "publication"}
    authored = {(e["source"], e["target"]) for e in doc["edges"] if e["type"] == "AUTHORED"}
    assert pubs == expected_pubs
    assert authored == expected_authored
    for e in doc["edges"]:
        if e["type"] == "AUTHORED":
            assert [r["record_id"] for r in e["evidence"]] == [e["target"].rsplit(":", 1)[1]]


@given(works())
def test_bu_status_follows_authorship_evidence_and_never_claims_alumni(ws):
    """Property R3 (Req 2.3, 2.4): a person is bu_affiliated_researcher iff one of their kept
    authorships lists BU or a BU child institution, with exactly those works as evidence.
    Otherwise unverified. Never verified_alumnus."""
    _, _, doc = normalize(ws)
    expected: dict[str, set[str]] = {}
    for w, ids in _included(ws):
        for a in ids:
            bu_works = expected.setdefault(_pid(a), set())
            if any(_is_bu(i) for i in a["institutions"]):
                bu_works.add(_wid(w))

    people = {n["id"]: n for n in doc["nodes"] if n["type"] == "person"}
    assert set(people) == set(expected)
    for pid, bu_works in expected.items():
        aff = people[pid]["bu_affiliation"]
        assert aff["status"] != "verified_alumnus"
        if bu_works:
            assert aff["status"] == "bu_affiliated_researcher"
            assert {r["record_id"] for r in aff["evidence"]} == bu_works
        else:
            assert aff == {"status": "unverified", "evidence": []}


@given(works(), st.integers(1, 6))
def test_coauthor_edges_match_shared_works_under_the_cap(ws, cap):
    """Property R4 (Req 3.1, 3.2): A and B have one COAUTHORED_WITH edge iff they share a kept work with
    at most `cap` distinct identified authors, and its evidence is exactly those shared works."""
    _, _, doc = normalize(ws, cap)
    expected: dict[tuple[str, str], set[str]] = {}
    for w, ids in _included(ws):
        authors = sorted({_pid(a) for a in ids})
        if len(authors) > cap:
            continue
        for pair in combinations(authors, 2):
            expected.setdefault(pair, set()).add(_wid(w))

    got = {
        (e["source"], e["target"]): {r["record_id"] for r in e["evidence"]}
        for e in doc["edges"]
        if e["type"] == "COAUTHORED_WITH"
    }
    assert got == expected
    for e in doc["edges"]:
        if e["type"] == "COAUTHORED_WITH":
            assert e["derivation"] == "derived" and e["source"] < e["target"]


@given(works())
def test_normalization_is_deterministic(ws):
    """Property R5 (python-pipelines steering: reruns produce identical diffs)."""
    assert normalize(ws)[2] == normalize(ws)[2]


@st.composite
def s2_responses(draw, dois: list[str]) -> list:
    """One S2 batch result per DOI: a confirmed match, a different DOI, a record without paperId, or null."""
    out = []
    for i, doi in enumerate(dois):
        kind = draw(st.sampled_from(["match", "match_upper", "other_doi", "no_paper_id", "null"]))
        if kind == "null":
            out.append(None)
            continue
        s2_doi = {"match": doi, "match_upper": doi.upper(), "other_doi": doi + "9"}.get(kind, doi)
        paper = {"externalIds": {"DOI": s2_doi}, "citationCount": draw(st.integers(0, 500))}
        if kind != "no_paper_id":
            paper["paperId"] = f"examples2{i}"
        out.append(paper)
    return out


@given(works(), st.data())
def test_s2_enrichment_never_adds_nodes_or_edges(ws, data):
    """Property R6 (Req 4.2): enrichment never adds or removes nodes or edges, and adds a
    semantic_scholar source only to publications whose DOI S2 confirms (case-insensitively)."""
    g, _, before = normalize(ws)
    dois = sorted({n["attributes"]["doi"] for n in g.nodes.values()
                   if n["type"] == "publication" and n.get("attributes", {}).get("doi")})
    responses = data.draw(s2_responses(dois)) if dois else []
    with tempfile.TemporaryDirectory() as tmp:
        enrich_with_s2(g, ResearchConfig(cache_dir=tmp), client=FakeClient([responses] if dois else []))
    after = g.to_document("research", generated_at="2026-10-24T00:00:00Z")

    assert [n["id"] for n in after["nodes"]] == [n["id"] for n in before["nodes"]]
    assert after["edges"] == before["edges"]
    confirmed = {doi for doi, r in zip(dois, responses)
                 if r and r.get("paperId") and r["externalIds"]["DOI"].lower() == doi.lower()}
    for node in after["nodes"]:
        has_s2 = any(s["source"] == "semantic_scholar" for s in node["sources"])
        assert has_s2 == (node["type"] == "publication" and node.get("attributes", {}).get("doi") in confirmed)
    assert validate_graph(after).errors == []
