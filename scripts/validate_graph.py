#!/usr/bin/env python3
"""Validate graph files (and optionally identity_matches.json) against the shared contract.

Usage:
    python scripts/validate_graph.py <graph.json>... [--identity data/modules/identity_matches.json]

Exits with code 1 if any file has errors. Warnings are printed but don't fail.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pipelines.common.validation import (  # noqa: E402
    ValidationResult,
    load_json,
    validate_graph,
    validate_identity_matches,
)

MAX_LINES = 50


def _report(path: str, result: ValidationResult, summary: str) -> None:
    status = "OK  " if result.ok else "FAIL"
    print(f"{status} {path}: {summary}, {len(result.errors)} error(s), {len(result.warnings)} warning(s)")
    for label, items in (("error", result.errors), ("warning", result.warnings)):
        for line in items[:MAX_LINES]:
            print(f"  {label}: {line}")
        if len(items) > MAX_LINES:
            print(f"  ... {len(items) - MAX_LINES} more {label}(s)")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("files", nargs="*", help="graph files to validate")
    parser.add_argument("--identity", action="append", default=[], help="identity_matches.json file(s)")
    args = parser.parse_args(argv)

    if not args.files and not args.identity:
        parser.error("no files given")

    failed = False
    for path in args.files:
        try:
            doc = load_json(path)
        except (OSError, ValueError) as exc:
            print(f"FAIL {path}: cannot read JSON: {exc}")
            failed = True
            continue
        result = validate_graph(doc)
        nodes = len(doc.get("nodes", [])) if isinstance(doc, dict) else 0
        edges = len(doc.get("edges", [])) if isinstance(doc, dict) else 0
        _report(path, result, f"{nodes} nodes, {edges} edges")
        failed = failed or not result.ok

    for path in args.identity:
        try:
            doc = load_json(path)
        except (OSError, ValueError) as exc:
            print(f"FAIL {path}: cannot read JSON: {exc}")
            failed = True
            continue
        result = validate_identity_matches(doc)
        matches = len(doc.get("matches", [])) if isinstance(doc, dict) else 0
        _report(path, result, f"{matches} matches")
        failed = failed or not result.ok

    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
