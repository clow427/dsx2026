"""Entry point: python -m pipelines.research.run

Fetches (or reuses cached) OpenAlex works, normalizes them, optionally enriches
publications from Semantic Scholar, validates, and writes data/modules/research.json.
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
from dataclasses import replace
from pathlib import Path

from pipelines.common.contract import REPO_ROOT
from pipelines.common.graph import write_graph
from pipelines.common.validation import validate_graph

from .config import ResearchConfig
from .enrich_s2 import enrich_with_s2
from .fetch import fetch_works
from .normalize import normalize_works

log = logging.getLogger("pipelines.research")


def _load_env() -> None:
    try:
        from dotenv import load_dotenv
    except ImportError:
        return
    load_dotenv(REPO_ROOT / ".env")


def build_notes(config: ResearchConfig, matching: int, s2_matched: int | None) -> str:
    topics = ", ".join(config.topic_ids) if config.topic_ids else "all topics"
    s2 = f"Semantic Scholar enrichment matched {s2_matched} publications by DOI." if s2_matched is not None else (
        "Semantic Scholar enrichment not applied."
    )
    return (
        f"OpenAlex works with at least one authorship at Boston University ({config.institution_id}) or a BU child "
        f"institution, topics: {topics}, years {config.from_year}-{config.to_year}, types: "
        f"{', '.join(config.work_types)}. Top {matching} by citation count. Coauthor edges skipped for works with "
        f"more than {config.max_authors_for_coauthor} authors. {s2}"
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build data/modules/research.json from OpenAlex")
    parser.add_argument("--max-works", type=int, help="cap on works (default from config)")
    parser.add_argument("--refresh", action="store_true", help="ignore cached API responses")
    parser.add_argument("--skip-s2", action="store_true", help="skip Semantic Scholar enrichment")
    parser.add_argument("--output", type=Path, help="output path (default data/modules/research.json)")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO, format="%(levelname)s %(message)s")
    _load_env()

    config = ResearchConfig()
    if args.max_works:
        config = replace(config, max_works=args.max_works)
    if args.output:
        config = replace(config, output_path=args.output)

    result = fetch_works(
        config,
        api_key=os.environ.get("OPENALEX_API_KEY") or None,
        mailto=os.environ.get("OPENALEX_MAILTO") or None,
        refresh=args.refresh,
    )
    log.info("%d works (%s)", len(result.works), "cache" if result.from_cache else "live")

    graph, stats = normalize_works(
        result.works,
        retrieved_at=result.retrieved_date,
        bu_institution_id=config.institution_id,
        max_authors_for_coauthor=config.max_authors_for_coauthor,
    )
    log.info(
        "Normalized %d works: %d BU-affiliated authors, %d unverified, coauthor edges skipped for %d large works",
        stats.works,
        stats.bu_authors,
        stats.unverified_authors,
        stats.coauthor_skipped_works,
    )
    for reason, count in sorted(stats.skipped.items()):
        log.info("Skipped %d: %s", count, reason)

    s2_matched = None
    if not args.skip_s2:
        s2 = enrich_with_s2(graph, config, api_key=os.environ.get("S2_API_KEY") or None, refresh=args.refresh)
        if not s2.failed:
            s2_matched = s2.matched
            log.info("Semantic Scholar: matched %d of %d DOIs", s2.matched, s2.requested)

    doc = graph.to_document(
        "research", generated_at=result.fetched_at, notes=build_notes(config, stats.works, s2_matched)
    )
    validation = validate_graph(doc)
    for warning in validation.warnings:
        log.debug("validator warning: %s", warning)
    if not validation.ok:
        for error in validation.errors[:50]:
            log.error("validator: %s", error)
        log.error("Output failed validation; not writing %s", config.output_path)
        return 1

    path = write_graph(config.output_path, doc)
    log.info(
        "Wrote %s: %d nodes, %d edges (%d validator warnings)",
        path,
        len(doc["nodes"]),
        len(doc["edges"]),
        len(validation.warnings),
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
