"""In-memory graph builder and deterministic graph file writer (shared-data-contract task 3.2)."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from .contract import PRODUCERS, SCHEMA_VERSION
from .ids import edge_endpoints, make_edge_id, parse_node_id
from .sources import merge_refs


def _ref_sort_key(ref: dict) -> tuple:
    return (ref.get("source", ""), ref.get("record_id", ""), ref.get("url", ""))


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


class GraphBuilder:
    """Accumulates nodes and edges, deduplicating by ID and merging provenance.

    - Adding a node twice unions its `sources`. Existing attributes are kept;
      new attribute keys are added (first value wins on conflict).
    - Adding an edge twice unions its `evidence`. That is how derived edges such
      as COAUTHORED_WITH accumulate every supporting record.
    """

    def __init__(self) -> None:
        self.nodes: dict[str, dict] = {}
        self.edges: dict[str, dict] = {}

    def add_node(
        self,
        node_id: str,
        node_type: str,
        label: str,
        sources: list[dict],
        attributes: dict | None = None,
        bu_affiliation: dict | None = None,
    ) -> dict:
        parsed_type, _, _ = parse_node_id(node_id)
        if parsed_type != node_type:
            raise ValueError(f"node id {node_id!r} does not match type {node_type!r}")
        if not sources:
            raise ValueError(f"node {node_id!r} needs at least one source")

        node = self.nodes.get(node_id)
        if node is None:
            node = {"id": node_id, "type": node_type, "label": label, "sources": list(sources)}
            if bu_affiliation is not None:
                node["bu_affiliation"] = bu_affiliation
            if attributes:
                node["attributes"] = dict(attributes)
            self.nodes[node_id] = node
            return node

        node["sources"] = merge_refs(node["sources"], sources)
        if attributes:
            merged = node.setdefault("attributes", {})
            for key, value in attributes.items():
                merged.setdefault(key, value)
        return node

    def add_edge(
        self,
        edge_type: str,
        source: str,
        target: str,
        evidence: list[dict],
        confidence: str,
        derivation: str,
        note: str | None = None,
    ) -> dict:
        if not evidence:
            raise ValueError(f"{edge_type} edge {source} -> {target} needs evidence")
        source, target = edge_endpoints(edge_type, source, target)
        edge_id = make_edge_id(edge_type, source, target)

        edge = self.edges.get(edge_id)
        if edge is None:
            edge = {
                "id": edge_id,
                "type": edge_type,
                "source": source,
                "target": target,
                "evidence": list(evidence),
                "confidence": confidence,
                "derivation": derivation,
            }
            if note:
                edge["note"] = note
            self.edges[edge_id] = edge
            return edge

        edge["evidence"] = merge_refs(edge["evidence"], evidence)
        return edge

    def to_document(self, producer: str, generated_at: str | None = None, notes: str | None = None) -> dict:
        """Return a contract envelope with nodes, edges, and refs sorted for stable diffs."""
        if producer not in PRODUCERS:
            raise ValueError(f"unknown producer: {producer!r}")

        def sorted_node(node: dict) -> dict:
            node = dict(node)
            node["sources"] = sorted(node["sources"], key=_ref_sort_key)
            if "bu_affiliation" in node:
                aff = dict(node["bu_affiliation"])
                aff["evidence"] = sorted(aff["evidence"], key=_ref_sort_key)
                node["bu_affiliation"] = aff
            return node

        def sorted_edge(edge: dict) -> dict:
            edge = dict(edge)
            edge["evidence"] = sorted(edge["evidence"], key=_ref_sort_key)
            return edge

        doc: dict = {
            "schema_version": SCHEMA_VERSION,
            "generated_at": generated_at or utc_now_iso(),
            "producer": producer,
        }
        if notes:
            doc["notes"] = notes
        doc["nodes"] = [sorted_node(self.nodes[k]) for k in sorted(self.nodes)]
        doc["edges"] = [sorted_edge(self.edges[k]) for k in sorted(self.edges)]
        return doc


def write_graph(path: str | Path, doc: dict) -> Path:
    """Write a graph document as pretty-printed JSON with a trailing newline."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as fh:
        json.dump(doc, fh, indent=2, ensure_ascii=False)
        fh.write("\n")
    return path
