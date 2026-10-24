"""Tests for the mock innovation.json stand-in (identity-resolution task 6.1).

The mock lives at data/mock/innovation.mock.json. It must be schema-valid,
labeled as mock, use only fictional names and example.* URLs (the single
deliberate exception is the curated ORCID used as the planted merge key), and
never appear in, or be mixed into, any real module output under data/modules/.

Run: python -m pytest tests/identity/test_mock_innovation.py -v
"""
from __future__ import annotations

import json
from pathlib import Path
from urllib.parse import urlparse

import pytest

from pipelines.common.contract import REPO_ROOT
from pipelines.common.validation import validate_graph
from pipelines.identity.match import normalize_orcid

MOCK_PATH = REPO_ROOT / "data" / "mock" / "innovation.mock.json"
MODULES_DIR = REPO_ROOT / "data" / "modules"
PEOPLE_PATH = MODULES_DIR / "people.json"

PLANTED_MERGE_ID = "person:patentsview:mock-inv-0001"
PLANTED_NON_MATCH_ID = "person:patentsview:mock-inv-0002"
PLANTED_CANONICAL_ID = "person:canonical:howard-cabral-biostatistics"
EXAMPLE_DOMAINS = ("example.org", "example.com", "example.edu")


def _load(path: Path) -> dict:
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


@pytest.fixture(scope="module")
def mock_doc() -> dict:
    return _load(MOCK_PATH)


def _module_outputs() -> list[Path]:
    return sorted(MODULES_DIR.glob("*.json"))


def _persons(doc: dict) -> dict[str, dict]:
    return {n["id"]: n for n in doc["nodes"] if n["type"] == "person"}


def _all_urls(doc: dict) -> list[str]:
    urls = []
    for item in doc["nodes"] + doc["edges"]:
        refs = list(item.get("sources", [])) + list(item.get("evidence", []))
        refs += list((item.get("bu_affiliation") or {}).get("evidence", []))
        urls += [r["url"] for r in refs]
    return urls


def test_mock_is_schema_valid(mock_doc):
    result = validate_graph(mock_doc)
    assert result.ok, result.errors
    assert not result.warnings, result.warnings


def test_mock_is_labeled_and_outside_modules(mock_doc):
    assert mock_doc["producer"] == "mock"
    assert "MOCK" in mock_doc["notes"]
    assert "mock" in MOCK_PATH.name
    assert MODULES_DIR.resolve() not in MOCK_PATH.resolve().parents
    for node in mock_doc["nodes"]:
        assert all("MOCK" in s.get("note", "") for s in node["sources"]), node["id"]


def test_mock_uses_only_example_urls(mock_doc):
    urls = _all_urls(mock_doc)
    assert urls
    for url in urls:
        host = urlparse(url).hostname or ""
        assert host.endswith(EXAMPLE_DOMAINS), url


def test_mock_has_planted_merge_and_non_match(mock_doc):
    persons = _persons(mock_doc)
    assert set(persons) == {PLANTED_MERGE_ID, PLANTED_NON_MATCH_ID}

    curated = _persons(_load(PEOPLE_PATH))
    curated_orcids = {normalize_orcid(p["attributes"].get("orcid")) for p in curated.values()}
    curated_labels = {p["label"].casefold() for p in curated.values()}

    # Planted merge: carries exactly one curated person's ORCID, under a fictional name.
    merge = persons[PLANTED_MERGE_ID]
    merge_orcid = normalize_orcid(merge["attributes"]["orcid"])
    assert merge_orcid == normalize_orcid(curated[PLANTED_CANONICAL_ID]["attributes"]["orcid"])
    assert merge["label"].casefold() not in curated_labels
    assert merge["label"].startswith("Example ")

    # Planted non-match: fictional name and an ORCID no curated person carries.
    other = persons[PLANTED_NON_MATCH_ID]
    assert normalize_orcid(other["attributes"]["orcid"]) not in curated_orcids
    assert other["label"].casefold() not in curated_labels
    assert other["label"].startswith("Example ")


@pytest.mark.parametrize("module_path", _module_outputs(), ids=lambda p: p.name)
def test_mock_records_never_appear_in_module_outputs(mock_doc, module_path):
    text = module_path.read_text(encoding="utf-8")
    module_doc = json.loads(text)
    assert module_doc.get("producer") != "mock"

    mock_ids = {n["id"] for n in mock_doc["nodes"]} | {e["id"] for e in mock_doc["edges"]}
    # Substring check also catches IDs referenced in edges, matches, or members.
    leaked = sorted(i for i in mock_ids if i in text)
    assert not leaked, f"mock records found in {module_path.name}: {leaked}"

    # The fictional non-match ORCID and mock source URLs must not leak either.
    assert normalize_orcid(_persons(mock_doc)[PLANTED_NON_MATCH_ID]["attributes"]["orcid"]) not in text
    leaked_urls = sorted(u for u in set(_all_urls(mock_doc)) if u in text)
    assert not leaked_urls, f"mock URLs found in {module_path.name}: {leaked_urls}"
