"""Smoke tests for scripts/inspect_graph.py using the fictional mock graph."""

import pytest

from pipelines.common.contract import REPO_ROOT
from scripts.inspect_graph import main

MOCK = str(REPO_ROOT / "data" / "mock" / "graph.sample.json")


def run(capsys, *args):
    code = main(["--file", MOCK, *args])
    return code, capsys.readouterr()


def test_summary(capsys):
    code, out = run(capsys, "summary")
    assert code == 0
    assert "producer=mock" in out.out and "people by BU status" in out.out


def test_examples_cover_every_view(capsys):
    code, out = run(capsys, "examples")
    assert code == 0
    for header in ("=== Summary", "=== Person:", "=== Publication:", "=== Edge:", "=== Topic:"):
        assert header in out.out


def test_person_view_shows_affiliation_evidence(capsys):
    code, out = run(capsys, "person", "example researcher a")
    assert code == 0
    assert "BU affiliation: verified_alumnus" in out.out
    assert "https://example.edu/people/researcher-a" in out.out


def test_paper_and_topic_views(capsys):
    assert run(capsys, "paper", "clinical triage")[0] == 0
    code, out = run(capsys, "topic", "topic:openalex:T00001")
    assert code == 0 and "publications with this topic" in out.out


def test_edge_view_lists_evidence(capsys):
    edge_id = "edge:coauthored_with:person:canonical:example-researcher-a|person:openalex:A0000000002"
    code, out = run(capsys, "edge", edge_id)
    assert code == 0 and "evidence (1)" in out.out


@pytest.mark.parametrize("args", [("person", "nobody-by-this-name"), ("edge", "edge:none")])
def test_missing_records_exit_nonzero(capsys, args):
    assert run(capsys, *args)[0] == 1
