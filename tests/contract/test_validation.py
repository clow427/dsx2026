import copy
import json

import pytest

from pipelines.common.contract import REPO_ROOT
from pipelines.common.validation import validate_graph, validate_identity_matches
from scripts.validate_graph import main as validator_main

MOCK_PATH = REPO_ROOT / "data" / "mock" / "graph.sample.json"


@pytest.fixture
def graph():
    """A minimal valid graph. MOCK: fictional records on example.org."""
    work = {"source": "openalex", "record_id": "W1", "url": "https://example.org/works/W1", "note": "MOCK"}
    return {
        "schema_version": "0.1.0",
        "generated_at": "2026-10-24T00:00:00Z",
        "producer": "mock",
        "nodes": [
            {
                "id": "person:openalex:A1",
                "type": "person",
                "label": "Example Person One",
                "sources": [work],
                "bu_affiliation": {"status": "bu_affiliated_researcher", "evidence": [work]},
            },
            {
                "id": "person:openalex:A2",
                "type": "person",
                "label": "Example Person Two",
                "sources": [work],
                "bu_affiliation": {"status": "unverified", "evidence": []},
            },
            {"id": "publication:openalex:W1", "type": "publication", "label": "Example Paper", "sources": [work]},
        ],
        "edges": [
            {
                "id": "edge:authored:person:openalex:A1|publication:openalex:W1",
                "type": "AUTHORED",
                "source": "person:openalex:A1",
                "target": "publication:openalex:W1",
                "evidence": [work],
                "confidence": "high",
                "derivation": "source_record",
            },
            {
                "id": "edge:coauthored_with:person:openalex:A1|person:openalex:A2",
                "type": "COAUTHORED_WITH",
                "source": "person:openalex:A1",
                "target": "person:openalex:A2",
                "evidence": [work],
                "confidence": "high",
                "derivation": "derived",
            },
        ],
    }


def test_minimal_graph_is_valid(graph):
    result = validate_graph(graph)
    assert result.errors == []


def test_mock_sample_passes():
    with MOCK_PATH.open() as fh:
        result = validate_graph(json.load(fh))
    assert result.errors == []


def test_duplicate_node_id_fails(graph):
    graph["nodes"].append(copy.deepcopy(graph["nodes"][2]))
    assert any("duplicate node id" in e for e in validate_graph(graph).errors)


def test_dangling_edge_fails(graph):
    graph["edges"][0]["target"] = "publication:openalex:W999"
    assert any("references missing node" in e for e in validate_graph(graph).errors)


def test_missing_evidence_fails(graph):
    graph["edges"][0]["evidence"] = []
    assert not validate_graph(graph).ok


def test_missing_source_url_fails(graph):
    del graph["nodes"][2]["sources"][0]["url"]
    assert not validate_graph(graph).ok


def test_non_http_url_fails(graph):
    graph["nodes"][2]["sources"] = [{"source": "openalex", "url": "not-a-url"}]
    assert any("http(s) URL" in e for e in validate_graph(graph).errors)


def test_bu_affiliated_without_evidence_fails(graph):
    graph["nodes"][0]["bu_affiliation"]["evidence"] = []
    assert not validate_graph(graph).ok


def test_verified_alumnus_without_evidence_fails(graph):
    graph["nodes"][1]["bu_affiliation"] = {"status": "verified_alumnus", "evidence": []}
    assert not validate_graph(graph).ok


def test_verified_alumnus_from_openalex_only_warns(graph):
    graph["nodes"][0]["bu_affiliation"]["status"] = "verified_alumnus"
    result = validate_graph(graph)
    assert result.ok
    assert any("verified_alumnus" in w for w in result.warnings)


def test_bu_affiliation_on_non_person_fails(graph):
    graph["nodes"][2]["bu_affiliation"] = {"status": "unverified", "evidence": []}
    assert not validate_graph(graph).ok


def test_prefix_type_mismatch_fails(graph):
    graph["nodes"][2]["type"] = "patent"
    assert any("does not match type" in e for e in validate_graph(graph).errors)


def test_wrong_edge_endpoints_fail(graph):
    graph["edges"][0]["source"], graph["edges"][0]["target"] = graph["edges"][0]["target"], graph["edges"][0]["source"]
    assert any("does not allow" in e for e in validate_graph(graph).errors)


def test_canonical_id_from_module_fails(graph):
    graph["producer"] = "research"
    graph["nodes"][1]["id"] = "person:canonical:example-person-two"
    graph["edges"][1]["target"] = "person:canonical:example-person-two"
    graph["edges"][1]["id"] = "edge:coauthored_with:person:canonical:example-person-two|person:openalex:A1"
    assert any("person:canonical" in e for e in validate_graph(graph).errors)


def test_mock_marker_in_real_output_warns(graph):
    graph["producer"] = "research"
    assert any("MOCK" in w for w in validate_graph(graph).warnings)


def test_orphan_node_warns(graph):
    graph["nodes"].append(
        {"id": "topic:openalex:T1", "type": "topic", "label": "Example Topic", "sources": graph["nodes"][2]["sources"]}
    )
    assert any("orphan" in w for w in validate_graph(graph).warnings)


def _match(status, confidence):
    return {
        "canonical_id": "person:canonical:example-person",
        "status": status,
        "confidence": confidence,
        "member_ids": ["person:openalex:A1", "person:openalex:A2"],
        "signals": [{"signal": "name_variant", "detail": "MOCK: similar names"}],
    }


def test_merged_low_confidence_match_fails():
    doc = {"schema_version": "0.1.0", "generated_at": "2026-10-24T00:00:00Z", "matches": [_match("merged", "low")]}
    assert not validate_identity_matches(doc).ok


def test_ambiguous_candidate_match_passes():
    doc = {"schema_version": "0.1.0", "generated_at": "2026-10-24T00:00:00Z", "matches": [_match("candidate", "low")]}
    assert validate_identity_matches(doc).ok


def test_cli_exit_codes(graph, tmp_path, capsys):
    good = tmp_path / "good.json"
    good.write_text(json.dumps(graph))
    assert validator_main([str(good)]) == 0

    graph["edges"][0]["target"] = "publication:openalex:W999"
    bad = tmp_path / "bad.json"
    bad.write_text(json.dumps(graph))
    assert validator_main([str(good), str(bad)]) == 1
    assert "FAIL" in capsys.readouterr().out
