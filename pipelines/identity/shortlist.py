"""Read-only candidate shortlist extractor (identity-resolution task 1.1, Req 1.1, 3.1).

Reads P1's ``data/modules/research.json`` and surfaces the ``person:openalex:*``
nodes that are the best starting points for hand curation: people OpenAlex marks
as BU-affiliated researchers who also carry an ORCID. ORCID plus a BU affiliation
is the strongest identity signal we can get straight from the source data, so
those people rank highest.

This helper is strictly read-only. It never mutates ``research.json`` and never
writes into ``data/modules/``; it only reads the file and prints a shortlist to
stdout. The curated person directory that the shortlist feeds (task 1.2 onward)
is authored by hand in ``data/curation/``.

Run:
    python -m pipelines.identity.shortlist
    python -m pipelines.identity.shortlist --limit 20 --input path/to/research.json
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from pipelines.common.contract import REPO_ROOT

# Default source: P1's committed research module output.
RESEARCH_PATH = REPO_ROOT / "data" / "modules" / "research.json"

# Default number of candidates to surface. The intent (task 1.1) is to produce
# ~15 so a human can curate down to the 5-10 that go into people.yaml.
DEFAULT_LIMIT = 15

BU_AFFILIATED = "bu_affiliated_researcher"


@dataclass(frozen=True)
class Candidate:
    """A person surfaced from the source graph, with the fields a curator needs.

    ``orcid`` and ``affiliation_status`` mirror the source node when present so a
    curator can trace every shortlisted person straight back to the source record.
    """

    node_id: str
    label: str
    orcid: str | None
    affiliation_status: str | None
    source_url: str | None
    signal_score: int

    @property
    def has_orcid(self) -> bool:
        return bool(self.orcid)

    @property
    def is_bu_affiliated(self) -> bool:
        return self.affiliation_status == BU_AFFILIATED


def _primary_source_url(node: dict) -> str | None:
    """First source URL on the node, preferring the OpenAlex record."""
    sources = node.get("sources") or []
    for ref in sources:
        if ref.get("source") == "openalex" and ref.get("url"):
            return ref["url"]
    for ref in sources:
        if ref.get("url"):
            return ref["url"]
    return None


def _signal_score(has_orcid: bool, is_bu_affiliated: bool) -> int:
    """Rank by signal strength: ORCID *and* BU affiliation ranks highest.

    The task only shortlists BU-affiliated people who carry an ORCID, so in
    practice every shortlisted candidate scores 2. The scoring is kept explicit
    so the ranking stays correct if the filter is ever relaxed.
    """
    return int(has_orcid) + int(is_bu_affiliated)


def _person_nodes(doc: dict) -> Iterable[dict]:
    for node in doc.get("nodes", []):
        if node.get("type") != "person":
            continue
        if not str(node.get("id", "")).startswith("person:openalex:"):
            continue
        yield node


def extract_shortlist(doc: dict, limit: int = DEFAULT_LIMIT) -> list[Candidate]:
    """Return BU-affiliated OpenAlex persons that carry an ORCID, best first.

    A node qualifies when ``type == "person"``, its id is in the
    ``person:openalex:*`` namespace, ``bu_affiliation.status`` is
    ``bu_affiliated_researcher``, and it carries an ``attributes.orcid``. The
    ORCID and affiliation status are copied from the source node when present so
    the caller can verify each candidate against the source record.

    Results are ranked by signal strength (highest first), then by label and id
    for a stable, deterministic order. ``limit`` caps the shortlist length; pass
    ``None`` or a non-positive value to return every qualifying candidate.
    """
    candidates: list[Candidate] = []
    for node in _person_nodes(doc):
        affiliation = node.get("bu_affiliation") or {}
        status = affiliation.get("status")
        if status != BU_AFFILIATED:
            continue
        attributes = node.get("attributes") or {}
        orcid = attributes.get("orcid")
        if not orcid:
            continue

        has_orcid = True
        is_bu_affiliated = True
        candidates.append(
            Candidate(
                node_id=node["id"],
                label=node.get("label", ""),
                orcid=orcid,
                affiliation_status=status,
                source_url=_primary_source_url(node),
                signal_score=_signal_score(has_orcid, is_bu_affiliated),
            )
        )

    # Highest signal first; ties broken deterministically by label then id.
    candidates.sort(key=lambda c: (-c.signal_score, c.label.lower(), c.node_id))

    if limit is not None and limit > 0:
        return candidates[:limit]
    return candidates


def load_doc(path: str | Path) -> dict:
    """Read a graph document from disk. Read-only: never writes."""
    return json.loads(Path(path).read_text(encoding="utf-8"))


def format_shortlist(candidates: list[Candidate]) -> str:
    """Render a human-readable shortlist of label, ORCID, and source URL."""
    if not candidates:
        return "No BU-affiliated researchers with an ORCID found."

    lines = [f"Shortlist: {len(candidates)} BU-affiliated researcher(s) with an ORCID", ""]
    width = len(str(len(candidates)))
    for i, c in enumerate(candidates, start=1):
        lines.append(f"{i:>{width}}. {c.label}")
        lines.append(f"{'':>{width}}   ORCID:  {c.orcid}")
        lines.append(f"{'':>{width}}   source: {c.source_url or '(none)'}")
        lines.append(f"{'':>{width}}   node:   {c.node_id}")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--input",
        default=str(RESEARCH_PATH),
        help="path to the research graph JSON (default: data/modules/research.json)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=DEFAULT_LIMIT,
        help=f"max candidates to print (default: {DEFAULT_LIMIT}; 0 for all)",
    )
    args = parser.parse_args(argv)

    doc = load_doc(args.input)
    candidates = extract_shortlist(doc, limit=args.limit)
    print(format_shortlist(candidates), end="")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
