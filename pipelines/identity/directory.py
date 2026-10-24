"""Curated person directory builder (identity-resolution task 2, Req 1.1, 1.4, 4.1, 7).

Turns the hand-authored ``data/curation/people.yaml`` into canonical person
nodes (``person:canonical:<slug>``) and emits a schema-valid graph document at
``data/modules/people.json`` with ``producer: identity``.

Design constraints this module enforces (see .kiro/steering/data-integrity.md and
schema/graph.schema.json):

  - Never invent facts. A BU degree, department, or graduation year lands in a
    node's ``bu_affiliation.details`` ONLY WHEN the curation entry states it. A
    field the curation entry omits is omitted here too; nothing is guessed.
  - Canonical IDs are ``person:canonical:<slug>`` where ``slug`` is ``[a-z0-9-]+``.
  - Every fact carries its public evidence URL. ``bu.evidence`` becomes the
    node's ``bu_affiliation.evidence``; curated profiles and a ``manual_curation``
    provenance ref become the node's ``sources``.
  - A curation ``photo`` is copied to ``attributes.photo`` only when url, source,
    license, attribution, and evidence are all present (and source is a
    permitted photo source); otherwise the photo is omitted (Requirement 7).

It reuses the shared helpers rather than reinventing them: ``make_node_id`` for
the canonical ID, ``source_ref``/``merge_refs`` for provenance, and
``GraphBuilder`` + ``write_graph`` for the deterministic, sorted graph writer.

Run via the directory step entry point:
    python -m pipelines.identity.run
"""

from __future__ import annotations

from pathlib import Path

import yaml

from pipelines.common.contract import REPO_ROOT
from pipelines.common.graph import GraphBuilder
from pipelines.common.ids import make_node_id
from pipelines.common.sources import is_http_url, merge_refs, source_ref

CURATION_PATH = REPO_ROOT / "data" / "curation" / "people.yaml"
OUTPUT_PATH = REPO_ROOT / "data" / "modules" / "people.json"

# bu.* fact fields that may appear in a node's bu_affiliation.details, in the
# order the schema lists them. Only the ones a curation entry states are copied;
# graduation_year is coerced to int to satisfy the schema.
DETAIL_FIELDS = ("degree", "department", "graduation_year")

# Photo block (Requirement 7): every field is required, or the photo is omitted.
PHOTO_FIELDS = ("url", "source", "license", "attribution", "evidence")
PHOTO_SOURCES = frozenset({"user_submitted", "wikimedia_commons", "institutional_permission"})


def _profile_refs(entry: dict) -> list[dict]:
    """sourceRefs for the node's `sources`: curated profiles + a provenance ref.

    Every node gets a ``manual_curation``/``user_submitted`` provenance ref
    pointing at its strongest evidence URL, so a node always has at least one
    source even when it has no separate profile. Profile URLs (LinkedIn, BU
    faculty profile, etc.) are added as their own refs.
    """
    refs: list[dict] = []
    for profile in entry.get("profiles") or []:
        url = profile.get("url")
        source = profile.get("source")
        if not url or not source:
            continue
        refs.append(source_ref(source=source, url=url, note=profile.get("note")))
    return refs


def _evidence_refs(evidence: list[dict] | None) -> list[dict]:
    """sourceRefs for bu_affiliation.evidence, built from bu.evidence entries."""
    refs: list[dict] = []
    for ev in evidence or []:
        url = ev.get("url")
        source = ev.get("source")
        if not url or not source:
            continue
        refs.append(source_ref(source=source, url=url, note=ev.get("note")))
    return refs


def _provenance_ref(entry: dict, evidence_refs: list[dict], profile_refs: list[dict]) -> dict:
    """A manual-curation provenance ref so every node carries >=1 source.

    Uses ``submitted_by`` (manual_curation | user_submitted) as the source and
    reuses the entry's strongest evidence URL (bu evidence first, else a profile)
    so the provenance points at a real public page.
    """
    submitted_by = entry.get("submitted_by") or "manual_curation"
    url = None
    if evidence_refs:
        url = evidence_refs[0]["url"]
    elif profile_refs:
        url = profile_refs[0]["url"]
    if url is None:
        raise ValueError(f"curation entry {entry.get('slug')!r} has no evidence or profile URL")
    return source_ref(source=submitted_by, url=url, note="Curated person directory entry")


def _details(bu: dict) -> dict:
    """bu_affiliation.details with only the fields the curation entry states."""
    details: dict = {}
    for field in DETAIL_FIELDS:
        if field not in bu or bu[field] is None:
            continue
        value = bu[field]
        if field == "graduation_year":
            value = int(value)
        details[field] = value
    return details


def _bu_affiliation(entry: dict) -> dict:
    """Build the node's bu_affiliation block from the entry's `bu` section."""
    bu = entry.get("bu") or {}
    status = bu.get("status")
    if not status:
        raise ValueError(f"curation entry {entry.get('slug')!r} has no bu.status")
    affiliation: dict = {
        "status": status,
        "evidence": _evidence_refs(bu.get("evidence")),
    }
    details = _details(bu)
    if details:
        affiliation["details"] = details
    return affiliation


def _photo(entry: dict) -> dict | None:
    """Return a copy of the entry's photo block, or None if it must be omitted.

    Requirement 7: a photo is kept only when every required field
    (url, source, license, attribution, evidence) is present and non-empty,
    ``source`` is one of the permitted photo sources, and ``url``/``evidence``
    are http(s) URLs. Anything less and the photo is dropped entirely; it is
    never partially copied.
    """
    photo = entry.get("photo")
    if not isinstance(photo, dict):
        return None
    for field in PHOTO_FIELDS:
        value = photo.get(field)
        if not isinstance(value, str) or not value.strip():
            return None
    if photo["source"] not in PHOTO_SOURCES:
        return None
    if not is_http_url(photo["url"]) or not is_http_url(photo["evidence"]):
        return None
    return {field: photo[field] for field in PHOTO_FIELDS}


def _attributes(entry: dict) -> dict:
    """Node attributes. ORCID is stored in bare form (schema/convention)."""
    attributes: dict = {}
    orcid = entry.get("orcid")
    if orcid:
        attributes["orcid"] = str(orcid)
    photo = _photo(entry)
    if photo is not None:
        attributes["photo"] = photo
    return attributes


def build_graph(entries: list[dict]) -> GraphBuilder:
    """Turn curation entries into canonical person nodes on a GraphBuilder.

    Each entry becomes one ``person:canonical:<slug>`` node. The directory step
    emits nodes only; matching (task 4) and the merge (task 7) add edges later.
    """
    graph = GraphBuilder()
    for entry in entries:
        slug = entry.get("slug")
        if not slug:
            raise ValueError(f"curation entry missing slug: {entry!r}")
        name = entry.get("name")
        if not name:
            raise ValueError(f"curation entry {slug!r} missing name")

        node_id = make_node_id("person", "canonical", slug)

        bu = entry.get("bu") or {}
        evidence_refs = _evidence_refs(bu.get("evidence"))
        profile_refs = _profile_refs(entry)
        provenance = _provenance_ref(entry, evidence_refs, profile_refs)
        sources = merge_refs([provenance], profile_refs)

        graph.add_node(
            node_id=node_id,
            node_type="person",
            label=name,
            sources=sources,
            attributes=_attributes(entry),
            bu_affiliation=_bu_affiliation(entry),
        )
    return graph


def load_entries(path: str | Path = CURATION_PATH) -> list[dict]:
    """Load the curation file. Returns the list of person entries."""
    data = yaml.safe_load(Path(path).read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise ValueError(f"{path}: expected a list of person entries, got {type(data).__name__}")
    return data


def build_document(
    entries: list[dict],
    generated_at: str | None = None,
    notes: str | None = None,
) -> dict:
    """Build the full `producer: identity` graph document from curation entries."""
    graph = build_graph(entries)
    if notes is None:
        notes = (
            f"Canonical person directory built from data/curation/people.yaml "
            f"({len(entries)} hand-curated, evidence-backed people). BU degree, "
            f"department, and graduation year are recorded only where a cited "
            f"public source states them."
        )
    return graph.to_document("identity", generated_at=generated_at, notes=notes)
