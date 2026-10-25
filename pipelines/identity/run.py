"""Entry point: python -m pipelines.identity.run

Runs the identity-resolution pipeline steps:

* ``directory``: reads the curated ``data/curation/people.yaml``, builds
  canonical person nodes, validates them against the shared graph contract,
  and writes ``data/modules/people.json`` (``producer: identity``).
* ``match``: scores ``people.json`` against the source module graphs
  (see ``match.py``), validates the result, and writes
  ``data/modules/identity_matches.json``.
* ``all`` (default): ``directory`` then ``match``.
* ``discover``: fetches public ORCID education records for every ORCID in the
  source graphs and harvests OpenBU theses (both cached under data/raw/identity/),
  then writes ``data/curation/people.discovered.yaml`` (see ``discover.py``).
  The directory step loads that file alongside people.yaml; hand-curated entries win.

Default sources (no ``--source``): ``data/modules/research.json``, plus
``data/modules/innovation.json`` automatically once P3's real file exists.
Swapping the mock for the real batch needs no code change: drop the file in
``data/modules/`` and re-run.

The mock innovation batch (``data/mock/innovation.mock.json``) is NEVER a
default. Pass it explicitly, and write its output outside ``data/modules/`` so
mock records never mix into real module outputs:

    python -m pipelines.identity.run --step match \\
        --source data/modules/research.json \\
        --source data/mock/innovation.mock.json \\
        --matches-output data/mock/identity_matches.mock.json

Other examples:

    python -m pipelines.identity.run
    python -m pipelines.identity.run --step directory --output path/to/people.json
    python -m pipelines.identity.run --step match --source data/modules/research.json
    python -m pipelines.identity.run --step match --reviews path/to/reviews.yaml
    python -m pipelines.identity.run --step match --no-reviews
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

from pipelines.common.graph import write_graph
from pipelines.common.validation import validate_graph, validate_identity_matches

from . import discover, match
from .directory import CURATION_PATH, OUTPUT_PATH, build_document, load_entries
from .openbu import harvest_theses
from .orcid_education import fetch_educations

log = logging.getLogger("pipelines.identity")

# Real module graphs matched by default (see default_source_paths).
DEFAULT_MODULES_DIR = match.RESEARCH_PATH.parent
DEFAULT_SOURCE_NAMES = ("research.json", "innovation.json")


def merge_entries(curated: list[dict], discovered: list[dict]) -> list[dict]:
    """Curated entries plus discovered ones whose slug and ORCID aren't already curated."""
    slugs = {e.get("slug") for e in curated}
    orcids = {str(e.get("orcid") or "").upper() for e in curated if e.get("orcid")}
    extra = [e for e in discovered if e.get("slug") not in slugs and str(e.get("orcid") or "").upper() not in orcids]
    return curated + extra


def run_directory(
    curation_path: Path = CURATION_PATH,
    output_path: Path = OUTPUT_PATH,
    discovered_path: Path | None = None,
) -> int:
    """Build and write data/modules/people.json from the curation file(s).

    Returns 0 on success, 1 if the built document fails contract validation
    (in which case nothing is written).
    """
    curated = load_entries(curation_path)
    log.info("Loaded %d curated person entries from %s", len(curated), curation_path)
    discovered = load_entries(discovered_path) if discovered_path and Path(discovered_path).exists() else []
    entries = merge_entries(curated, discovered)
    if discovered:
        log.info("Loaded %d discovered entries from %s (%d used)", len(discovered), discovered_path,
                 len(entries) - len(curated))

    notes = None
    if len(entries) > len(curated):
        notes = (
            f"Canonical person directory: {len(curated)} hand-curated people (data/curation/people.yaml) and "
            f"{len(entries) - len(curated)} BU alumni discovered from public ORCID education records and OpenBU "
            f"theses (data/curation/people.discovered.yaml). BU degree, department, and graduation year are "
            f"recorded only where a cited public source states them."
        )
    doc = build_document(entries, notes=notes)

    validation = validate_graph(doc)
    for warning in validation.warnings:
        log.debug("validator warning: %s", warning)
    if not validation.ok:
        for error in validation.errors[:50]:
            log.error("validator: %s", error)
        log.error("Output failed validation; not writing %s", output_path)
        return 1

    path = write_graph(output_path, doc)
    log.info(
        "Wrote %s: %d person node(s) (%d validator warning(s))",
        path,
        len(doc["nodes"]),
        len(validation.warnings),
    )
    return 0


def default_source_paths(modules_dir: Path | None = None) -> list[Path]:
    """Real module graphs to match when no ``--source`` is given.

    Always ``research.json``; plus ``innovation.json`` once P3's real file
    exists in ``data/modules/``. Only real module outputs are picked up here:
    the mock (``data/mock/innovation.mock.json``) is never a default and must
    be passed explicitly with ``--source``.
    """
    modules_dir = DEFAULT_MODULES_DIR if modules_dir is None else modules_dir
    paths = [modules_dir / name for name in DEFAULT_SOURCE_NAMES]
    return [p for p in paths if p.name == "research.json" or p.exists()]


def run_match(
    people_path: Path = match.PEOPLE_PATH,
    source_paths: list[Path] | None = None,
    output_path: Path = match.OUTPUT_PATH,
    reviews_path: Path | None = match.REVIEWS_PATH,
) -> int:
    """Build and write data/modules/identity_matches.json.

    ``reviews_path`` (default data/curation/reviews.yaml; None to skip) holds the
    manual decisions that override automated results.

    Returns 0 on success, 1 if the reviews file or the result fails validation
    (nothing is written).
    """
    source_paths = source_paths or default_source_paths()
    log.info("Matching against source(s): %s", ", ".join(str(p) for p in source_paths))
    people_doc = match.load_doc(people_path)
    source_docs = [match.load_doc(p) for p in source_paths]
    try:
        reviews = match.load_reviews(reviews_path) if reviews_path else []
    except ValueError as exc:
        log.error("reviews: %s", exc)
        return 1
    if reviews_path:
        log.info("Loaded %d review decision(s) from %s", len(reviews), reviews_path)
    result = match.run_matching(people_doc, source_docs, reviews)
    for r in result.unapplied_reviews:
        log.warning(
            "review not (fully) applied, people absent from this run: %s ~ %s",
            r.canonical_id,
            ", ".join(r.member_ids),
        )
    doc = result.document()

    validation = validate_identity_matches(doc)
    if not validation.ok:
        for error in validation.errors[:50]:
            log.error("validator: %s", error)
        log.error("Matches failed validation; not writing %s", output_path)
        return 1

    path = match.write_matches(output_path, doc)
    for m in doc["matches"]:
        rev = f"  [reviewed by {m['reviewed']['by']} {m['reviewed']['at']}]" if "reviewed" in m else ""
        log.info("  %-48s %-9s %-6s %s%s", m["canonical_id"], m["status"], m["confidence"], ", ".join(m["member_ids"]), rev)
    for d in result.deferred:
        log.info("  deferred: %s ~ %s (%s/%s)", d.canonical_id, d.member_id, d.status, d.confidence)
    log.info("Wrote %s: %d match(es) from %d scored pair(s)", path, len(doc["matches"]), len(result.decisions))
    return 0


def run_discover(
    source_paths: list[Path] | None = None,
    curation_path: Path = CURATION_PATH,
    output_path: Path = discover.DISCOVERED_PATH,
    refresh: bool = False,
) -> int:
    """Fetch ORCID educations and OpenBU theses, then write people.discovered.yaml."""
    source_paths = source_paths or default_source_paths()
    docs = discover.load_docs(source_paths)
    orcids = sorted(discover.source_orcids(docs))
    log.info("Discovering BU alumni among %d ORCIDs in %s", len(orcids), ", ".join(str(p) for p in source_paths))
    educations = fetch_educations(orcids, refresh=refresh)
    theses, _ = harvest_theses(refresh=refresh)
    entries, stats = discover.discover(docs, load_entries(curation_path), educations, theses)
    path = discover.write_discovered(entries, output_path)
    log.info(
        "ORCID records with a stated BU degree: %d of %d. OpenBU: %d BU theses, %d with an ORCID, %d linked.",
        stats.orcid_records_with_bu_degree, stats.orcids_checked, stats.theses, stats.theses_with_orcid,
        stats.theses_linked,
    )
    for reason, count in sorted(stats.skipped.items()):
        log.info("Skipped %d: %s", count, reason)
    log.info("Wrote %s: %d discovered alumni", path, stats.entries)
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Identity pipeline: people.json and identity_matches.json")
    parser.add_argument(
        "--step",
        choices=["discover", "directory", "match", "all"],
        default="all",
        help="pipeline step to run (default: all = directory then match)",
    )
    parser.add_argument(
        "--curation",
        type=Path,
        default=CURATION_PATH,
        help="curation file to read (default: data/curation/people.yaml)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=OUTPUT_PATH,
        help="people.json output path (default: data/modules/people.json); also the match step's input",
    )
    parser.add_argument(
        "--source",
        type=Path,
        action="append",
        help=(
            "source graph(s) to match against, repeatable (default: data/modules/research.json, "
            "plus data/modules/innovation.json if present; the mock is never a default)"
        ),
    )
    parser.add_argument(
        "--matches-output",
        type=Path,
        default=match.OUTPUT_PATH,
        help="identity matches output path (default: data/modules/identity_matches.json)",
    )
    parser.add_argument(
        "--reviews",
        type=Path,
        default=match.REVIEWS_PATH,
        help="manual review decisions that override automated matches (default: data/curation/reviews.yaml)",
    )
    parser.add_argument("--no-reviews", action="store_true", help="ignore the reviews file (automated results only)")
    parser.add_argument("--no-discovered", action="store_true",
                        help="directory step: ignore data/curation/people.discovered.yaml")
    parser.add_argument("--refresh", action="store_true", help="discover step: ignore cached ORCID/OpenBU responses")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO, format="%(levelname)s %(message)s")

    if args.step == "discover":
        return run_discover(source_paths=args.source, curation_path=args.curation, refresh=args.refresh)
    if args.step in ("directory", "all"):
        rc = run_directory(curation_path=args.curation, output_path=args.output,
                           discovered_path=None if args.no_discovered else discover.DISCOVERED_PATH)
        if rc or args.step == "directory":
            return rc
    return run_match(
        people_path=args.output,
        source_paths=args.source,
        output_path=args.matches_output,
        reviews_path=None if args.no_reviews else args.reviews,
    )


if __name__ == "__main__":
    sys.exit(main())
