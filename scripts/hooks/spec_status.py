#!/usr/bin/env python3
"""SessionStart context: current branch plus open tasks in every spec.

Wired up in .kiro/hooks/spec-status-on-start.json. Stdout is added to the agent's
context, so each session starts knowing where the team is in the spec plan
without anyone re-explaining it.
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SPECS = REPO_ROOT / ".kiro" / "specs"
TASK_RE = re.compile(r"^- \[( |x|X)\] (.+)$")  # top-level tasks only (no indent)
MAX_OPEN = 3


def spec_status(tasks_md: str) -> tuple[int, int, list[str]]:
    """(done, total, first open task titles) for top-level tasks in a tasks.md."""
    done, total, open_tasks = 0, 0, []
    for line in tasks_md.splitlines():
        m = TASK_RE.match(line)
        if not m:
            continue
        total += 1
        if m.group(1).lower() == "x":
            done += 1
        else:
            open_tasks.append(m.group(2).strip())
    return done, total, open_tasks


def main() -> int:
    branch = subprocess.run(
        ["git", "branch", "--show-current"], cwd=REPO_ROOT, capture_output=True, text=True, check=False
    ).stdout.strip()
    lines = [f"Spec status (branch: {branch or 'detached'}). Work from tasks.md and cite requirement numbers."]
    for tasks in sorted(SPECS.glob("*/tasks.md")):
        done, total, open_tasks = spec_status(tasks.read_text(encoding="utf-8"))
        lines.append(f"- {tasks.parent.name}: {done}/{total} tasks done")
        for title in open_tasks[:MAX_OPEN]:
            lines.append(f"    open: {title}")
        if len(open_tasks) > MAX_OPEN:
            lines.append(f"    ... {len(open_tasks) - MAX_OPEN} more open")
    print("\n".join(lines))
    return 0


if __name__ == "__main__":
    sys.exit(main())
