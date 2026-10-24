#!/usr/bin/env python3
"""PreToolUse guard for shell commands. Wired up in .kiro/hooks/guard-shell.json.

Reads the Kiro hook event (JSON) on stdin and checks `tool_input.command`:

- Blocks (exit 2, reason on stderr) automated access to LinkedIn and staging `.env`
  files. Both are hard rules in .kiro/steering/data-integrity.md and the README.
- Asks the user to confirm (exit 0 with a permissionDecision of "ask") before a
  force push or a commit that skips git hooks.
- Allows everything else (exit 0, no output).
"""

from __future__ import annotations

import json
import re
import shlex
import sys

FETCHERS = re.compile(
    r"\b(curl|wget|httpie|http|requests|httpx|aiohttp|urllib|playwright|selenium|puppeteer|scrapy|fetch)\b", re.I
)
OPERATOR_CHARS = "();<>|&\n"


def segments(command: str) -> list[list[str]]:
    """Split a shell command into simple commands (token lists), respecting quotes.

    Operators (`&&`, `||`, `;`, `|`, newlines, ...) separate commands, but only outside
    quotes, so a commit message like "-m 'stage .env files; then push'" stays one token.
    """
    lexer = shlex.shlex(command, posix=True, punctuation_chars=OPERATOR_CHARS)
    lexer.whitespace = " \t\r"
    lexer.whitespace_split = True
    out: list[list[str]] = [[]]
    try:
        for tok in lexer:
            if tok and all(c in OPERATOR_CHARS for c in tok):
                out.append([])
            else:
                out[-1].append(tok)
    except ValueError:  # unbalanced quotes: fall back to a plain split, one segment per line
        out = [line.split() for line in command.splitlines()]
    return [seg for seg in out if seg]


def _git_args(tokens: list[str], subcommand: str) -> list[str] | None:
    """Arguments after `git [global options] <subcommand>` in one simple command, or None."""
    for i, tok in enumerate(tokens):
        if tok.rsplit("/", 1)[-1] != "git":
            continue
        j = i + 1
        while j < len(tokens) and tokens[j].startswith("-"):
            j += 2 if tokens[j] in ("-C", "-c") else 1  # these two global options take a value
        if j < len(tokens) and tokens[j] == subcommand:
            return tokens[j + 1 :]
    return None


def _is_env_file(path: str) -> bool:
    name = path.rstrip("/").rsplit("/", 1)[-1]
    return (name == ".env" or name.startswith(".env.")) and name != ".env.example"


def check(command: str) -> tuple[str, str] | None:
    """Return ("block" | "ask", reason) for a risky command, or None to allow it."""
    if "linkedin.com" in command.lower() and FETCHERS.search(command):
        return (
            "block",
            "Automated LinkedIn access is out of scope (data-integrity steering: LinkedIn is a discovery and "
            "attribution source only). Store a manually found or user-submitted public profile URL instead.",
        )
    for segment in segments(command):
        add_args = _git_args(segment, "add")
        if add_args and any(_is_env_file(a) for a in add_args if not a.startswith("-")):
            return ("block", "Refusing to stage a .env file: it holds API keys. Document variables in .env.example.")
        push_args = _git_args(segment, "push")
        if push_args and any(a in ("-f", "--force") or a.startswith("--force-with-lease") for a in push_args):
            return ("ask", "This is a force push, which rewrites remote history. Confirm before continuing.")
        commit_args = _git_args(segment, "commit")
        if commit_args and "--no-verify" in commit_args:
            return ("ask", "This commit skips git hooks (--no-verify). Confirm before continuing.")
    return None


def main() -> int:
    try:
        event = json.load(sys.stdin)
    except ValueError:
        return 0  # Not a hook event; never block on our own parsing problems.
    command = (event.get("tool_input") or {}).get("command") or ""
    verdict = check(command) if isinstance(command, str) else None
    if verdict is None:
        return 0
    decision, reason = verdict
    if decision == "block":
        print(reason, file=sys.stderr)
        return 2
    print(json.dumps({"hookSpecificOutput": {"permissionDecision": "ask", "permissionDecisionReason": reason}}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
