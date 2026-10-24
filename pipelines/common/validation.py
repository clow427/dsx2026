"""Graph and identity-match validation (shared-data-contract task 4).

Used by scripts/validate_graph.py and by pipelines that validate before emitting.
Kept compatible with Python 3.10 and jsonschema 3.2+ so the Kiro hook works with
a system interpreter as well as the project venv.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path

from .contract import (
    CANONICAL_PRODUCERS,
    EDGE_ENDPOINTS,
    GRAPH_SCHEMA_PATH,
    IDENTITY_SCHEMA_PATH,
    SYMMETRIC_EDGE_TYPES,
)
from .sources import is_http_url


@dataclass
class ValidationResult:
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.errors


_schema_cache: dict[Path, dict] = {}


def _load_schema(path: Path) -> dict:
    if path not in _schema_cache:
        with path.open(encoding="utf-8") as fh:
            _schema_cache[path] = json.load(fh)
    return _schema_cache[path]


def _schema_errors(doc: object, schema_path: Path) -> list[str]:
    import jsonschema

    schema = _load_schema(schema_path)
    validator = jsonschema.Draft7Validator(schema, format_checker=jsonschema.FormatChecker())
    messages = []
    for err in sorted(validator.iter_errors(doc), key=lambda e: list(map(str, e.absolute_path))):
        location = "/".join(str(p) for p in err.absolute_path) or "<root>"
        messages.append(f"schema: {location}: {err.message}")
    return messages


def _is_datetime(value: object) -> bool:
    if not isinstance(value, str):
        return False
    try:
        datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return False
    return True


def _is_date(value: object) -> bool:
    if not isinstance(value, str):
        return False
    try:
        date.fromisoformat(value)
    except ValueError:
        return False
    return True


def _check_refs(refs: object, where: str, result: ValidationResult) -> None:
    """URL and date checks that jsonschema only enforces with optional format libraries."""
    if not isinstance(refs, list):
        return
    for i, ref in enumerate(refs):
        if not isinstance(ref, dict):
            continue
        if not is_http_url(ref.get("url")):
            result.errors.append(f"{where}[{i}]: url must be an http(s) URL, got {ref.get('url')!r}")
        if "retrieved_at" in ref and not _is_date(ref["retrieved_at"]):
            result.errors.append(f"{where}[{i}]: retrieved_at must be YYYY-MM-DD, got {ref['retrieved_at']!r}")


def _has_mock_marker(doc: dict) -> bool:
    if "MOCK" in str(doc.get("notes", "")):
        return True
    for item in list(doc.get("nodes", [])) + list(doc.get("edges", [])):
        if not isinstance(item, dict):
            continue
        if "MOCK" in str(item.get("note", "")):
            return True
        for ref in list(item.get("sources", [])) + list(item.get("evidence", [])):
            if isinstance(ref, dict) and "MOCK" in str(ref.get("note", "")):
                return True
    return False


def validate_graph(doc: object) -> ValidationResult:
    """Validate a graph document against the schema and the contract's semantic rules."""
    result = ValidationResult()
    result.errors.extend(_schema_errors(doc, GRAPH_SCHEMA_PATH))
    if not isinstance(doc, dict):
        return result

    producer = doc.get("producer")
    if "generated_at" in doc and not _is_datetime(doc["generated_at"]):
        result.errors.append(f"generated_at is not an ISO date-time: {doc['generated_at']!r}")

    nodes = [n for n in doc.get("nodes", []) if isinstance(n, dict)]
    edges = [e for e in doc.get("edges", []) if isinstance(e, dict)]

    # Nodes: uniqueness, prefix/type match, canonical namespace, provenance URLs.
    node_types: dict[str, str] = {}
    for node in nodes:
        node_id = node.get("id")
        if not isinstance(node_id, str):
            continue
        if node_id in node_types:
            result.errors.append(f"duplicate node id: {node_id}")
            continue
        node_types[node_id] = node.get("type")

        prefix = node_id.split(":", 1)[0]
        if prefix != node.get("type"):
            result.errors.append(f"node {node_id}: id prefix {prefix!r} does not match type {node.get('type')!r}")

        if node_id.startswith("person:canonical:") and producer not in CANONICAL_PRODUCERS:
            result.errors.append(
                f"node {node_id}: person:canonical:* IDs may only be produced by identity or merge "
                f"(or mock), not {producer!r}"
            )

        _check_refs(node.get("sources"), f"node {node_id} sources", result)

        aff = node.get("bu_affiliation")
        if isinstance(aff, dict):
            evidence = aff.get("evidence") or []
            _check_refs(evidence, f"node {node_id} bu_affiliation.evidence", result)
            if aff.get("status") == "verified_alumnus" and evidence and all(
                isinstance(r, dict) and r.get("source") == "openalex" for r in evidence
            ):
                result.warnings.append(
                    f"node {node_id}: verified_alumnus is backed only by openalex evidence "
                    "(publishing at BU does not make someone an alumnus)"
                )

    # Edges: uniqueness, references, endpoint types, ID convention, provenance URLs.
    edge_ids: set[str] = set()
    connected: set[str] = set()
    for edge in edges:
        edge_id = edge.get("id")
        edge_type = edge.get("type")
        source = edge.get("source")
        target = edge.get("target")
        if not isinstance(edge_id, str):
            continue
        if edge_id in edge_ids:
            result.errors.append(f"duplicate edge id: {edge_id}")
            continue
        edge_ids.add(edge_id)

        missing = [ref for ref in (source, target) if ref not in node_types]
        for ref in missing:
            result.errors.append(f"edge {edge_id}: references missing node {ref}")
        connected.update(ref for ref in (source, target) if ref in node_types)

        if edge_type in EDGE_ENDPOINTS and not missing:
            allowed_src, allowed_tgt = EDGE_ENDPOINTS[edge_type]
            src_type, tgt_type = node_types[source], node_types[target]
            ok = src_type in allowed_src and tgt_type in allowed_tgt
            if not ok:
                result.errors.append(
                    f"edge {edge_id}: {edge_type} does not allow {src_type} -> {tgt_type}"
                )

        if isinstance(edge_type, str) and isinstance(source, str) and isinstance(target, str):
            expected = f"edge:{edge_type.lower()}:{source}|{target}"
            if edge_type in SYMMETRIC_EDGE_TYPES and target < source:
                result.warnings.append(f"edge {edge_id}: symmetric edge endpoints are not sorted")
            elif edge_id != expected:
                result.warnings.append(f"edge {edge_id}: id does not follow convention {expected}")

        _check_refs(edge.get("evidence"), f"edge {edge_id} evidence", result)

    for node_id in node_types:
        if node_id not in connected:
            result.warnings.append(f"orphan node (no edges): {node_id}")

    if producer != "mock" and _has_mock_marker(doc):
        result.warnings.append(f"file contains a MOCK note but producer is {producer!r}")

    return result


def validate_identity_matches(doc: object) -> ValidationResult:
    """Validate an identity_matches.json document."""
    result = ValidationResult()
    result.errors.extend(_schema_errors(doc, IDENTITY_SCHEMA_PATH))
    if not isinstance(doc, dict):
        return result

    seen: set[str] = set()
    for match in doc.get("matches", []):
        if not isinstance(match, dict):
            continue
        canonical_id = match.get("canonical_id")
        if match.get("status") == "merged" and match.get("confidence") == "low":
            result.errors.append(f"match {canonical_id}: a merged match cannot have low confidence")
        if canonical_id in seen:
            result.errors.append(f"duplicate canonical_id: {canonical_id}")
        seen.add(canonical_id)
    return result


def load_json(path: str | Path) -> object:
    with Path(path).open(encoding="utf-8") as fh:
        return json.load(fh)
