"""End-to-end tests for the identity pipeline (identity-resolution task 8, Req 3, 6).

``test_match.py`` and ``tests/merge/test_merge.py`` cover the matcher and the
merge step on their own. These tests run the whole chain on small fixtures:

    people.yaml --directory--> people.json
    people.json + research.json (+ reviews.yaml) --match--> identity_matches.json
    module files + identity_matches.json --merge--> graph.json

and assert the four required cases in the FINAL merged graph:

  1. ORCID merge: one person node, member node gone, edges reattached (Req 6.1).
  2. Name-only candidate: both nodes kept, low-confidence SAME_AS_CANDIDATE edge (Req 6.2).
  3. ORCID conflict: rejected, nodes separate, no merge and no SAME_AS_CANDIDATE edge.
  4. Low confidence is never merged, on both the review path and a hand-edited
     identity_matches.json (the validator path).

plus ``scripts/validate_graph.py`` passing on every output (Req 6.3).

Fixtures use fictional names and example.org/example.edu URLs and are written to
pytest temp dirs; nothing is written to data/modules/ or data/graph.json.

Run: python -m pytest tests/identity/test_end_to_end.py -v
"""

from __future__ import annotations

import hashlib
import json

import pytest
import yaml

from pipelines.common.contract import REPO_ROOT
from pipelines.identity import run as identity_run
from pipelines.merge import run as merge_run
from scripts import validate_graph as validate_cli

GEN = "2026-01-01T00:00:00Z"

ADA = "person:canonical:ada-example"  # ORCID merge
BEN = "person:canonical:ben-sample"  # name-only candidate
CY = "person:canonical:cy-test"  # ORCID conflict
DEE = "person:canonical:dee-lowe"  # target of merged/low attempts

A1, B1, C1, D1, E1 = (f"person:openalex:{x}" for x in ("A1", "B1", "C1", "D1", "E1"))
W1, W2 = "publication:openalex:W1", "publication:openalex:W2"
BU_ORG = "organization:ror:05qwgg493"

ADA_ORCID = "0000-0000-0000-0001"
CY_ORCID = "0000-0000-0000-0003"
OTHER_ORCID = "0000-0000-0000-0099"


# --- fixtures ---------------------------------------------------------------


def curated(slug: str, name: str, status: str, orcid: str | None = None) -> dict:
    entry = {
        "slug": slug,
        "name": name,
        "submitted_by": "manual_curation",
        "bu": {
            "status": status,
            "evidence": [{"source": "institutional_bio", "url": f"https://example.edu/faculty/{slug}"}],
        },
    }
    if status == "verified_alumnus":
        entry["bu"]["degree"] = "PhD"
    if orcid:
        entry["orcid"] = orcid
    return entry


CURATION = [
    curated("ada-example", "Ada Example", "verified_alumnus", ADA_ORCID),
    curated("ben-sample", "Ben Sample", "bu_affiliated_researcher"),
    curated("cy-test", "Cy Test", "bu_affiliated_researcher", CY_ORCID),
    curated("dee-lowe", "Dee Lowe", "bu_affiliated_researcher"),
]


def oa(record_id: str) -> dict:
    return {"source": "openalex", "record_id": record_id, "url": f"https://openalex.org/{record_id}"}


def person(pid: str, label: str, orcid: str | None = None, bu: bool = False) -> dict:
    local = pid.rsplit(":", 1)[-1]
    node = {
        "id": pid,
        "type": "person",
        "label": label,
        "sources": [oa(local)],
        "bu_affiliation": {
            "status": "bu_affiliated_researcher" if bu else "unverified",
            "evidence": [oa("W1")] if bu else [],
        },
    }
    if orcid:
        node["attributes"] = {"orcid": orcid}
    return node


def edge(etype: str, src: str, tgt: str, evidence: list[dict], derivation: str = "source_record") -> dict:
    return {
        "id": f"edge:{etype.lower()}:{src}|{tgt}",
        "type": etype,
        "source": src,
        "target": tgt,
        "evidence": evidence,
        "confidence": "high",
        "derivation": derivation,
    }


def research_doc() -> dict:
    """A1 shares Ada's ORCID; B1 and D1 share only a name; C1 has a conflicting ORCID."""
    return {
        "schema_version": "0.1.0",
        "generated_at": GEN,
        "producer": "research",
        "nodes": [
            person(A1, "Ada Example", orcid=ADA_ORCID, bu=True),
            person(B1, "Ben Sample"),
            person(C1, "Cy Test", orcid=OTHER_ORCID),
            person(D1, "Dee Lowe"),
            person(E1, "Eve Other"),
            {"id": W1, "type": "publication", "label": "Fixture paper one", "sources": [oa("W1")]},
            {"id": W2, "type": "publication", "label": "Fixture paper two", "sources": [oa("W2")]},
            {"id": BU_ORG, "type": "organization", "label": "Boston University", "sources": [oa("I1")]},
        ],
        "edges": [
            edge("AUTHORED", A1, W1, [oa("W1")]),
            edge("AUTHORED", E1, W1, [oa("W1")]),
            edge("COAUTHORED_WITH", A1, E1, [oa("W1")], derivation="derived"),
            edge("AFFILIATED_WITH", A1, BU_ORG, [oa("W1")]),
            edge("AUTHORED", C1, W2, [oa("W2")]),
        ],
    }


@pytest.fixture(autouse=True)
def real_outputs_untouched():
    """Guard: the e2e runs never write to data/modules/ or data/graph.json."""
    paths = sorted((REPO_ROOT / "data" / "modules").glob("*.json")) + [REPO_ROOT / "data" / "graph.json"]

    def snapshot():
        return {p: hashlib.sha256(p.read_bytes()).hexdigest() if p.exists() else None for p in paths}

    before = snapshot()
    yield
    assert snapshot() == before


@pytest.fixture
def workspace(tmp_path):
    """Temp layout: curation/people.yaml, curation/reviews.yaml, modules/research.json."""
    curation = tmp_path / "curation"
    modules = tmp_path / "modules"
    curation.mkdir()
    modules.mkdir()
    (curation / "people.yaml").write_text(yaml.safe_dump(CURATION, sort_keys=False), encoding="utf-8")
    (curation / "reviews.yaml").write_text("[]\n", encoding="utf-8")
    (modules / "research.json").write_text(json.dumps(research_doc(), indent=2), encoding="utf-8")
    return tmp_path


def run_identity(ws, reviews: list[dict] | None = None) -> int:
    if reviews is not None:
        (ws / "curation" / "reviews.yaml").write_text(yaml.safe_dump(reviews, sort_keys=False), encoding="utf-8")
    return identity_run.main([
        "--curation", str(ws / "curation" / "people.yaml"),
        "--output", str(ws / "modules" / "people.json"),
        "--source", str(ws / "modules" / "research.json"),
        "--matches-output", str(ws / "modules" / "identity_matches.json"),
        "--reviews", str(ws / "curation" / "reviews.yaml"),
    ])


def run_merge(ws) -> int:
    return merge_run.main(["--modules-dir", str(ws / "modules"), "--output", str(ws / "graph.json")])


def load(path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


@pytest.fixture
def pipeline(workspace):
    """Full directory -> match -> merge run. Returns (workspace, matches, graph)."""
    assert run_identity(workspace) == 0
    assert run_merge(workspace) == 0
    matches = {m["canonical_id"]: m for m in load(workspace / "modules" / "identity_matches.json")["matches"]}
    return workspace, matches, load(workspace / "graph.json")


def node_ids(graph: dict) -> set[str]:
    return {n["id"] for n in graph["nodes"]}


def same_as_edges(graph: dict, a: str, b: str) -> list[dict]:
    return [e for e in graph["edges"] if e["type"] == "SAME_AS_CANDIDATE" and {e["source"], e["target"]} == {a, b}]


# --- 1. ORCID merge (Req 6.1) -----------------------------------------------


def test_orcid_merge_leaves_one_node_with_reattached_edges(pipeline):
    _, matches, graph = pipeline
    assert (matches[ADA]["status"], matches[ADA]["confidence"], matches[ADA]["member_ids"]) == ("merged", "high", [A1])

    # Exactly one person node for Ada; the source member node is gone.
    adas = [n for n in graph["nodes"] if n["type"] == "person" and n["label"] == "Ada Example"]
    assert [n["id"] for n in adas] == [ADA]
    assert A1 not in node_ids(graph)
    assert not any(A1 in (e["source"], e["target"]) for e in graph["edges"])

    # A1's edges now hang off the canonical node.
    edges = {(e["type"], e["source"], e["target"]) for e in graph["edges"]}
    assert ("AUTHORED", ADA, W1) in edges
    assert ("AFFILIATED_WITH", ADA, BU_ORG) in edges
    assert ("COAUTHORED_WITH", *sorted((ADA, E1))) in edges

    # The canonical node keeps its curated status and gains A1's provenance.
    ada = next(n for n in graph["nodes"] if n["id"] == ADA)
    assert ada["bu_affiliation"]["status"] == "verified_alumnus"
    assert any(s.get("record_id") == "A1" for s in ada["sources"])


# --- 2. Name-only candidate (Req 6.2) ---------------------------------------


def test_name_only_candidate_is_flagged_edge_not_merge(pipeline):
    _, matches, graph = pipeline
    assert (matches[BEN]["status"], matches[BEN]["confidence"]) == ("candidate", "low")

    assert {BEN, B1} <= node_ids(graph)
    [same_as] = same_as_edges(graph, BEN, B1)
    assert same_as["confidence"] == "low"
    assert same_as["derivation"] == "identity_match"
    assert "not merged" in same_as["note"]


# --- 3. ORCID conflict ------------------------------------------------------


def test_orcid_conflict_is_rejected_and_kept_separate(pipeline):
    _, matches, graph = pipeline
    assert (matches[CY]["status"], matches[CY]["confidence"]) == ("rejected", "high")

    assert {CY, C1} <= node_ids(graph)
    assert same_as_edges(graph, CY, C1) == []
    # C1 keeps its own edge; nothing moved onto the canonical node.
    edges = {(e["type"], e["source"], e["target"]) for e in graph["edges"]}
    assert ("AUTHORED", C1, W2) in edges
    assert not any(CY in (e["source"], e["target"]) for e in graph["edges"])


# --- 4. Low confidence never merged -----------------------------------------


def test_automated_run_never_emits_merged_low(pipeline):
    _, matches, graph = pipeline
    assert all(not (m["status"] == "merged" and m["confidence"] == "low") for m in matches.values())
    # Dee is name-only: stays a candidate, both nodes present.
    assert (matches[DEE]["status"], matches[DEE]["confidence"]) == ("candidate", "low")
    assert {DEE, D1} <= node_ids(graph)


def test_review_trying_merged_low_is_refused(workspace):
    bad_review = [{
        "canonical_id": DEE,
        "member_ids": [D1],
        "status": "merged",
        "confidence": "low",
        "by": "fixture-reviewer",
        "at": "2026-10-24",
    }]
    assert run_identity(workspace, reviews=bad_review) == 1
    # Refused before writing: no matches file, so no merge can follow.
    assert not (workspace / "modules" / "identity_matches.json").exists()
    assert run_merge(workspace) == 1
    assert not (workspace / "graph.json").exists()


def test_hand_edited_merged_low_match_is_rejected_by_validator_and_merge(pipeline):
    ws, _, _ = pipeline
    matches_path = ws / "modules" / "identity_matches.json"
    doc = load(matches_path)
    for m in doc["matches"]:
        if m["canonical_id"] == DEE:
            m["status"] = "merged"  # confidence stays "low"
    matches_path.write_text(json.dumps(doc, indent=2), encoding="utf-8")
    (ws / "graph.json").unlink()

    assert validate_cli.main(["--identity", str(matches_path)]) == 1
    assert run_merge(ws) == 1
    assert not (ws / "graph.json").exists()


# --- Req 6.3: every output validates ----------------------------------------


def test_all_outputs_pass_validate_graph_script(pipeline):
    ws, _, graph = pipeline
    modules = ws / "modules"
    assert validate_cli.main([
        str(modules / "people.json"),
        str(ws / "graph.json"),
        "--identity", str(modules / "identity_matches.json"),
    ]) == 0
    assert graph["producer"] == "merge"
    # Req 6.1 across the whole graph: every canonical person appears once.
    ids = [n["id"] for n in graph["nodes"]]
    assert len(ids) == len(set(ids))
    assert {ADA, BEN, CY, DEE} <= set(ids)
