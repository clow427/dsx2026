"""Entry point: python -m pipelines.innovation.run

Fetches (or reuses cached) NIH RePORTER awards, reads PatentsView bulk tables
when they are present, normalizes both, validates, and writes
data/modules/innovation.json.

FUNDED_BY publication edges are limited to publications already in
data/modules/research.json (pass --all-publications to keep every NIH-linked
work OpenAlex resolves), so funding attaches to the papers the graph shows.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from dataclasses import replace
from pathlib import Path

from pipelines.common.contract import REPO_ROOT
from pipelines.common.graph import GraphBuilder, write_graph
from pipelines.common.validation import validate_graph

from .config import InnovationConfig
from .fetch_awards import fetch_awards
from .fetch_patents import fetch_patents
from .normalize import NormalizeStats, normalize_awards, normalize_patents

log = logging.getLogger("pipelines.innovation")


def _load_env() -> None:
    try:
        from dotenv import load_dotenv
    except ImportError:
        return
    load_dotenv(REPO_ROOT / ".env")


def load_publication_ids(path: Path) -> set[str] | None:
    if not path.exists():
        log.warning("%s not found; FUNDED_BY publication edges will not be limited to it", path)
        return None
    doc = json.loads(path.read_text(encoding="utf-8"))
    return {n["id"] for n in doc.get("nodes", []) if n.get("type") == "publication"}


def build_notes(config: InnovationConfig, stats: NormalizeStats, patents_loaded: bool, limited: bool) -> str:
    parts = [
        f"NIH RePORTER projects whose awardee is Boston University ({', '.join(config.nih_org_names)}), "
        f"fiscal years {config.from_fiscal_year}-{config.to_fiscal_year}, matching "
        f"{config.nih_text_search()} in title, terms, or abstract: {stats.awards} awards. "
        f"FUNDED_BY publication edges only where NIH lists the PubMed ID and OpenAlex resolves it"
        + (", limited to publications in research.json." if limited else "."),
    ]
    if patents_loaded:
        parts.append(
            f"PatentsView bulk tables (USPTO Open Data Portal): patents assigned to Boston University with CPC "
            f"prefixes {', '.join(config.cpc_prefixes) or 'any'}: {stats.patents} patents."
        )
    else:
        parts.append("No patents: PatentsView bulk tables were not provided (see pipelines/innovation/README.md).")
    parts.append("NSF awards not included.")
    return " ".join(parts)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build data/modules/innovation.json from NIH RePORTER and PatentsView")
    parser.add_argument("--refresh", action="store_true", help="ignore cached responses and subsets")
    parser.add_argument("--skip-awards", action="store_true")
    parser.add_argument("--skip-patents", action="store_true")
    parser.add_argument("--max-awards", type=int)
    parser.add_argument("--max-patents", type=int)
    parser.add_argument("--patentsview-dir", type=Path, help="directory holding the g_*.tsv(.zip) bulk tables")
    parser.add_argument("--all-publications", action="store_true",
                        help="keep FUNDED_BY edges to publications outside research.json")
    parser.add_argument("--output", type=Path, help="output path (default data/modules/innovation.json)")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO, format="%(levelname)s %(message)s")
    _load_env()

    config = InnovationConfig()
    overrides = {
        "max_awards": args.max_awards,
        "max_patents": args.max_patents,
        "patentsview_dir": args.patentsview_dir,
        "output_path": args.output,
    }
    config = replace(config, **{k: v for k, v in overrides.items() if v is not None})

    g = GraphBuilder()
    stats = NormalizeStats()
    fetched_at: list[str] = []

    known = None if args.all_publications else load_publication_ids(Path(config.research_path))
    if not args.skip_awards:
        awards = fetch_awards(
            config,
            openalex_api_key=os.environ.get("OPENALEX_API_KEY") or None,
            openalex_mailto=os.environ.get("OPENALEX_MAILTO") or None,
            refresh=args.refresh,
        )
        log.info("NIH: %d project-years, %d publication links (%s)", len(awards.projects),
                 len(awards.publication_links), "cache" if awards.from_cache else "live")
        normalize_awards(awards.projects, awards.publication_links, awards.pmid_works, awards.retrieved_date,
                         config.nih_org_names, known_publication_ids=known, max_awards=config.max_awards,
                         builder=g, stats=stats)
        fetched_at.append(awards.fetched_at)

    patents = None if args.skip_patents else fetch_patents(config, refresh=args.refresh)
    if patents is not None:
        log.info("PatentsView: %d selected patents (%s)", len(patents.patents), "cache" if patents.from_cache else "scan")
        normalize_patents(patents.patents, patents.retrieved_date, config.bu_assignee_pattern, builder=g, stats=stats)
        fetched_at.append(patents.fetched_at)

    if not g.nodes:
        log.error("Nothing to write: no awards and no patents")
        return 1

    log.info(
        "Normalized %d awards (%d people, %d funded publications) and %d patents (%d inventors); %d BU-affiliated people",
        stats.awards, stats.award_people, stats.funded_publications, stats.patents, stats.inventors, stats.bu_people,
    )
    for reason, count in sorted(stats.skipped.items()):
        log.info("Skipped %d: %s", count, reason)

    doc = g.to_document(
        "innovation",
        generated_at=max(fetched_at),
        notes=build_notes(config, stats, patents is not None, known is not None),
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
    log.info("Wrote %s: %d nodes, %d edges (%d validator warnings)", path, len(doc["nodes"]), len(doc["edges"]),
             len(validation.warnings))
    return 0


if __name__ == "__main__":
    sys.exit(main())
