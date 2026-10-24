"""Node and edge ID builders (shared-data-contract task 3.1)."""

from __future__ import annotations

import re

from .contract import EDGE_TYPES, NODE_TYPES, SYMMETRIC_EDGE_TYPES

# Always use these with `.fullmatch()`. In Python, `$` also matches just before a
# trailing newline, so `.match()` would accept "A1\n" (found by property-based
# test C2 in tests/contract/test_contract_properties.py).
NAMESPACE_RE = re.compile(r"[a-z0-9_]+")
LOCAL_ID_RE = re.compile(r"[A-Za-z0-9._-]+")
NODE_ID_RE = re.compile(r"(person|publication|patent|award|organization|topic):[a-z0-9_]+:[A-Za-z0-9._-]+")


def make_node_id(node_type: str, namespace: str, local_id: str) -> str:
    """Build `<type>:<namespace>:<local_id>`, keeping the source's original casing.

    Raises ValueError rather than silently rewriting an ID that doesn't fit the
    contract, because a rewritten ID would no longer match its source record.
    """
    if node_type not in NODE_TYPES:
        raise ValueError(f"unknown node type: {node_type!r}")
    if not NAMESPACE_RE.fullmatch(namespace):
        raise ValueError(f"invalid namespace: {namespace!r}")
    if not LOCAL_ID_RE.fullmatch(local_id):
        raise ValueError(f"invalid local_id: {local_id!r}")
    return f"{node_type}:{namespace}:{local_id}"


def parse_node_id(node_id: str) -> tuple[str, str, str]:
    """Split a node ID into (type, namespace, local_id)."""
    if not NODE_ID_RE.fullmatch(node_id):
        raise ValueError(f"invalid node id: {node_id!r}")
    node_type, namespace, local_id = node_id.split(":", 2)
    return node_type, namespace, local_id


def edge_endpoints(edge_type: str, source: str, target: str) -> tuple[str, str]:
    """Return (source, target), sorted lexically for symmetric edge types."""
    if edge_type in SYMMETRIC_EDGE_TYPES and target < source:
        return target, source
    return source, target


def make_edge_id(edge_type: str, source: str, target: str) -> str:
    """Build `edge:<type_lowercase>:<source_id>|<target_id>`."""
    if edge_type not in EDGE_TYPES:
        raise ValueError(f"unknown edge type: {edge_type!r}")
    source, target = edge_endpoints(edge_type, source, target)
    return f"edge:{edge_type.lower()}:{source}|{target}"
