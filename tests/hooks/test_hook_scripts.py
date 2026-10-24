"""Tests for the scripts behind the Kiro hooks in .kiro/hooks/.

The subprocess tests feed each script the same JSON event Kiro sends on stdin,
so they check the exit-code contract (0 allow, 2 block) end to end.
"""

from __future__ import annotations

import json
import subprocess
import sys

import pytest
from hypothesis import given
from hypothesis import strategies as st

from pipelines.common.contract import REPO_ROOT
from scripts.hooks.guard_shell import check
from scripts.hooks.spec_status import spec_status
from scripts.hooks.stop_gate import plan

GUARD = REPO_ROOT / "scripts" / "hooks" / "guard_shell.py"


def run_guard(command: str) -> subprocess.CompletedProcess:
    event = {"hook_event_name": "PreToolUse", "tool_name": "execute_bash", "tool_input": {"command": command}}
    return subprocess.run([sys.executable, str(GUARD)], input=json.dumps(event), capture_output=True, text=True)


@pytest.mark.parametrize(
    "command",
    [
        "curl -s https://www.linkedin.com/in/example-person",
        "python -c \"import requests; requests.get('https://linkedin.com/in/x')\"",
        "git add .env",
        "git add -f frontend/.env",
        "git -C /tmp/repo add .env.local",
        "uv pip list && git add README.md .env",
        "echo ok\ngit add .env",
        "(cd /tmp/repo; git add '.env')",
    ],
)
def test_guard_blocks_hard_rule_violations(command):
    proc = run_guard(command)
    assert proc.returncode == 2
    assert proc.stderr.strip()


@pytest.mark.parametrize("command", ["git push --force origin main", "git push -f", "git commit --no-verify -m x"])
def test_guard_asks_before_destructive_git(command):
    proc = run_guard(command)
    assert proc.returncode == 0
    assert json.loads(proc.stdout)["hookSpecificOutput"]["permissionDecision"] == "ask"


@pytest.mark.parametrize(
    "command",
    [
        "git add .env.example README.md",
        "grep -rn linkedin.com .kiro/steering",
        "git commit -m 'add .env.example and force push docs'",
        "git push -u origin docs/kiro-usage",
        ".venv/bin/python -m pytest -q",
        # Regression: quoted ";" and multi-line scripts used to be split naively, so the
        # ".env" inside this commit message was read as a `git add` path.
        "git add scripts/hooks/\ngit commit -m 'feat: block staging .env files; ask before force push'",
        "set -e\ngit add README.md\ngit commit -m \"mentions .env and git add .env in prose\"",
    ],
)
def test_guard_allows_ordinary_commands(command):
    proc = run_guard(command)
    assert proc.returncode == 0
    assert proc.stdout == ""


def test_guard_ignores_malformed_events():
    proc = subprocess.run([sys.executable, str(GUARD)], input="not json", capture_output=True, text=True)
    assert proc.returncode == 0


@given(
    st.lists(st.from_regex(r"[a-z]{1,8}(/[a-z]{1,8})?\.(py|md|json)", fullmatch=True), max_size=3),
    st.sampled_from([".env", ".env.local", ".env.production", "frontend/.env"]),
    st.sampled_from(["", "-f ", "-v "]),
)
def test_guard_blocks_any_env_file_in_git_add(others, env_file, flags):
    """Property H1: wherever a .env file appears among `git add` paths, the command is blocked."""
    paths = others + [env_file]
    assert check(f"git add {flags}{' '.join(paths)}")[0] == "block"


def test_stop_gate_plans_checks_from_changed_paths():
    graphs, identity, py = plan(
        ["data/mock/graph.sample.json", "data/raw/research/x.json", "README.md", "pipelines/common/ids.py"]
    )
    assert graphs == ["data/mock/graph.sample.json"]
    assert identity == [] and py is True
    assert plan(["README.md", ".kiro/steering/product.md"]) == ([], [], False)


def test_spec_status_counts_top_level_tasks_only():
    md = "- [x] 1. Done\n  - [ ] 1.1 Sub\n- [ ] 2. Open one\n- [ ] 3. Open two\n"
    assert spec_status(md) == (1, 3, ["2. Open one", "3. Open two"])
