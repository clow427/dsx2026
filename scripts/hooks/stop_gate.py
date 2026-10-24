#!/usr/bin/env python3
"""Stop-hook quality gate. Wired up in .kiro/hooks/quality-gate-on-stop.json.

When the agent finishes a turn, look at the uncommitted changes in the repo:

- Changed graph files under data/ (except data/raw/) -> run scripts/validate_graph.py on them.
- Changed Python under pipelines/, scripts/, or tests/ -> run the fast test suite
  (everything except the 20 MB research.json check, Hypothesis `hook` profile).

If anything fails, print a Stop "block" decision so the agent takes another turn
to fix it. The same failure only blocks once (its fingerprint is kept in
.git/kiro-stop-gate), so a problem the agent can't fix never loops forever.
"""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
STATE_FILE = REPO_ROOT / ".git" / "kiro-stop-gate"
SLOW_TESTS = "tests/research/test_research_output.py"
MAX_OUTPUT = 3000


def python_bin() -> str:
    venv = REPO_ROOT / ".venv" / "bin" / "python"
    return str(venv) if venv.exists() else sys.executable


def changed_paths() -> list[str]:
    out = subprocess.run(
        ["git", "status", "--porcelain", "--untracked-files=all"],
        cwd=REPO_ROOT, capture_output=True, text=True, check=False,
    ).stdout
    paths = []
    for line in out.splitlines():
        path = line[3:]
        if " -> " in path:
            path = path.split(" -> ", 1)[1]
        paths.append(path.strip('"'))
    return paths


def plan(paths: list[str]) -> tuple[list[str], list[str], bool]:
    """(graph files, identity files, whether Python changed) among existing changed paths."""
    graphs, identity = [], []
    py_changed = False
    for p in paths:
        if p.startswith("data/") and p.endswith(".json") and not p.startswith("data/raw/"):
            if not (REPO_ROOT / p).exists():
                continue
            (identity if p.endswith("identity_matches.json") else graphs).append(p)
        elif p.endswith(".py") and p.split("/", 1)[0] in ("pipelines", "scripts", "tests"):
            py_changed = True
    return sorted(graphs), sorted(identity), py_changed


def run(cmd: list[str], env: dict | None = None) -> tuple[int, str]:
    proc = subprocess.run(cmd, cwd=REPO_ROOT, capture_output=True, text=True, env=env, check=False)
    return proc.returncode, (proc.stdout + proc.stderr)[-MAX_OUTPUT:]


def main() -> int:
    graphs, identity, py_changed = plan(changed_paths())
    problems = []
    if graphs or identity:
        args = graphs + [a for p in identity for a in ("--identity", p)]
        code, out = run([python_bin(), "scripts/validate_graph.py", *args])
        if code:
            problems.append(f"Graph validation failed:\n{out}")
    if py_changed:
        env = dict(os.environ, HYPOTHESIS_PROFILE="hook")
        code, out = run([python_bin(), "-m", "pytest", "-q", "-x", "-p", "no:cacheprovider",
                         "--deselect", SLOW_TESTS, "tests"], env=env)
        if code:
            problems.append(f"Fast test suite failed:\n{out}")

    if not problems:
        STATE_FILE.unlink(missing_ok=True)
        return 0

    report = "\n\n".join(problems)
    fingerprint = hashlib.sha256(report.encode()).hexdigest()
    if STATE_FILE.exists() and STATE_FILE.read_text().strip() == fingerprint:
        print("Quality gate still failing (already reported once):\n" + report, file=sys.stderr)
        return 0
    STATE_FILE.write_text(fingerprint)
    print(json.dumps({
        "decision": "block",
        "reason": "The quality gate (.kiro/hooks/quality-gate-on-stop.json) found problems in your uncommitted "
                  "changes. Fix them, or explain to the user why they can't be fixed.\n\n" + report,
    }))
    return 0


if __name__ == "__main__":
    sys.exit(main())
