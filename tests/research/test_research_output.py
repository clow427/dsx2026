"""Checks that run against the committed real output, data/modules/research.json.

The fixture tests prove the code is correct on small fictional inputs. These prove
the real dataset meets the research-graph requirements. They read local files only
(no network). Skipped if the output hasn't been generated yet.

Run: python -m pytest tests/research/test_research_output.py -v
"""

from __future__ import annotations

import json
from collections import defaultdict
from itertools import combinations
from pathlib import Path

import pytest

from pipelines.common.validation import validate_graph
from pipelines.research.config import CACHE_DIR, OUTPUT_PATH, ResearchConfig
from pipelines.research.fetch import build_query, query_hash

pytestmark = pytest.mark.skipif(not OUTPUT_PATH.exists(), reason="run `python -m pipelines.research.run` first")

CONFIG = ResearchConfig()


@pytest.fixture(scope="module")
def doc():
    return json.loads(OUTPUT_PATH.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def idx(doc):
    """Lookup tables used by several checks."""
    nodes = {n["id"]: n for n in doc["nodes"]}
    by_type = defaultdict(list)
    for e in doc["edges"]:
        by_type[e["type"]].append(e)
    authors_of = defaultdict(set)  # publication id -> person ids
    for e in by_type["AUTHORED"]:
        authors_of[e["target"]].add(e["source"])
    return {"nodes": nodes, "edges": by_type, "authors_of": authors_of}


def local_id(node_id: str) -> str:
    return node_id.split(":", 2)[2]


def pub_id(record_id: str) -> str:
    return f"publication:openalex:{record_id}"


# Req 5.2 -------------------------------------------------------------------

def test_passes_validator_with_no_errors_or_warnings(doc):
    result = validate_graph(doc)
    assert result.errors == []
    assert result.warnings == []


def test_is_real_research_output(doc):
    assert doc["producer"] == "research"
    assert "MOCK" not in json.dumps(doc)
    assert not any(n["id"].startswith("person:canonical:") for n in doc["nodes"])


# Req 1 ---------------------------------------------------------------------

def test_scope_matches_config(doc, idx):
    pubs = [n for n in doc["nodes"] if n["type"] == "publication"]
    assert 0 < len(pubs) <= CONFIG.max_works
    for p in pubs:
        attrs = p.get("attributes", {})
        if "year" in attrs:
            assert CONFIG.from_year <= attrs["year"] <= CONFIG.to_year, p["id"]
        if "work_type" in attrs:
            assert attrs["work_type"] in CONFIG.work_types, p["id"]
    if CONFIG.topic_ids:
        wanted = {f"topic:openalex:{t}" for t in CONFIG.topic_ids}
        topics_of = defaultdict(set)
        for e in idx["edges"]["HAS_TOPIC"]:
            topics_of[e["source"]].add(e["target"])
        assert all(topics_of[p["id"]] & wanted for p in pubs), "every work should carry a configured topic"


def _raw_works() -> dict[str, dict]:
    """Raw OpenAlex works from the local cache, keyed by short ID ({} if no cache)."""
    cache_dir = CACHE_DIR / "openalex" / query_hash(build_query(CONFIG))
    works = {}
    for page in sorted(cache_dir.glob("page_*.json")):
        for w in json.loads(page.read_text(encoding="utf-8"))["results"]:
            works[w["id"].rsplit("/", 1)[1]] = w
    for full in sorted(cache_dir.glob("full_*.json")):
        w = json.loads(full.read_text(encoding="utf-8"))
        works[w["id"].rsplit("/", 1)[1]] = w
    return works


def test_every_work_has_a_bu_authorship(doc, idx):
    """Each work was fetched by the BU filter, so some author should carry BU evidence.

    The only allowed exception: the work's BU authorships all lack an OpenAlex
    author ID, so no person node can be created for them (confirmed from the raw cache).
    """
    from pipelines.research.normalize import is_bu_institution

    bu_evidence = defaultdict(set)
    for n in doc["nodes"]:
        if n["type"] == "person":
            for ref in n["bu_affiliation"]["evidence"]:
                bu_evidence[pub_id(ref["record_id"])].add(n["id"])
    unexplained = [p["id"] for p in doc["nodes"] if p["type"] == "publication" and not bu_evidence[p["id"]]]
    if not unexplained:
        return

    raw = _raw_works()
    if not raw:
        pytest.skip(f"{len(unexplained)} works lack BU evidence; raw cache needed to check why")
    for wid in unexplained:
        bu_authorships = [
            a
            for a in raw[local_id(wid)]["authorships"]
            if any(is_bu_institution(i, CONFIG.institution_id) for i in a.get("institutions") or [])
        ]
        assert bu_authorships, f"{wid}: no BU authorship in the raw record (author list truncated?)"
        assert all(not (a.get("author") or {}).get("id") for a in bu_authorships), wid


# Req 2.1, 2.2 --------------------------------------------------------------

def test_node_sources_point_to_their_own_openalex_record(doc):
    for n in doc["nodes"]:
        openalex = [s for s in n["sources"] if s["source"] == "openalex"]
        assert len(openalex) == 1, n["id"]
        ref = openalex[0]
        expected = n["attributes"]["openalex_id"] if n["type"] == "organization" else local_id(n["id"])
        assert ref["record_id"] == expected, n["id"]
        assert ref["url"] == f"https://openalex.org/{expected}", n["id"]


def test_source_record_edges_cite_a_publication_in_the_graph(idx):
    for edge_type in ("AUTHORED", "AFFILIATED_WITH", "HAS_TOPIC"):
        for e in idx["edges"][edge_type]:
            assert e["derivation"] == "source_record" and e["confidence"] == "high"
            for ref in e["evidence"]:
                assert ref["source"] == "openalex"
                assert pub_id(ref["record_id"]) in idx["nodes"], e["id"]


def test_authored_and_has_topic_cite_their_own_publication(idx):
    for e in idx["edges"]["AUTHORED"]:
        assert [r["record_id"] for r in e["evidence"]] == [local_id(e["target"])]
    for e in idx["edges"]["HAS_TOPIC"]:
        assert [r["record_id"] for r in e["evidence"]] == [local_id(e["source"])]


def test_affiliation_evidence_is_a_work_the_person_authored(idx):
    for e in idx["edges"]["AFFILIATED_WITH"]:
        for ref in e["evidence"]:
            assert e["source"] in idx["authors_of"][pub_id(ref["record_id"])], e["id"]


def test_publications_have_one_to_three_topics(doc, idx):
    count = defaultdict(int)
    for e in idx["edges"]["HAS_TOPIC"]:
        count[e["source"]] += 1
    for p in (n for n in doc["nodes"] if n["type"] == "publication"):
        assert 1 <= count[p["id"]] <= 3, p["id"]


# Req 2.3, 2.4 --------------------------------------------------------------

def test_no_one_is_promoted_to_verified_alumnus(doc):
    statuses = {n["bu_affiliation"]["status"] for n in doc["nodes"] if n["type"] == "person"}
    assert statuses <= {"bu_affiliated_researcher", "unverified"}


def test_bu_status_is_backed_by_an_authored_work_and_affiliation_edge(doc, idx):
    affiliations = defaultdict(set)  # (person, work) -> org labels
    for e in idx["edges"]["AFFILIATED_WITH"]:
        for ref in e["evidence"]:
            affiliations[(e["source"], ref["record_id"])].add(idx["nodes"][e["target"]]["label"])

    for n in (n for n in doc["nodes"] if n["type"] == "person"):
        aff = n["bu_affiliation"]
        if aff["status"] == "unverified":
            assert aff["evidence"] == [], n["id"]
            continue
        assert aff["evidence"], n["id"]
        for ref in aff["evidence"]:
            assert n["id"] in idx["authors_of"][pub_id(ref["record_id"])], n["id"]
            org = ref["note"].removeprefix("Authorship institution: ")
            assert org in affiliations[(n["id"], ref["record_id"])], (n["id"], ref["record_id"], org)


# Req 3 ---------------------------------------------------------------------

def test_coauthor_evidence_is_a_work_both_people_authored(idx):
    for e in idx["edges"]["COAUTHORED_WITH"]:
        assert e["derivation"] == "derived"
        assert e["source"] < e["target"]
        for ref in e["evidence"]:
            authors = idx["authors_of"][pub_id(ref["record_id"])]
            assert {e["source"], e["target"]} <= authors, e["id"]
            assert len(authors) <= CONFIG.max_authors_for_coauthor, e["id"]


def test_every_eligible_coauthor_pair_has_an_edge_citing_the_work(idx):
    evidence = {(e["source"], e["target"]): {r["record_id"] for r in e["evidence"]} for e in idx["edges"]["COAUTHORED_WITH"]}
    for work, authors in idx["authors_of"].items():
        if len(authors) > CONFIG.max_authors_for_coauthor:
            continue
        for a, b in combinations(sorted(authors), 2):
            assert local_id(work) in evidence.get((a, b), set()), (a, b, work)


# Req 4 ---------------------------------------------------------------------

def test_semantic_scholar_only_enriches_publications_with_a_doi(doc):
    for n in doc["nodes"]:
        s2 = [s for s in n["sources"] if s["source"] == "semantic_scholar"]
        if n["type"] != "publication":
            assert not s2, n["id"]
        elif s2:
            assert n["attributes"].get("doi"), n["id"]
            assert len(s2) == 1 and s2[0]["url"].startswith("https://www.semanticscholar.org/paper/")
    for e in doc["edges"]:
        assert all(r["source"] != "semantic_scholar" for r in e["evidence"]), e["id"]


def test_no_abstracts_are_stored(doc):
    assert not any("abstract" in n.get("attributes", {}) for n in doc["nodes"])


# Req 5.1 -------------------------------------------------------------------

def test_every_paper_can_show_authors_source_link_and_connections(doc, idx):
    for p in (n for n in doc["nodes"] if n["type"] == "publication"):
        assert idx["authors_of"][p["id"]], p["id"]
        assert p["sources"][0]["url"].startswith("https://openalex.org/W")


def test_people_carry_orcid_only_in_bare_form(doc):
    for n in doc["nodes"]:
        orcid = n.get("attributes", {}).get("orcid")
        if orcid:
            assert not orcid.startswith("http") and len(orcid) == 19, n["id"]


# Reproducibility (Req 2.2 of the shared contract) ---------------------------

def _cache_available() -> bool:
    manifest = CACHE_DIR / "openalex" / query_hash(build_query(CONFIG)) / "manifest.json"
    return manifest.exists() and any((CACHE_DIR / "s2").glob("batch_*.json"))


@pytest.mark.skipif(not _cache_available(), reason="raw API cache not present (data/raw is gitignored)")
def test_rerun_from_cache_reproduces_committed_file(tmp_path, monkeypatch):
    from pipelines.research import http, run

    def no_network(*args, **kwargs):
        raise AssertionError("rerun from cache must not hit the network")

    monkeypatch.setattr(http.PoliteClient, "request", no_network)
    out = tmp_path / "research.json"
    assert run.main(["--output", str(out)]) == 0
    assert out.read_bytes() == Path(OUTPUT_PATH).read_bytes()
