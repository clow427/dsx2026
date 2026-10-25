"""Entry point: python -m pipelines.profiles.run

Reads data/graph.json, fetches (or reuses cached) public ORCID records and OpenAlex
author records for its people, writes data/modules/profiles.json, and attaches the
profiles to data/graph.json. The merge step re-applies profiles.json on every run, so
re-merging keeps them; run this step again to refresh them.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from datetime import date
from pathlib import Path

from pipelines.common.contract import REPO_ROOT
from pipelines.common.graph import write_graph
from pipelines.common.validation import validate_graph

from .build import PROFILES_PATH, apply_profiles, build_profiles, write_profiles
from .fetch import fetch_openalex_authors, fetch_orcid

log = logging.getLogger("pipelines.profiles")
GRAPH_PATH = REPO_ROOT / "data" / "graph.json"


def _load_env() -> None:
    try:
        from dotenv import load_dotenv
    except ImportError:
        return
    load_dotenv(REPO_ROOT / ".env")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Fetch person profiles (ORCID, OpenAlex) and attach them to data/graph.json")
    parser.add_argument("--graph", type=Path, default=GRAPH_PATH)
    parser.add_argument("--output", type=Path, default=PROFILES_PATH, help="profiles file (default: data/modules/profiles.json)")
    parser.add_argument("--refresh", action="store_true", help="ignore cached responses")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO, format="%(levelname)s %(message)s")
    _load_env()

    graph = json.loads(args.graph.read_text(encoding="utf-8"))
    people = [n for n in graph["nodes"] if n["type"] == "person"]
    authors = sorted({s["record_id"] for n in people for s in n["sources"]
                      if s["source"] == "openalex" and str(s.get("record_id", "")).startswith("A")})
    orcids = sorted({str(n["attributes"]["orcid"]).upper() for n in people if (n.get("attributes") or {}).get("orcid")})
    log.info("%d people: %d with an ORCID, %d OpenAlex author IDs", len(people), len(orcids), len(authors))

    orcid_records = fetch_orcid(orcids, refresh=args.refresh)
    author_records = fetch_openalex_authors(
        authors, refresh=args.refresh,
        api_key=os.environ.get("OPENALEX_API_KEY") or None, mailto=os.environ.get("OPENALEX_MAILTO") or None,
    )
    profiles, stats = build_profiles(orcid_records, author_records, retrieved_at=date.today().isoformat())
    log.info(
        "ORCID profiles: %d (%d with a current position, %d with a biography, %d with websites); OpenAlex: %d authors",
        stats.orcid_records, stats.with_position, stats.with_bio, stats.with_links, stats.openalex_authors,
    )

    applied = apply_profiles(graph, profiles)
    result = validate_graph(graph)
    if not result.ok:
        for error in result.errors[:50]:
            log.error("validator: %s", error)
        log.error("Graph with profiles failed validation; not writing")
        return 1
    write_profiles(profiles, args.output)
    write_graph(args.graph, graph)
    log.info("Wrote %s and attached profiles to %d people in %s", args.output, applied.applied, args.graph)
    return 0


if __name__ == "__main__":
    sys.exit(main())
