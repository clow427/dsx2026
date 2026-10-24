"""Constants mirrored from schema/graph.schema.json and the shared-data-contract design.

Keep these in sync with the schema. The schema remains the source of truth for
structure; this module carries the semantic rules JSON Schema cannot express.
"""

from __future__ import annotations

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
GRAPH_SCHEMA_PATH = REPO_ROOT / "schema" / "graph.schema.json"
IDENTITY_SCHEMA_PATH = REPO_ROOT / "schema" / "identity_matches.schema.json"

SCHEMA_VERSION = "0.1.0"

NODE_TYPES = frozenset({"person", "publication", "patent", "award", "organization", "topic"})

PRODUCERS = frozenset({"research", "identity", "innovation", "merge", "mock"})

SOURCES = frozenset(
    {
        "openalex",
        "semantic_scholar",
        "patentsview",
        "nih_reporter",
        "nsf_awards",
        "bu_repository",
        "institutional_bio",
        "professional_profile",
        "user_submitted",
        "manual_curation",
    }
)

# Edge type -> (allowed source node types, allowed target node types).
# From the edge type table in .kiro/specs/shared-data-contract/design.md.
EDGE_ENDPOINTS: dict[str, tuple[frozenset[str], frozenset[str]]] = {
    "AUTHORED": (frozenset({"person"}), frozenset({"publication"})),
    "COAUTHORED_WITH": (frozenset({"person"}), frozenset({"person"})),
    "INVENTED": (frozenset({"person"}), frozenset({"patent"})),
    "ASSIGNED_TO": (frozenset({"patent"}), frozenset({"organization"})),
    "RECEIVED_AWARD": (frozenset({"person"}), frozenset({"award"})),
    "FUNDED_BY": (frozenset({"publication", "award"}), frozenset({"award", "organization"})),
    "AFFILIATED_WITH": (frozenset({"person"}), frozenset({"organization"})),
    "HAS_TOPIC": (frozenset({"publication", "patent", "award", "person"}), frozenset({"topic"})),
    "SAME_AS_CANDIDATE": (frozenset({"person"}), frozenset({"person"})),
}

EDGE_TYPES = frozenset(EDGE_ENDPOINTS)

# Undirected edge types: endpoints are sorted so each pair appears once.
SYMMETRIC_EDGE_TYPES = frozenset({"COAUTHORED_WITH", "SAME_AS_CANDIDATE"})

# Only these producers may mint person:canonical:* IDs. `mock` is allowed because
# the mock file simulates a merged graph and must pass the validator (Req 9.2).
CANONICAL_PRODUCERS = frozenset({"identity", "merge", "mock"})
