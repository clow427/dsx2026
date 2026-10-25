"""Tests for the merge step (shared-data-contract task 6, identity-resolution task 7).

Fixture graphs use fictional people and example.org URLs. The last section runs
the merge on the real data/modules/ files (written to a temp path).

Run: python -m pytest tests/merge -v
"""

from __future__ import annotations

import copy
import json

import pytest
import yaml

from pipelines.common.contract import REPO_ROOT
from pipelines.common.validation import validate_graph
from pipelines.merge import run as merge_run
from pipelines.merge.merge import MergeError, merge_graphs
from scripts import validate_graph as validate_cli

GEN = "2026-01-01T00:00:00Z"
ADA = "person:canonical:ada-example"
BEN = "person:canonical:ben-sample"
CY = "person:canonical:cy-test"
A1, A2, B1, C1 = (f"person:openalex:{x}" for x in ("A1", "A2", "B1", "C1"))
W1, W2 = "publication:openalex:W1", "publication:openalex:W2"
ORG = "organization:ror:00example0"


def ref(source, url, record_id=None, note=None):
    r = {"source": source}
    if record_id:
        r["record_id"] = record_id
    r["url"] = url
    if note:
        r["note"] = note
    return r


def oa(record_id):
    return ref("openalex", f"https://openalex.org/{record_id}", record_id)


def person(pid, label, status, evidence, sources, attributes=None, details=None):
    node = {"id": pid, "type": "person", "label": label, "sources": sources,
            "bu_affiliation": {"status": status, "evidence": evidence}}
    if details:
        node["bu_affiliation"]["details"] = details
    if attributes:
        node["attributes"] = attributes
    return node


def edge(etype, src, tgt, evidence, confidence="high", derivation="source_record"):
    return {"id": f"edge:{etype.lower()}:{src}|{tgt}", "type": etype, "source": src, "target": tgt,
            "evidence": evidence, "confidence": confidence, "derivation": derivation}


def graph(producer, nodes, edges, notes=None):
    doc = {"schema_version": "0.1.0", "generated_at": GEN, "producer": producer, "nodes": nodes, "edges": edges}
    if notes:
        doc["notes"] = notes
    return doc


PHOTO = {"url": "https://example.org/ada.jpg", "source": "wikimedia_commons", "license": "CC-BY-4.0",
         "attribution": "Example Author", "evidence": "https://example.org/wiki/File:Ada.jpg"}
BIO = ref("institutional_bio", "https://example.edu/faculty/ada")


def people_doc():
    return graph("identity", [
        person(ADA, "Ada Example", "verified_alumnus", [BIO],
               [ref("manual_curation", "https://example.edu/faculty/ada", note="Curated")],
               attributes={"orcid": "0000-0000-0000-0001", "photo": PHOTO}, details={"degree": "PhD"}),
        person(BEN, "Ben Sample", "bu_affiliated_researcher", [ref("institutional_bio", "https://example.edu/ben")],
               [ref("manual_curation", "https://example.edu/ben")]),
        person(CY, "Cy Test", "bu_affiliated_researcher", [ref("institutional_bio", "https://example.edu/cy")],
               [ref("manual_curation", "https://example.edu/cy")]),
    ], [])


def research_doc():
    s2 = ref("semantic_scholar", "https://example.org/s2/paper/W1", "W1")
    return graph("research", [
        person(A1, "Ada Example", "bu_affiliated_researcher", [oa("W1")], [oa("A1")],
               attributes={"orcid": "0000-0000-0000-0001"}),
        person(A2, "A. Example", "unverified", [], [oa("A2")]),
        person(B1, "Ben Sample", "bu_affiliated_researcher", [oa("W2")], [oa("B1")]),
        person(C1, "Cy Tester", "unverified", [], [oa("C1")]),
        {"id": W1, "type": "publication", "label": "Paper one", "sources": [oa("W1")]},
        {"id": W2, "type": "publication", "label": "Paper two", "sources": [oa("W2")]},
        {"id": ORG, "type": "organization", "label": "Example University", "sources": [oa("I1")]},
    ], [
        edge("AUTHORED", A1, W1, [oa("W1")]),
        edge("AUTHORED", A2, W1, [oa("W1"), s2], confidence="medium"),
        edge("COAUTHORED_WITH", A1, A2, [oa("W1")], derivation="derived"),
        edge("COAUTHORED_WITH", A1, B1, [oa("W2")], derivation="derived"),
        edge("AUTHORED", B1, W2, [oa("W2")]),
        edge("AUTHORED", C1, W2, [oa("W2")]),
        edge("AFFILIATED_WITH", A1, ORG, [oa("W1")]),
    ])


def innovation_doc():
    patent = "patent:uspto:1234567"
    pv = ref("patentsview", "https://example.org/patents/1234567", "1234567")
    return graph("innovation", [
        {"id": patent, "type": "patent", "label": "Example widget", "sources": [pv]},
        {"id": ORG, "type": "organization", "label": "Example University",
         "sources": [ref("patentsview", "https://example.org/assignee/1", "1")], "attributes": {"country": "US"}},
    ], [edge("ASSIGNED_TO", patent, ORG, [pv])])


def match(cid, status, confidence, members, signals=None):
    return {"canonical_id": cid, "status": status, "confidence": confidence, "member_ids": members,
            "signals": signals or [{"signal": "exact_name", "detail": "names equal"}]}


def matches_doc(extra=None):
    ms = [
        match(ADA, "merged", "high", [A1, A2], [
            {"signal": "orcid", "detail": "same ORCID", "evidence_urls": ["https://orcid.org/0000-0000-0000-0001"]},
        ]),
        match(BEN, "candidate", "medium", [B1], [
            {"signal": "exact_name", "detail": "names equal"},
            {"signal": "shared_affiliation", "detail": "both at BU",
             "evidence_urls": ["https://openalex.org/W9", "https://example.edu/ben", "https://example.org/unknown"]},
        ]),
        match(CY, "rejected", "high", [C1]),
    ] + (extra or [])
    return {"schema_version": "0.1.0", "generated_at": GEN, "matches": sorted(ms, key=lambda m: m["canonical_id"])}


def modules(innovation=True):
    docs = [("people.json", people_doc()), ("research.json", research_doc())]
    if innovation:
        docs.append(("innovation.json", innovation_doc()))
    return docs


@pytest.fixture
def merged():
    doc, stats = merge_graphs(modules(), matches_doc())
    return doc, stats


def nodes_by_id(doc):
    return {n["id"]: n for n in doc["nodes"]}


def edges_by_id(doc):
    return {e["id"]: e for e in doc["edges"]}


# --- 6.1 ID rewriting and source union --------------------------------------


def test_merged_members_collapse_into_canonical_with_source_union(merged):
    doc, stats = merged
    nodes = nodes_by_id(doc)
    assert A1 not in nodes and A2 not in nodes
    ada = nodes[ADA]
    urls = {s["url"] for s in ada["sources"]}
    assert urls == {"https://example.edu/faculty/ada", "https://openalex.org/A1", "https://openalex.org/A2"}
    assert stats.members_merged == 2
    assert doc["producer"] == "merge"
    assert validate_graph(doc).ok


def test_canonical_keeps_curated_details_and_attributes(merged):
    ada = nodes_by_id(merged[0])[ADA]
    assert ada["label"] == "Ada Example"
    assert ada["attributes"] == {"orcid": "0000-0000-0000-0001", "photo": PHOTO}
    aff = ada["bu_affiliation"]
    assert aff["status"] == "verified_alumnus"
    assert aff["details"] == {"degree": "PhD"}
    assert {r["url"] for r in aff["evidence"]} == {BIO["url"], "https://openalex.org/W1"}


def test_strongest_evidenced_status_wins():
    people = people_doc()
    ada = people["nodes"][0]
    ada["bu_affiliation"] = {"status": "unverified", "evidence": []}
    del ada["attributes"]
    doc, _ = merge_graphs([("people.json", people), ("research.json", research_doc())], matches_doc())
    aff = nodes_by_id(doc)[ADA]["bu_affiliation"]
    assert aff["status"] == "bu_affiliated_researcher"
    assert "details" not in aff  # never copied from members


def test_edges_rewritten_and_ids_rebuilt(merged):
    edges = edges_by_id(merged[0])
    assert f"edge:authored:{ADA}|{W1}" in edges
    assert f"edge:affiliated_with:{ADA}|{ORG}" in edges
    # Symmetric edge re-sorted after the rewrite: canonical < openalex lexically.
    co = edges[f"edge:coauthored_with:{ADA}|{B1}"]
    assert (co["source"], co["target"]) == (ADA, B1)
    for e in merged[0]["edges"]:
        assert A1 not in (e["source"], e["target"]) and A2 not in (e["source"], e["target"])


def test_self_loops_from_rewrite_are_dropped(merged):
    doc, stats = merged
    assert stats.self_loops_dropped == 1
    assert all(e["source"] != e["target"] for e in doc["edges"])


# --- 6.3 dedup ------------------------------------------------------------------


def test_duplicate_edges_merge_evidence_and_keep_strongest_confidence(merged):
    doc, stats = merged
    e = edges_by_id(doc)[f"edge:authored:{ADA}|{W1}"]
    assert [(r["source"], r["url"]) for r in e["evidence"]] == [
        ("openalex", "https://openalex.org/W1"),
        ("semantic_scholar", "https://example.org/s2/paper/W1"),
    ]
    assert e["confidence"] == "high"
    assert stats.duplicate_edges == 1


def test_duplicate_nodes_across_modules_combine_sources(merged):
    doc, stats = merged
    org = nodes_by_id(doc)[ORG]
    assert {r["source"] for r in org["sources"]} == {"openalex", "patentsview"}
    assert org["attributes"] == {"country": "US"}
    assert stats.duplicate_nodes == 1
    assert len(doc["nodes"]) == len(nodes_by_id(doc))


# --- 6.2 candidates and rejected ------------------------------------------------


def test_candidate_emits_same_as_candidate_edge(merged):
    doc, stats = merged
    nodes = nodes_by_id(doc)
    assert BEN in nodes and B1 in nodes  # kept separate
    e = edges_by_id(doc)[f"edge:same_as_candidate:{BEN}|{B1}"]
    assert e["type"] == "SAME_AS_CANDIDATE"
    assert e["confidence"] == "medium"
    assert e["derivation"] == "identity_match"
    urls = {r["url"] for r in e["evidence"]}
    # Both compared records plus classifiable signal evidence URLs.
    assert {"https://example.edu/ben", "https://openalex.org/B1", "https://openalex.org/W9"} <= urls
    assert "https://example.org/unknown" not in urls
    assert stats.same_as_candidate_edges == 1


def test_low_confidence_candidate_edge_carries_low_confidence():
    ms = matches_doc()
    for m in ms["matches"]:
        if m["canonical_id"] == BEN:
            m["confidence"] = "low"
    doc, _ = merge_graphs(modules(), ms)
    assert edges_by_id(doc)[f"edge:same_as_candidate:{BEN}|{B1}"]["confidence"] == "low"


def test_rejected_match_does_not_merge(merged):
    doc, _ = merged
    nodes = nodes_by_id(doc)
    assert CY in nodes and C1 in nodes
    assert not any(e["type"] == "SAME_AS_CANDIDATE" and C1 in (e["source"], e["target"]) for e in doc["edges"])
    assert f"edge:authored:{C1}|{W2}" in edges_by_id(doc)


# --- ambiguity -------------------------------------------------------------------


def test_conflicting_member_evidence_is_ambiguous():
    research = research_doc()
    research["nodes"][1]["attributes"] = {"orcid": "0000-0000-0000-0009"}  # A2 differs from A1
    doc, stats = merge_graphs([("people.json", people_doc()), ("research.json", research)], matches_doc())
    aff = nodes_by_id(doc)[ADA]["bu_affiliation"]
    assert aff["status"] == "ambiguous"
    assert stats.ambiguous == [ADA]
    assert validate_graph(doc).ok


def test_conflict_signal_on_unmerged_match_makes_canonical_ambiguous():
    ms = matches_doc()
    for m in ms["matches"]:
        if m["canonical_id"] == BEN:
            m["confidence"] = "low"
            m["signals"].append({"signal": "orcid", "detail": "CONFLICT: records carry different ORCIDs; not merged"})
    doc, stats = merge_graphs(modules(), ms)
    assert nodes_by_id(doc)[BEN]["bu_affiliation"]["status"] == "ambiguous"
    assert BEN in stats.ambiguous
    assert f"edge:same_as_candidate:{BEN}|{B1}" in edges_by_id(doc)


# --- mock refusal (Req 8.6) -----------------------------------------------------


def test_refuses_mock_producer():
    with pytest.raises(MergeError, match="mock"):
        merge_graphs([("people.json", people_doc()), ("innovation.json", graph("mock", [], []))], matches_doc())


def test_refuses_mock_note():
    doc = innovation_doc()
    doc["notes"] = "MOCK stand-in"
    with pytest.raises(MergeError, match="mock"):
        merge_graphs([("people.json", people_doc()), ("research.json", research_doc()), ("innovation.json", doc)],
                     matches_doc())


def test_refuses_mock_matches():
    ms = matches_doc()
    ms["notes"] = "MOCK matches"
    with pytest.raises(MergeError, match="mock"):
        merge_graphs(modules(), ms)


def test_cli_refuses_data_mock_paths(tmp_path):
    out = tmp_path / "graph.json"
    mock_matches = REPO_ROOT / "data" / "mock" / "identity_matches.mock.json"
    assert merge_run.run_merge(REPO_ROOT / "data" / "mock", out) == 1
    assert merge_run.run_merge(merge_run.MODULES_DIR, out, matches_path=mock_matches) == 1
    assert not out.exists()


def test_refuses_invalid_input():
    bad = research_doc()
    bad["edges"].append(edge("AUTHORED", A1, "publication:openalex:MISSING", [oa("W1")]))
    with pytest.raises(MergeError, match="validation"):
        merge_graphs([("people.json", people_doc()), ("research.json", bad)], matches_doc())


# --- determinism ----------------------------------------------------------------


def _write_fixture_dir(path, docs, ms):
    path.mkdir()
    for name, doc in docs:
        (path / name).write_text(json.dumps(doc), encoding="utf-8")
    (path / "identity_matches.json").write_text(json.dumps(ms), encoding="utf-8")
    return path


def test_same_input_gives_byte_identical_output(tmp_path):
    mods = _write_fixture_dir(tmp_path / "mods", modules(), matches_doc())
    out1, out2 = tmp_path / "g1.json", tmp_path / "g2.json"
    assert merge_run.run_merge(mods, out1) == 0
    assert merge_run.run_merge(mods, out2) == 0
    assert out1.read_bytes() == out2.read_bytes()
    doc = json.loads(out1.read_text())
    assert doc["generated_at"] == GEN
    assert [n["id"] for n in doc["nodes"]] == sorted(n["id"] for n in doc["nodes"])
    assert [e["id"] for e in doc["edges"]] == sorted(e["id"] for e in doc["edges"])


def test_input_order_does_not_change_output():
    a, _ = merge_graphs(modules(), matches_doc())
    reordered = [(n, copy.deepcopy(d)) for n, d in modules()]
    for _, d in reordered:
        d["nodes"].reverse()
        d["edges"].reverse()
    b, _ = merge_graphs(reordered, matches_doc())
    assert json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True)


def test_innovation_is_optional(tmp_path):
    mods = _write_fixture_dir(tmp_path / "mods", modules(innovation=False), matches_doc())
    assert [p.name for p in merge_run.module_paths(mods)] == ["people.json", "research.json"]
    assert merge_run.run_merge(mods, tmp_path / "g.json") == 0


# --- real data (identity-resolution Req 6.1) --------------------------------------

REAL_MATCHES = merge_run.MODULES_DIR / "identity_matches.json"


@pytest.fixture(scope="module")
def real_graph(tmp_path_factory):
    if not (merge_run.MODULES_DIR / "research.json").exists():
        pytest.skip("real research.json not present")
    out = tmp_path_factory.mktemp("real") / "graph.json"
    assert merge_run.run_merge(output_path=out) == 0
    return out, json.loads(out.read_text(encoding="utf-8"))


def test_real_curated_people_appear_once_and_members_are_gone(real_graph):
    _, doc = real_graph
    people = json.loads((merge_run.MODULES_DIR / "people.json").read_text())
    matches = json.loads(REAL_MATCHES.read_text())["matches"]
    ids = [n["id"] for n in doc["nodes"]]
    canonical_ids = [n["id"] for n in people["nodes"]]
    # Every hand-curated person is present (people.discovered.yaml adds more on top).
    curated = yaml.safe_load((REPO_ROOT / "data" / "curation" / "people.yaml").read_text())
    assert {f"person:canonical:{e['slug']}" for e in curated} <= set(canonical_ids)
    for cid in canonical_ids:
        assert ids.count(cid) == 1
    present = set(ids)
    merged_members = [mid for m in matches if m["status"] == "merged" for mid in m["member_ids"]]
    assert merged_members
    for mid in merged_members:
        assert mid not in present
    endpoints = {e["source"] for e in doc["edges"]} | {e["target"] for e in doc["edges"]}
    assert not endpoints & set(merged_members)
    # Each merged canonical person inherited its member's edges.
    for m in matches:
        if m["status"] == "merged":
            assert m["canonical_id"] in endpoints


def test_real_graph_passes_validator_cli(real_graph, capsys):
    path, doc = real_graph
    assert doc["producer"] == "merge"
    assert "MOCK" not in doc.get("notes", "")
    assert not any(n["id"].startswith("person:patentsview:mock-") for n in doc["nodes"])
    assert validate_cli.main([str(path)]) == 0
