"""Tests for the curated person directory builder (identity-resolution task 2).

Fixture tests prove the builder turns a small, handcrafted ``people.yaml`` into
the expected canonical person nodes:

  - canonical IDs match ``person:canonical:[a-z0-9-]+``
  - a BU degree/department/graduation year appears ONLY when the entry states it
    (the never-invent-facts rule), and graduation_year is an int
  - the emitted ``people.json`` passes the shared contract validator, both via
    ``validate_graph`` and via running ``scripts/validate_graph.py`` on the file

The suite also runs against the committed real curation file so the actual
``data/modules/people.json`` path stays schema-valid.

Run: python -m pytest tests/identity/test_directory.py -v
"""

from __future__ import annotations

import json
import re
import subprocess
import sys

import pytest
import yaml

from pipelines.common.contract import REPO_ROOT
from pipelines.common.validation import load_json, validate_graph
from pipelines.identity import run as identity_run
from pipelines.identity.directory import (
    CURATION_PATH,
    build_document,
    build_graph,
    load_entries,
)

CANONICAL_ID_RE = re.compile(r"^person:canonical:[a-z0-9-]+$")

VALIDATE_SCRIPT = REPO_ROOT / "scripts" / "validate_graph.py"

# A small, self-contained fixture directory. It deliberately mixes:
#   - a verified_alumnus with every detail field stated (full-facts)
#   - a verified_alumnus that states only a degree (degree-only)
#   - a bu_affiliated_researcher that states only a department (no degree)
# so the "only include a fact when the entry states it" rule is exercised.
FIXTURE_PEOPLE = [
    {
        "slug": "jane-doe-bme",
        "name": "Jane Doe",
        "orcid": "0000-0000-0000-0001",
        "bu": {
            "status": "verified_alumnus",
            "degree": "PhD",
            "department": "Biomedical Engineering",
            "graduation_year": 2012,
            "evidence": [
                {"source": "institutional_bio", "url": "https://www.bu.edu/example/jane"},
                {"source": "user_submitted", "url": "https://orcid.org/0000-0000-0000-0001"},
            ],
        },
        "profiles": [
            {
                "source": "professional_profile",
                "url": "https://www.linkedin.com/in/jane-doe-example",
                "note": "user-submitted",
            }
        ],
        "submitted_by": "manual_curation",
    },
    {
        # Degree stated, but no department or graduation year -> those are omitted.
        "slug": "john-smith-stats",
        "name": "John Smith",
        "bu": {
            "status": "verified_alumnus",
            "degree": "MA",
            "evidence": [
                {"source": "institutional_bio", "url": "https://www.bu.edu/example/john"},
            ],
        },
        "submitted_by": "manual_curation",
    },
    {
        # No BU degree stated -> bu_affiliated_researcher, department only.
        "slug": "mary-roe-cs",
        "name": "Mary Roe",
        "orcid": "0000-0000-0000-0002",
        "bu": {
            "status": "bu_affiliated_researcher",
            "department": "Computer Science",
            "evidence": [
                {"source": "user_submitted", "url": "https://orcid.org/0000-0000-0000-0002"},
            ],
        },
        "submitted_by": "user_submitted",
    },
]


@pytest.fixture
def fixture_doc():
    return build_document(FIXTURE_PEOPLE, generated_at="2026-01-01T00:00:00Z")


@pytest.fixture
def nodes_by_slug(fixture_doc):
    return {n["id"].split(":", 2)[2]: n for n in fixture_doc["nodes"]}


# --- Expected nodes from the fixture --------------------------------------

def test_one_node_per_entry_with_canonical_ids(fixture_doc):
    assert fixture_doc["producer"] == "identity"
    ids = [n["id"] for n in fixture_doc["nodes"]]
    assert ids == sorted(ids), "nodes must be written in sorted ID order"
    assert len(ids) == len(FIXTURE_PEOPLE)
    for node_id in ids:
        assert CANONICAL_ID_RE.match(node_id), node_id


def test_nodes_are_person_type_with_required_fields(fixture_doc):
    for node in fixture_doc["nodes"]:
        assert node["type"] == "person"
        assert node["label"]
        assert node["sources"], f"{node['id']} must carry at least one source"
        assert "bu_affiliation" in node, node["id"]


def test_full_facts_entry_records_every_stated_detail(nodes_by_slug):
    node = nodes_by_slug["jane-doe-bme"]
    assert node["label"] == "Jane Doe"
    assert node["attributes"]["orcid"] == "0000-0000-0000-0001"
    aff = node["bu_affiliation"]
    assert aff["status"] == "verified_alumnus"
    assert aff["details"] == {
        "degree": "PhD",
        "department": "Biomedical Engineering",
        "graduation_year": 2012,
    }
    assert isinstance(aff["details"]["graduation_year"], int)
    # The professional profile shows up as a node source.
    assert any(
        s["source"] == "professional_profile" and "linkedin" in s["url"] for s in node["sources"]
    )


def test_degree_only_entry_omits_unstated_fields(nodes_by_slug):
    """Never invent facts: a field the entry does not state is left out."""
    node = nodes_by_slug["john-smith-stats"]
    aff = node["bu_affiliation"]
    assert aff["status"] == "verified_alumnus"
    assert aff["details"] == {"degree": "MA"}
    assert "department" not in aff["details"]
    assert "graduation_year" not in aff["details"]


def test_researcher_without_degree_has_no_degree_detail(nodes_by_slug):
    node = nodes_by_slug["mary-roe-cs"]
    aff = node["bu_affiliation"]
    assert aff["status"] == "bu_affiliated_researcher"
    assert aff["details"] == {"department": "Computer Science"}
    assert "degree" not in aff["details"]


def test_evidence_is_carried_onto_bu_affiliation(nodes_by_slug):
    node = nodes_by_slug["jane-doe-bme"]
    urls = {ref["url"] for ref in node["bu_affiliation"]["evidence"]}
    assert "https://www.bu.edu/example/jane" in urls
    assert "https://orcid.org/0000-0000-0000-0001" in urls


# --- The fixture document passes the contract validator -------------------

def test_fixture_document_passes_validate_graph(fixture_doc):
    result = validate_graph(fixture_doc)
    assert result.errors == [], result.errors
    # Orphan-node warnings are expected: the directory step emits nodes only;
    # edges arrive from matching/merge later.


def test_emitted_file_passes_validate_graph_script(tmp_path):
    """Build from the fixture, write it, and run scripts/validate_graph.py on it."""
    out = tmp_path / "people.json"
    rc = identity_run.run_directory(curation_path=_write_fixture(tmp_path), output_path=out)
    assert rc == 0
    assert out.exists()

    doc = load_json(out)
    assert all(CANONICAL_ID_RE.match(n["id"]) for n in doc["nodes"])

    proc = subprocess.run(
        [sys.executable, str(VALIDATE_SCRIPT), str(out)],
        capture_output=True,
        text=True,
    )
    assert proc.returncode == 0, proc.stdout + proc.stderr


def _write_fixture(tmp_path):
    path = tmp_path / "people.yaml"
    path.write_text(yaml.safe_dump(FIXTURE_PEOPLE, sort_keys=False), encoding="utf-8")
    return path


# --- The real curation file also builds a valid directory ------------------

@pytest.mark.skipif(not CURATION_PATH.exists(), reason="curation file not present")
def test_real_curation_file_builds_valid_directory():
    entries = load_entries()
    doc = build_document(entries)
    assert doc["producer"] == "identity"
    assert doc["nodes"], "the real curation file should yield at least one node"
    for node in doc["nodes"]:
        assert CANONICAL_ID_RE.match(node["id"]), node["id"]
    result = validate_graph(doc)
    assert result.errors == [], result.errors


def test_never_invents_a_detail_not_in_the_entry():
    """A property-ish check: no detail key exists in a node unless the entry states it."""
    graph = build_graph(FIXTURE_PEOPLE)
    doc = graph.to_document("identity", generated_at="2026-01-01T00:00:00Z")
    by_slug = {n["id"].split(":", 2)[2]: n for n in doc["nodes"]}
    for entry in FIXTURE_PEOPLE:
        bu = entry.get("bu") or {}
        details = by_slug[entry["slug"]]["bu_affiliation"].get("details", {})
        for field in ("degree", "department", "graduation_year"):
            if field in bu and bu[field] is not None:
                assert field in details, (entry["slug"], field)
            else:
                assert field not in details, (entry["slug"], field)


# --- Photos (Requirement 7) -------------------------------------------------
# Fictional people and example.org URLs only.

COMPLETE_PHOTO = {
    "url": "https://example.org/photos/ada-example.jpg",
    "source": "wikimedia_commons",
    "license": "CC-BY-SA-4.0",
    "attribution": "Photo by Example Author",
    "evidence": "https://example.org/wiki/File:Ada_Example.jpg",
}


def _photo_entry(slug: str, name: str, photo: dict | None) -> dict:
    entry = {
        "slug": slug,
        "name": name,
        "bu": {
            "status": "bu_affiliated_researcher",
            "evidence": [{"source": "institutional_bio", "url": f"https://example.org/bio/{slug}"}],
        },
        "submitted_by": "manual_curation",
    }
    if photo is not None:
        entry["photo"] = photo
    return entry


PHOTO_PEOPLE = [
    _photo_entry("ada-example", "Ada Example", COMPLETE_PHOTO),
    # Missing `license` -> photo must be omitted.
    _photo_entry(
        "bob-example",
        "Bob Example",
        {k: v for k, v in COMPLETE_PHOTO.items() if k != "license"} | {"url": "https://example.org/photos/bob.jpg"},
    ),
    # Disallowed source -> photo must be omitted.
    _photo_entry("cy-example", "Cy Example", COMPLETE_PHOTO | {"source": "scraped"}),
    # No photo at all -> node still builds and validates.
    _photo_entry("dee-example", "Dee Example", None),
]


@pytest.fixture
def photo_nodes():
    doc = build_document(PHOTO_PEOPLE, generated_at="2026-01-01T00:00:00Z")
    assert validate_graph(doc).errors == []
    return {n["id"].split(":", 2)[2]: n for n in doc["nodes"]}


def test_complete_photo_is_emitted(photo_nodes):
    assert photo_nodes["ada-example"]["attributes"]["photo"] == COMPLETE_PHOTO


def test_incomplete_photo_is_omitted(photo_nodes):
    assert "photo" not in photo_nodes["bob-example"].get("attributes", {})


def test_photo_with_disallowed_source_is_omitted(photo_nodes):
    assert "photo" not in photo_nodes["cy-example"].get("attributes", {})


def test_entry_without_photo_still_validates(photo_nodes, tmp_path):
    assert "photo" not in photo_nodes["dee-example"].get("attributes", {})
    curation = tmp_path / "people.yaml"
    curation.write_text(yaml.safe_dump(PHOTO_PEOPLE, sort_keys=False), encoding="utf-8")
    out = tmp_path / "people.json"
    assert identity_run.run_directory(curation_path=curation, output_path=out) == 0
    proc = subprocess.run([sys.executable, str(VALIDATE_SCRIPT), str(out)], capture_output=True, text=True)
    assert proc.returncode == 0, proc.stdout + proc.stderr
