"""End-to-end matching over research.json + the mock innovation batch (task 6.2).

Asserts the planted ORCID merge resolves to merged/high, the planted non-match
never matches, the mock-inclusive run writes outside data/modules/, and the
default source list picks up a real data/modules/innovation.json (never the
mock) so swapping in P3's batch needs no code change.

Run: python -m pytest tests/identity/test_mock_matching.py -v
"""
from __future__ import annotations

import json
import shutil

import pytest

from pipelines.common.contract import REPO_ROOT
from pipelines.common.validation import validate_identity_matches
from pipelines.identity import run as identity_run

MODULES_DIR = REPO_ROOT / "data" / "modules"
RESEARCH_PATH = MODULES_DIR / "research.json"
MOCK_PATH = REPO_ROOT / "data" / "mock" / "innovation.mock.json"
REAL_MATCHES_PATH = MODULES_DIR / "identity_matches.json"

PLANTED_MERGE_ID = "person:patentsview:mock-inv-0001"
PLANTED_NON_MATCH_ID = "person:patentsview:mock-inv-0002"
PLANTED_CANONICAL_ID = "person:canonical:howard-cabral-biostatistics"
HOWARD_RESEARCH_ID = "person:openalex:A5045667842"


def _run(tmp_path, sources, name="matches.json"):
    out = tmp_path / name
    argv = ["--output", str(tmp_path / "people.json"), "--matches-output", str(out)]
    for s in sources:
        argv += ["--source", str(s)]
    assert identity_run.main(argv) == 0
    return json.loads(out.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def mock_run(tmp_path_factory):
    return _run(tmp_path_factory.mktemp("mockrun"), [RESEARCH_PATH, MOCK_PATH])


def _by_canonical(doc):
    return {m["canonical_id"]: m for m in doc["matches"]}


def test_mock_run_is_schema_valid(mock_run):
    result = validate_identity_matches(mock_run)
    assert result.ok, result.errors


def test_planted_merge_is_merged_high_with_research_record(mock_run):
    m = _by_canonical(mock_run)[PLANTED_CANONICAL_ID]
    assert (m["status"], m["confidence"]) == ("merged", "high")
    # Both records carry the same ORCID, so they share one merged/high entry.
    assert set(m["member_ids"]) == {HOWARD_RESEARCH_ID, PLANTED_MERGE_ID}
    assert any(s["signal"] == "orcid" and PLANTED_MERGE_ID in s["detail"] for s in m["signals"])


def test_planted_non_match_never_matches(mock_run):
    text = json.dumps(mock_run)
    assert PLANTED_NON_MATCH_ID not in text
    for m in mock_run["matches"]:
        assert PLANTED_NON_MATCH_ID not in m["member_ids"]


def test_mock_only_adds_the_planted_member(tmp_path, mock_run):
    """Research-only and research+mock runs differ only by the planted member."""
    real = _by_canonical(_run(tmp_path, [RESEARCH_PATH]))
    mock = _by_canonical(mock_run)
    assert set(real) == set(mock)
    for cid, m in mock.items():
        expected = set(real[cid]["member_ids"]) | ({PLANTED_MERGE_ID} if cid == PLANTED_CANONICAL_ID else set())
        assert set(m["member_ids"]) == expected, cid
        assert (m["status"], m["confidence"]) == (real[cid]["status"], real[cid]["confidence"]), cid


def test_default_sources_are_real_modules_only():
    defaults = identity_run.default_source_paths()
    assert RESEARCH_PATH in defaults
    assert all(MODULES_DIR.resolve() in p.resolve().parents for p in defaults)
    assert not any("mock" in p.name for p in defaults)


def test_default_sources_pick_up_real_innovation_when_present(tmp_path):
    modules = tmp_path / "modules"
    modules.mkdir()
    assert identity_run.default_source_paths(modules) == [modules / "research.json"]
    (modules / "innovation.json").write_text("{}", encoding="utf-8")
    assert identity_run.default_source_paths(modules) == [
        modules / "research.json",
        modules / "innovation.json",
    ]


def test_swapping_in_innovation_needs_no_code_change(tmp_path, monkeypatch):
    """A file at modules/innovation.json is matched by default, with no --source flags."""
    modules = tmp_path / "modules"
    modules.mkdir()
    shutil.copy(RESEARCH_PATH, modules / "research.json")
    shutil.copy(MOCK_PATH, modules / "innovation.json")  # stand-in for P3's real file, tmp only
    monkeypatch.setattr(identity_run, "DEFAULT_MODULES_DIR", modules)
    doc = _run(tmp_path, [])  # no --source flags: defaults only
    m = _by_canonical(doc)[PLANTED_CANONICAL_ID]
    assert PLANTED_MERGE_ID in m["member_ids"]


def test_real_matches_output_has_no_mock_records():
    text = REAL_MATCHES_PATH.read_text(encoding="utf-8")
    assert "patentsview:mock-" not in text
    assert "example.org" not in text
