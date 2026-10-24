"""Merge algorithm (shared-data-contract design, "Merge algorithm (P2)"; Req 8).

Inputs are real module graphs (``people.json``, ``research.json`` and, once it
exists, ``innovation.json``) plus ``identity_matches.json``. Output is one
contract graph with ``producer: "merge"``.

1. Every input must pass the validator and must not be mock data (Req 8.6).
2. ``merged`` matches build a member -> canonical ID map. Other statuses never
   merge anything.
3. Each merged canonical node keeps its curated label, attributes, and
   ``bu_affiliation.details`` (members never contribute details or photos), and
   takes the union of every record's sources. Its affiliation status is the
   strongest evidence-backed status (verified_alumnus > bu_affiliated_researcher
   > unverified), with the union of evidence, or ``ambiguous`` when the records
   conflict (an ``ambiguous`` record, different ORCIDs, different stated
   details, or a ``CONFLICT:`` signal in the match). Member nodes are removed.
4. Edge endpoints are rewritten through the map and edge IDs rebuilt with the
   shared helpers (symmetric types re-sorted); self-loops created by the
   rewrite are dropped.
5. Nodes and edges are deduplicated by ID, unioning sources/evidence (deduped
   by ``(source, record_id, url)``). A deduped edge keeps the strongest
   confidence.
6. ``candidate`` matches emit ``SAME_AS_CANDIDATE`` edges between the canonical
   person and each member (person <-> person, derivation ``identity_match``),
   with the match's confidence. Evidence is both compared records plus the
   match's signal evidence URLs.
7. Canonical people named by a non-merged match that carries a ``CONFLICT:``
   signal (match.py's Req 4.2 conflict rule) get ``bu_affiliation.status:
   ambiguous``; the signals in identity_matches.json are the evidence for that.
8. Output is sorted by ID and validated by the caller before writing.
"""

from __future__ import annotations

import copy
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Iterable, Mapping
from urllib.parse import urlparse

from pipelines.common.contract import REPO_ROOT
from pipelines.common.graph import GraphBuilder, utc_now_iso
from pipelines.common.ids import edge_endpoints, make_edge_id
from pipelines.common.sources import merge_refs, ref_key
from pipelines.common.validation import _has_mock_marker, validate_graph, validate_identity_matches

MOCK_DIR = REPO_ROOT / "data" / "mock"

AFFILIATION_RANK = {"unverified": 0, "bu_affiliated_researcher": 1, "verified_alumnus": 2}
CONFIDENCE_RANK = {"low": 0, "medium": 1, "high": 2}
CONFLICT_PREFIX = "CONFLICT:"


class MergeError(ValueError):
    """An input the merge step must refuse (invalid, mock, or inconsistent)."""


@dataclass
class MergeStats:
    inputs: list[str] = field(default_factory=list)
    merged_matches: int = 0
    members_merged: int = 0
    candidate_matches: int = 0
    rejected_matches: int = 0
    same_as_candidate_edges: int = 0
    self_loops_dropped: int = 0
    duplicate_nodes: int = 0
    duplicate_edges: int = 0
    ambiguous: list[str] = field(default_factory=list)
    missing_members: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Input checks (step 1, Req 8.6)
# ---------------------------------------------------------------------------


def is_mock_path(path: str | Path) -> bool:
    resolved = Path(path).resolve()
    return resolved == MOCK_DIR or MOCK_DIR in resolved.parents


def check_graph_input(doc: Mapping, label: str) -> None:
    """Refuse mock data and documents that fail the validator."""
    if not isinstance(doc, Mapping):
        raise MergeError(f"{label}: not a graph document")
    if doc.get("producer") == "mock" or _has_mock_marker(dict(doc)):
        raise MergeError(f"{label}: mock data is never merged (producer or notes mark it as MOCK)")
    if doc.get("producer") == "merge":
        raise MergeError(f"{label}: is already a merge output; merge only module files")
    result = validate_graph(doc)
    if not result.ok:
        raise MergeError(f"{label}: fails validation: " + "; ".join(result.errors[:5]))


def check_matches_input(doc: Mapping, label: str) -> None:
    if not isinstance(doc, Mapping):
        raise MergeError(f"{label}: not an identity matches document")
    if "MOCK" in str(doc.get("notes", "")):
        raise MergeError(f"{label}: mock identity matches are never merged")
    result = validate_identity_matches(doc)
    if not result.ok:
        raise MergeError(f"{label}: fails validation: " + "; ".join(result.errors[:5]))


# ---------------------------------------------------------------------------
# Affiliation and node combination (step 3)
# ---------------------------------------------------------------------------


def _details_conflict(nodes: Iterable[Mapping]) -> bool:
    seen: dict[str, object] = {}
    for node in nodes:
        details = (node.get("bu_affiliation") or {}).get("details") or {}
        for key, value in details.items():
            if key in seen and seen[key] != value:
                return True
            seen.setdefault(key, value)
    return False


def records_conflict(nodes: list[Mapping]) -> bool:
    """True when person records that would combine disagree."""
    if any((n.get("bu_affiliation") or {}).get("status") == "ambiguous" for n in nodes):
        return True
    orcids = {(n.get("attributes") or {}).get("orcid") for n in nodes} - {None}
    if len(orcids) > 1:
        return True
    return _details_conflict(nodes)


def combine_affiliation(primary: Mapping, others: list[Mapping], force_ambiguous: bool = False) -> dict:
    """bu_affiliation for a person built from ``primary`` plus ``others``.

    Details come from ``primary`` only; they are never copied from other records.
    """
    nodes = [primary, *others]
    evidence: list[dict] = []
    for n in nodes:
        evidence = merge_refs(evidence, (n.get("bu_affiliation") or {}).get("evidence") or [])

    if force_ambiguous or records_conflict(nodes):
        status = "ambiguous"
    else:
        status = "unverified"
        for n in nodes:
            aff = n.get("bu_affiliation") or {}
            s = aff.get("status")
            if s in AFFILIATION_RANK and s != "unverified" and aff.get("evidence"):
                if AFFILIATION_RANK[s] > AFFILIATION_RANK[status]:
                    status = s

    out: dict = {"status": status, "evidence": evidence}
    details = (primary.get("bu_affiliation") or {}).get("details")
    if details:
        out["details"] = copy.deepcopy(details)
    return out


def _union_sources(nodes: Iterable[Mapping]) -> list[dict]:
    sources: list[dict] = []
    for n in nodes:
        sources = merge_refs(sources, n.get("sources") or [])
    return sources


def _dedupe_node(existing: dict, new: Mapping) -> None:
    """Fold a node with the same ID into ``existing`` (first-seen values win)."""
    existing["sources"] = merge_refs(existing["sources"], new.get("sources") or [])
    if new.get("attributes"):
        attrs = existing.setdefault("attributes", {})
        for key, value in new["attributes"].items():
            attrs.setdefault(key, copy.deepcopy(value))
    if "bu_affiliation" in existing or "bu_affiliation" in new:
        existing["bu_affiliation"] = combine_affiliation(existing, [new])


# ---------------------------------------------------------------------------
# SAME_AS_CANDIDATE evidence (step 6)
# ---------------------------------------------------------------------------


def _all_refs(node: Mapping) -> list[dict]:
    return list(node.get("sources") or []) + list((node.get("bu_affiliation") or {}).get("evidence") or [])


def _signal_refs(match: Mapping, known: list[dict]) -> list[dict]:
    """Turn the match's signal evidence URLs into sourceRefs.

    A URL already cited by one of the compared records reuses that record's ref
    (so its source type is the one the producer stated). An openalex.org URL is
    an OpenAlex record. Any other URL is left out rather than guessing its source
    type; both compared records are always cited as evidence anyway.
    """
    by_url: dict[str, dict] = {}
    for ref in known:
        by_url.setdefault(ref["url"], ref)
    out: list[dict] = []
    for signal in match.get("signals", []):
        for url in signal.get("evidence_urls", []) or []:
            if url in by_url:
                ref = {k: v for k, v in by_url[url].items() if k != "note"}
            elif urlparse(url).netloc.endswith("openalex.org"):
                ref = {"source": "openalex", "record_id": url.rstrip("/").rsplit("/", 1)[-1], "url": url}
            else:
                continue
            out = merge_refs(out, [ref])
    return out


def _has_conflict_signal(match: Mapping) -> bool:
    return any(str(s.get("detail", "")).startswith(CONFLICT_PREFIX) for s in match.get("signals", []))


# ---------------------------------------------------------------------------
# Merge
# ---------------------------------------------------------------------------


def _latest_generated_at(docs: Iterable[Mapping]) -> str:
    stamps = []
    for doc in docs:
        value = doc.get("generated_at")
        try:
            stamps.append((datetime.fromisoformat(str(value).replace("Z", "+00:00")), value))
        except ValueError:
            continue
    return max(stamps)[1] if stamps else utc_now_iso()


def merge_graphs(
    module_docs: list[tuple[str, Mapping]],
    matches_doc: Mapping,
    generated_at: str | None = None,
) -> tuple[dict, MergeStats]:
    """Merge validated module graphs with identity matches.

    ``module_docs`` is a list of ``(label, document)``; put ``people.json`` first
    so curated canonical nodes are the first-seen version of each person.
    ``generated_at`` defaults to the latest input ``generated_at`` so the same
    inputs always produce byte-identical output.
    """
    stats = MergeStats(inputs=[label for label, _ in module_docs])
    for label, doc in module_docs:
        check_graph_input(doc, label)
    check_matches_input(matches_doc, "identity_matches")

    # Collect nodes, deduplicating identical IDs across modules (step 5).
    nodes: dict[str, dict] = {}
    for _, doc in module_docs:
        for node in doc["nodes"]:
            if node["id"] in nodes:
                stats.duplicate_nodes += 1
                _dedupe_node(nodes[node["id"]], node)
            else:
                nodes[node["id"]] = copy.deepcopy(node)

    matches = list(matches_doc.get("matches", []))

    # Step 2: member -> canonical map, merged matches only.
    id_map: dict[str, str] = {}
    for m in matches:
        if m["status"] != "merged":
            continue
        cid = m["canonical_id"]
        if cid not in nodes:
            raise MergeError(f"merged match {cid}: canonical person is not in any module file (people.json)")
        for mid in m["member_ids"]:
            if mid == cid:
                continue
            if mid in id_map and id_map[mid] != cid:
                raise MergeError(f"{mid} is merged into both {id_map[mid]} and {cid}")
            id_map[mid] = cid
    for cid in set(id_map.values()):
        if cid in id_map:
            raise MergeError(f"{cid} is a canonical person and also merged into {id_map[cid]}")

    # Step 3: build each merged canonical node, then drop its members.
    for m in matches:
        if m["status"] != "merged":
            continue
        stats.merged_matches += 1
        cid = m["canonical_id"]
        canonical = nodes[cid]
        members = []
        for mid in m["member_ids"]:
            if mid == cid:
                continue
            if mid not in nodes:
                stats.missing_members.append(mid)
                continue
            if nodes[mid]["type"] != "person":
                raise MergeError(f"merged match {cid}: member {mid} is not a person node")
            members.append(nodes[mid])
        canonical["sources"] = _union_sources([canonical, *members])
        canonical["bu_affiliation"] = combine_affiliation(canonical, members, _has_conflict_signal(m))
        if canonical["bu_affiliation"]["status"] == "ambiguous":
            stats.ambiguous.append(cid)
        for member in members:
            del nodes[member["id"]]
            stats.members_merged += 1

    # Step 7: conflicts recorded on non-merged matches make the person ambiguous.
    for m in matches:
        if m["status"] == "merged" or not _has_conflict_signal(m):
            continue
        node = nodes.get(m["canonical_id"])
        if node is None:
            continue
        aff = node.setdefault("bu_affiliation", {"status": "ambiguous", "evidence": []})
        aff["status"] = "ambiguous"
        stats.ambiguous.append(m["canonical_id"])

    # Step 4/5: rewrite, drop self-loops, dedupe edges.
    edges: dict[str, dict] = {}
    for _, doc in module_docs:
        for edge in doc["edges"]:
            src = id_map.get(edge["source"], edge["source"])
            tgt = id_map.get(edge["target"], edge["target"])
            if src == tgt:
                stats.self_loops_dropped += 1
                continue
            src, tgt = edge_endpoints(edge["type"], src, tgt)
            edge_id = make_edge_id(edge["type"], src, tgt)
            if edge_id in edges:
                stats.duplicate_edges += 1
                existing = edges[edge_id]
                existing["evidence"] = merge_refs(existing["evidence"], edge["evidence"])
                if CONFIDENCE_RANK[edge["confidence"]] > CONFIDENCE_RANK[existing["confidence"]]:
                    existing["confidence"] = edge["confidence"]
                continue
            new = copy.deepcopy(edge)
            new.update(id=edge_id, source=src, target=tgt)
            edges[edge_id] = new

    # Step 6: SAME_AS_CANDIDATE edges for candidate matches.
    for m in matches:
        if m["status"] == "rejected":
            stats.rejected_matches += 1
            continue
        if m["status"] != "candidate":
            continue
        stats.candidate_matches += 1
        cid = id_map.get(m["canonical_id"], m["canonical_id"])
        canonical = nodes.get(cid)
        if canonical is None:
            continue
        for raw_mid in m["member_ids"]:
            mid = id_map.get(raw_mid, raw_mid)
            member = nodes.get(mid)
            if member is None or mid == cid:
                if member is None:
                    stats.missing_members.append(raw_mid)
                continue
            known = _all_refs(canonical) + _all_refs(member)
            evidence = merge_refs(
                merge_refs([], canonical["sources"] + member["sources"]), _signal_refs(m, known)
            )
            src, tgt = edge_endpoints("SAME_AS_CANDIDATE", cid, mid)
            edge_id = make_edge_id("SAME_AS_CANDIDATE", src, tgt)
            kinds = ", ".join(dict.fromkeys(s["signal"] for s in m["signals"]))
            note = f"Identity candidate ({m['status']}/{m['confidence']}), not merged. Signals: {kinds}."
            if _has_conflict_signal(m):
                note += " Records carry conflicting evidence."
            if edge_id in edges:
                edges[edge_id]["evidence"] = merge_refs(edges[edge_id]["evidence"], evidence)
                continue
            edges[edge_id] = {
                "id": edge_id,
                "type": "SAME_AS_CANDIDATE",
                "source": src,
                "target": tgt,
                "evidence": evidence,
                "confidence": m["confidence"],
                "derivation": "identity_match",
                "note": note,
            }
            stats.same_as_candidate_edges += 1

    # Any edge whose endpoint vanished would be a bug upstream: refuse rather than drop.
    for edge in edges.values():
        for ref in (edge["source"], edge["target"]):
            if ref not in nodes:
                raise MergeError(f"edge {edge['id']} references missing node {ref}")

    stats.ambiguous = sorted(set(stats.ambiguous))
    stats.missing_members = sorted(set(stats.missing_members))

    builder = GraphBuilder()
    builder.nodes = nodes
    builder.edges = edges
    stamp = generated_at or _latest_generated_at([d for _, d in module_docs] + [matches_doc])
    doc = builder.to_document("merge", generated_at=stamp, notes=summary_notes(stats))
    return doc, stats


def summary_notes(stats: MergeStats) -> str:
    parts = [
        f"Merged graph built from {', '.join(stats.inputs)} and identity_matches.json.",
        f"{stats.merged_matches} merged match(es) collapsed {stats.members_merged} source record(s) into canonical people;",
        f"{stats.candidate_matches} candidate match(es) emitted {stats.same_as_candidate_edges} SAME_AS_CANDIDATE edge(s);",
        f"{stats.rejected_matches} rejected match(es) left separate.",
        f"{stats.self_loops_dropped} self-loop(s) dropped, {stats.duplicate_nodes} duplicate node(s) and "
        f"{stats.duplicate_edges} duplicate edge(s) combined.",
    ]
    if stats.ambiguous:
        parts.append(f"Ambiguous affiliation (conflicting evidence): {', '.join(stats.ambiguous)}.")
    return " ".join(parts)
