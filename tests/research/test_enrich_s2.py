import pytest
import requests

from pipelines.research.config import ResearchConfig
from pipelines.research.enrich_s2 import enrich_with_s2
from pipelines.research.normalize import normalize_works

from .conftest import FakeClient


@pytest.fixture
def graph(works):
    g, _ = normalize_works(works, retrieved_at="2026-10-24", bu_institution_id="I111088046")
    return g


@pytest.fixture
def config(tmp_path):
    return ResearchConfig(cache_dir=tmp_path)


PUB = "publication:openalex:W9000000001"


def snapshot(g):
    return g.to_document("research", generated_at="2026-10-24T00:00:00Z")


def test_doi_match_adds_source_and_citation_count(graph, config):
    before_edges = dict(graph.edges)
    before_nodes = set(graph.nodes)
    s2 = [{"paperId": "abc123", "url": "https://www.semanticscholar.org/paper/abc123", "citationCount": 50,
           "externalIds": {"DOI": "10.0000/EXAMPLE.0001"}}]
    client = FakeClient([s2])
    stats = enrich_with_s2(graph, config, client=client, api_key="KEY")

    assert stats.matched == 1 and not stats.failed
    assert client.calls[0][2]["json"] == {"ids": ["DOI:10.0000/example.0001"]}
    assert client.calls[0][2]["headers"] == {"x-api-key": "KEY"}
    node = graph.nodes[PUB]
    assert {"source": "semantic_scholar", "record_id": "abc123", "url": "https://www.semanticscholar.org/paper/abc123",
            "retrieved_at": node["sources"][-1]["retrieved_at"], "note": "Matched by DOI"} in node["sources"]
    assert node["attributes"]["s2_citation_count"] == 50
    assert node["attributes"]["citation_count"] == 42  # OpenAlex value untouched
    # Req 4.2: no new nodes or edges.
    assert set(graph.nodes) == before_nodes and graph.edges == before_edges


def test_doi_mismatch_or_missing_is_ignored(graph, config):
    before = snapshot(graph)
    s2 = [{"paperId": "zzz", "citationCount": 1, "externalIds": {"DOI": "10.0000/other"}}]
    assert enrich_with_s2(graph, config, client=FakeClient([s2])).matched == 0
    assert snapshot(graph) == before

    assert enrich_with_s2(graph, config, client=FakeClient([[None]]), refresh=True).matched == 0
    assert snapshot(graph) == before


@pytest.mark.parametrize("failure", [requests.ConnectionError("down"), requests.HTTPError("429"), [1, 2, 3]])
def test_failures_leave_graph_unchanged(graph, config, failure):
    before = snapshot(graph)
    stats = enrich_with_s2(graph, config, client=FakeClient([failure]))
    assert stats.failed
    assert snapshot(graph) == before


def test_response_is_cached(graph, config):
    s2 = [{"paperId": "abc123", "citationCount": 5, "externalIds": {"DOI": "10.0000/example.0001"}}]
    enrich_with_s2(graph, config, client=FakeClient([s2]))
    stats = enrich_with_s2(graph, config, client=FakeClient([]))
    assert stats.from_cache and stats.matched == 1


def test_one_failed_batch_does_not_discard_the_others(config, monkeypatch):
    from pipelines.common.graph import GraphBuilder
    from pipelines.common.sources import source_ref
    from pipelines.research import enrich_s2

    monkeypatch.setattr(enrich_s2, "BATCH_SIZE", 1)
    g = GraphBuilder()
    for wid, doi in (("W1", "10.0000/example.a"), ("W2", "10.0000/example.b")):
        g.add_node(f"publication:openalex:{wid}", "publication", f"Example {wid}",
                   [source_ref("openalex", f"https://example.org/{wid}", record_id=wid)], attributes={"doi": doi})

    ok = [{"paperId": "p1", "citationCount": 1, "externalIds": {"DOI": "10.0000/example.a"}}]
    stats = enrich_with_s2(g, config, client=FakeClient([ok, requests.HTTPError("429")]))
    assert (stats.batches, stats.failed_batches, stats.matched) == (2, 1, 1)
    assert not stats.failed

    # A rerun reuses the cached batch and only requests the missing one.
    retry = FakeClient([[{"paperId": "p2", "citationCount": 2, "externalIds": {"DOI": "10.0000/example.b"}}]])
    stats = enrich_with_s2(g, config, client=retry)
    assert (stats.cached_batches, stats.matched, len(retry.calls)) == (1, 2, 1)
