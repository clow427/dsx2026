import json

import pytest

from pipelines.common.graph import GraphBuilder, write_graph
from pipelines.common.ids import make_edge_id, make_node_id, parse_node_id
from pipelines.common.sources import source_ref


def ref(record_id="W1", url="https://example.org/W1"):
    return source_ref("openalex", url, record_id=record_id)


def test_make_node_id_keeps_local_casing():
    assert make_node_id("publication", "openalex", "W123") == "publication:openalex:W123"


@pytest.mark.parametrize(
    "args",
    [
        ("paper", "openalex", "W1"),
        ("person", "OpenAlex", "A1"),
        ("person", "openalex", "A 1"),
        # Regression for the bug PBT property C2 found: `$` in re.match() accepted a trailing newline.
        ("person", "openalex", "A1\n"),
        ("person", "openalex\n", "A1"),
    ],
)
def test_make_node_id_rejects_invalid_parts(args):
    with pytest.raises(ValueError):
        make_node_id(*args)


def test_parse_node_id_rejects_trailing_newline():
    with pytest.raises(ValueError):
        parse_node_id("person:openalex:A1\n")


def test_parse_node_id_round_trip():
    assert parse_node_id("organization:ror:05qwgg493") == ("organization", "ror", "05qwgg493")


def test_symmetric_edge_ids_are_sorted():
    a, b = "person:openalex:A2", "person:openalex:A1"
    assert make_edge_id("COAUTHORED_WITH", a, b) == make_edge_id("COAUTHORED_WITH", b, a)
    assert make_edge_id("COAUTHORED_WITH", a, b) == "edge:coauthored_with:person:openalex:A1|person:openalex:A2"


def test_directed_edge_ids_keep_order():
    edge_id = make_edge_id("AUTHORED", "person:openalex:A1", "publication:openalex:W1")
    assert edge_id == "edge:authored:person:openalex:A1|publication:openalex:W1"


def test_source_ref_omits_missing_fields_and_rejects_bad_input():
    assert source_ref("openalex", "https://example.org/x") == {"source": "openalex", "url": "https://example.org/x"}
    with pytest.raises(ValueError):
        source_ref("linkedin_scrape", "https://example.org/x")
    with pytest.raises(ValueError):
        source_ref("openalex", "not a url")


def test_builder_merges_sources_and_evidence():
    g = GraphBuilder()
    g.add_node("person:openalex:A1", "person", "A", [ref("A1")], bu_affiliation={"status": "unverified", "evidence": []})
    g.add_node("person:openalex:A1", "person", "A", [ref("A1"), ref("A1", "https://example.org/other")])
    assert len(g.nodes["person:openalex:A1"]["sources"]) == 2

    g.add_edge("COAUTHORED_WITH", "person:openalex:A2", "person:openalex:A1", [ref("W1")], "high", "derived")
    g.add_edge("COAUTHORED_WITH", "person:openalex:A1", "person:openalex:A2", [ref("W2", "https://example.org/W2")], "high", "derived")
    assert len(g.edges) == 1
    (edge,) = g.edges.values()
    assert edge["source"] == "person:openalex:A1"
    assert [e["record_id"] for e in edge["evidence"]] == ["W1", "W2"]


def test_builder_rejects_missing_provenance_and_type_mismatch():
    g = GraphBuilder()
    with pytest.raises(ValueError):
        g.add_node("topic:openalex:T1", "topic", "T", [])
    with pytest.raises(ValueError):
        g.add_node("topic:openalex:T1", "person", "T", [ref()])
    with pytest.raises(ValueError):
        g.add_edge("AUTHORED", "person:openalex:A1", "publication:openalex:W1", [], "high", "source_record")


def test_document_is_sorted_and_deterministic(tmp_path):
    def build(order):
        g = GraphBuilder()
        for tid in order:
            g.add_node(f"topic:openalex:{tid}", "topic", tid, [ref(tid, f"https://example.org/{tid}")])
        return g.to_document("research", generated_at="2026-10-24T00:00:00Z")

    doc_a, doc_b = build(["T2", "T1"]), build(["T1", "T2"])
    assert doc_a == doc_b
    assert [n["id"] for n in doc_a["nodes"]] == ["topic:openalex:T1", "topic:openalex:T2"]

    path = write_graph(tmp_path / "out.json", doc_a)
    assert json.loads(path.read_text()) == doc_a
