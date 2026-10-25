"""Entry point: python -m pipelines.merge.run

Merges the real module graphs with identity matches into ``data/graph.json``
(``producer: "merge"``), following the shared-data-contract merge algorithm
(see ``merge.py``).

Default inputs, all under ``data/modules/``: ``people.json``, ``research.json``,
``innovation.json`` (only once P3's real file exists), and
``identity_matches.json``. Mock data is never merged: anything under
``data/mock/``, any graph with ``producer: mock``, and any file carrying a
``MOCK`` note is refused (Req 8.6).

The output is validated before it is written; nothing is written if it fails.
``generated_at`` is the latest input ``generated_at``, so re-running on the
same inputs produces a byte-identical file.

Examples:

    python -m pipelines.merge.run
    python -m pipelines.merge.run --output /tmp/graph.json
    python -m pipelines.merge.run --modules-dir path/to/modules
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

from pipelines.common.contract import REPO_ROOT
from pipelines.common.graph import write_graph
from pipelines.common.validation import validate_graph
from pipelines.profiles.build import apply_profiles, load_profiles

from .merge import MergeError, is_mock_path, merge_graphs

log = logging.getLogger("pipelines.merge")

MODULES_DIR = REPO_ROOT / "data" / "modules"
OUTPUT_PATH = REPO_ROOT / "data" / "graph.json"
# people.json first so curated canonical nodes are the first-seen version.
MODULE_NAMES = ("people.json", "research.json", "innovation.json")
REQUIRED_MODULES = frozenset({"people.json", "research.json"})
MATCHES_NAME = "identity_matches.json"


def module_paths(modules_dir: Path = MODULES_DIR) -> list[Path]:
    """Module graphs to merge: people + research always, innovation when present."""
    paths = []
    for name in MODULE_NAMES:
        path = modules_dir / name
        if name in REQUIRED_MODULES or path.exists():
            paths.append(path)
    return paths


def _load(path: Path) -> dict:
    if is_mock_path(path):
        raise MergeError(f"{path}: files under data/mock/ are never merged")
    if not path.exists():
        raise MergeError(f"{path}: missing input")
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


def run_merge(
    modules_dir: Path = MODULES_DIR,
    output_path: Path = OUTPUT_PATH,
    matches_path: Path | None = None,
    generated_at: str | None = None,
) -> int:
    """Merge, validate, and write. Returns 0 on success, 1 on refusal or invalid output."""
    matches_path = matches_path or modules_dir / MATCHES_NAME
    try:
        paths = module_paths(modules_dir)
        docs = [(p.name, _load(p)) for p in paths]
        matches_doc = _load(matches_path)
        doc, stats = merge_graphs(docs, matches_doc, generated_at=generated_at)
    except MergeError as exc:
        log.error("merge refused: %s", exc)
        return 1

    # Person profiles (pipelines/profiles) are keyed by ORCID and OpenAlex IDs, so they
    # re-attach to the merged people. Only the real data/modules/profiles.json is applied.
    profiles = load_profiles(modules_dir / "profiles.json") if modules_dir == MODULES_DIR else None
    if profiles:
        log.info("  person profiles attached: %d", apply_profiles(doc, profiles).applied)

    result = validate_graph(doc)
    if not result.ok:
        for error in result.errors[:50]:
            log.error("validator: %s", error)
        log.error("Merged graph failed validation; not writing %s", output_path)
        return 1

    write_graph(output_path, doc)
    log.info("Inputs: %s + %s", ", ".join(str(p) for p in paths), matches_path)
    log.info("  merged matches: %d (%d member node(s) collapsed)", stats.merged_matches, stats.members_merged)
    log.info("  candidate matches: %d -> %d SAME_AS_CANDIDATE edge(s)", stats.candidate_matches, stats.same_as_candidate_edges)
    log.info("  rejected matches: %d", stats.rejected_matches)
    log.info("  self-loops dropped: %d; duplicate nodes combined: %d; duplicate edges combined: %d",
             stats.self_loops_dropped, stats.duplicate_nodes, stats.duplicate_edges)
    if stats.ambiguous:
        log.info("  ambiguous: %s", ", ".join(stats.ambiguous))
    if stats.missing_members:
        log.warning("  match members absent from every module file: %s", ", ".join(stats.missing_members))
    log.info(
        "Wrote %s: %d nodes, %d edges (%d validator warning(s))",
        output_path, len(doc["nodes"]), len(doc["edges"]), len(result.warnings),
    )
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Merge module graphs into data/graph.json")
    parser.add_argument("--modules-dir", type=Path, default=MODULES_DIR, help="directory with the module files")
    parser.add_argument("--matches", type=Path, help="identity matches file (default: <modules-dir>/identity_matches.json)")
    parser.add_argument("--output", type=Path, default=OUTPUT_PATH, help="output path (default: data/graph.json)")
    parser.add_argument("--generated-at", help="override generated_at (default: latest input generated_at)")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO, format="%(levelname)s %(message)s")
    return run_merge(args.modules_dir, args.output, args.matches, args.generated_at)


if __name__ == "__main__":
    sys.exit(main())
