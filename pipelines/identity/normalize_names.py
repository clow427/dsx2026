"""Name normalization and blocking (identity-resolution task 3, Req 3.1).

Blocking narrows the pairs that ``match.py`` (task 4) has to score. This module
only normalizes names and groups records into blocks. It never decides that two
records are the same person and never merges anything.

Normalization (``normalize_name``):

* Unicode NFKD, then drop combining marks, so ``Estépar`` -> ``estepar`` and
  ``Jośe`` -> ``jose``. A small table folds letters NFKD does not decompose and
  that appear in real data: Turkish dotless ``ı`` (``Weıntraub``), ``ø``,
  ``ł``, ``đ``, ``ß``, ``æ``, ``œ``, ``þ``.
* Lowercase.
* Apostrophes (``'``, ``’``, ``ʼ``, backtick) are removed so that
  ``O’Connell`` -> ``oconnell``. Periods, hyphens (including U+2010 ``‐``),
  and all other punctuation become token breaks. That way ``J.W.`` splits into
  the initials ``j w``.
* A ``"Last, First"`` form is reordered to ``First Last``.
* Trailing generational suffixes (``Jr``, ``Sr``, ``II``-``IV``) are dropped.
* Initials: the first initial is the first character of the first token,
  whether that token is a full given name (``Raúl``) or a bare initial
  (``R.``, ``A``). Middle names and initials are ignored for blocking.

Last name = the final token after the steps above. A hyphenated surname
therefore blocks on its last part (``Welsh-Bohmer`` -> ``bohmer``), which also
groups it with the unhyphenated spelling and the bare second surname. Blocking
favours recall over precision, so over-grouping here is fine; ``match.py``
scores every pair.

Two keys:

* ``blocking_key``: ``"<last>|<first initial>"``, the design.md blocking rule.
  Catches accent, case, punctuation, and initial-only variants, e.g.
  ``Raúl San Jośe Estépar`` and ``R. San José Estépar`` -> ``estepar|r``.
* ``variant_key``: ``"<skeleton(last)>|<first initial>"``. The skeleton keeps
  the surname's first letter, drops later vowels (and ``y``), and collapses
  repeated letters. An exact key can't put a last-name typo in the same block
  as the correct spelling, so this secondary key exists to surface the known
  ``research.json`` typo ``Francine Parftt`` next to ``Francine C. Parfitt``.
  Both give ``prft|f``. It also catches doubled-letter slips such as
  ``O’Connelll`` vs ``O'Connell`` (``ocnl|a``). Typos that change a consonant
  (``Smith`` / ``Snith``) are not caught; that is a known limitation.

A pair that shares only a ``variant_key`` is at best a name-variant signal
(``name_variant`` -> ``candidate``/``low`` in design.md). This module labels
which key produced each block so the matcher can tell the two apart.

Run the demo over real ``research.json`` names:
    python -m pipelines.identity.normalize_names
    python -m pipelines.identity.normalize_names --name "Francine Parftt" --name "Francine C. Parfitt"
"""

from __future__ import annotations

import argparse
import json
import re
import unicodedata
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterable, Mapping

from pipelines.common.contract import REPO_ROOT

RESEARCH_PATH = REPO_ROOT / "data" / "modules" / "research.json"

# Letters that NFKD leaves alone but that should fold to ASCII for matching.
_FOLD = str.maketrans(
    {
        "ı": "i",  # Turkish dotless i (seen in research.json: "Weıntraub")
        "ø": "o",
        "Ø": "O",
        "ł": "l",
        "Ł": "L",
        "đ": "d",
        "Đ": "D",
        "ß": "ss",
        "æ": "ae",
        "Æ": "AE",
        "œ": "oe",
        "Œ": "OE",
        "þ": "th",
        "Þ": "Th",
    }
)

# Apostrophe-like characters are removed (joined), not turned into breaks.
_APOSTROPHES = {"'", "’", "‘", "ʼ", "`", "´"}

_SUFFIXES = {"jr", "sr", "ii", "iii", "iv"}

_SKELETON_DROP = set("aeiouy")

KEY_SEP = "|"


@dataclass(frozen=True)
class NormalizedName:
    """A name broken into normalized tokens. ``first_initial`` is "" if unknown."""

    original: str
    tokens: tuple[str, ...]

    @property
    def full(self) -> str:
        return " ".join(self.tokens)

    @property
    def last(self) -> str:
        return self.tokens[-1] if self.tokens else ""

    @property
    def first_initial(self) -> str:
        # Only a single-token name has no separate given name to take it from.
        return self.tokens[0][0] if len(self.tokens) > 1 else ""


def strip_accents(text: str) -> str:
    """Fold accents and the special letters in ``_FOLD`` to their base letter."""
    decomposed = unicodedata.normalize("NFKD", text.translate(_FOLD))
    return "".join(ch for ch in decomposed if not unicodedata.combining(ch))


def _tokenize(text: str) -> list[str]:
    out: list[str] = []
    for ch in text:
        if ch in _APOSTROPHES:
            continue
        # Keep letters/digits from any script; everything else is a break.
        out.append(ch if ch.isalnum() else " ")
    return "".join(out).split()


def normalize_name(name: str) -> NormalizedName:
    """Normalize a display name into lowercase, accent-free tokens."""
    raw = name or ""
    if raw.count(",") == 1:
        last_part, first_part = raw.split(",")
        if last_part.strip() and first_part.strip():
            raw = f"{first_part} {last_part}"
    folded = strip_accents(raw).lower()
    tokens = _tokenize(folded)
    while len(tokens) > 1 and tokens[-1] in _SUFFIXES:
        tokens.pop()
    return NormalizedName(original=name, tokens=tuple(tokens))


def skeleton(word: str) -> str:
    """First letter, then non-vowel letters with repeats collapsed.

    ``parfitt`` and ``parftt`` both -> ``prft``; ``oconnelll`` -> ``ocnl``.
    """
    if not word:
        return ""
    out = [word[0]]
    for ch in word[1:]:
        if ch in _SKELETON_DROP:
            continue
        if ch != out[-1]:
            out.append(ch)
    return "".join(out)


def blocking_key(name: str) -> str | None:
    """``"<last>|<first initial>"`` or ``None`` when the name has no tokens."""
    n = normalize_name(name)
    if not n.tokens:
        return None
    return f"{n.last}{KEY_SEP}{n.first_initial}"


def variant_key(name: str) -> str | None:
    """``"<skeleton(last)>|<first initial>"``. Secondary key for surname typos."""
    n = normalize_name(name)
    if not n.tokens:
        return None
    return f"{skeleton(n.last)}{KEY_SEP}{n.first_initial}"


def build_blocks(
    records: Mapping[str, str], key_fn: Callable[[str], str | None] = blocking_key
) -> dict[str, list[str]]:
    """Group record ids by ``key_fn(name)``.

    ``records`` maps record id -> display name. Records whose name produces no
    key are left out. Member lists are sorted for deterministic output.
    """
    blocks: dict[str, list[str]] = defaultdict(list)
    for record_id, name in records.items():
        key = key_fn(name)
        if key is not None:
            blocks[key].append(record_id)
    return {k: sorted(v) for k, v in sorted(blocks.items())}


@dataclass(frozen=True)
class Block:
    """A group of records that share a key. ``kind`` is "exact" or "variant"."""

    kind: str
    key: str
    members: tuple[str, ...]


def candidate_blocks(records: Mapping[str, str]) -> list[Block]:
    """Blocks with two or more members, from both keys.

    A variant block is reported only when it groups records that no single
    exact block already holds together. Those blocks are the ones that surface
    typo-level variants. Output order: exact blocks first, then variant
    blocks, each sorted by key.
    """
    exact = build_blocks(records, blocking_key)
    result = [Block("exact", k, tuple(v)) for k, v in exact.items() if len(v) > 1]

    exact_of = {rid: k for k, members in exact.items() for rid in members}
    for k, members in build_blocks(records, variant_key).items():
        if len(members) < 2:
            continue
        if len({exact_of[m] for m in members}) > 1:
            result.append(Block("variant", k, tuple(members)))
    return result


def person_names(doc: dict) -> dict[str, str]:
    """``{node id: label}`` for every person node in a graph document."""
    return {
        n["id"]: n.get("label", "")
        for n in doc.get("nodes", [])
        if n.get("type") == "person"
    }


# Real research.json people used by the demo: the Parftt/Parfitt typo, an
# accent + initial variant, a dotless-i spelling, a curly apostrophe, and two
# shared-name records that should land in one exact block.
DEMO_IDS = (
    "person:openalex:A5000243171",  # Francine Parftt
    "person:openalex:A5079524556",  # Francine C. Parfitt
)
DEMO_LABELS = (
    "Raúl San Jośe Estépar",
    "R. San José Estépar",
    "Sandra Weıntraub",
    "Masandra Weintraub",
    "Abigail O’Connelll",
    "J. Michael Gaziano",
    "Liam Gaziano",
    "Karen L. Anderson",
    "Karen Anderson",
    "Timothy Wagner",
    "Tim Wagner",
)


def demo_records(doc: dict) -> dict[str, str]:
    names = person_names(doc)
    wanted = set(DEMO_LABELS)
    return {
        rid: label
        for rid, label in names.items()
        if rid in DEMO_IDS or label in wanted
    }


def format_demo(records: Mapping[str, str]) -> str:
    lines = ["Normalized names", ""]
    for rid, label in sorted(records.items(), key=lambda kv: (kv[1], kv[0])):
        lines.append(
            f"  {label!r:28} exact={blocking_key(label)!s:18} "
            f"variant={variant_key(label)!s:14} {rid}"
        )
    lines += ["", "Blocks (2+ members)", ""]
    blocks = candidate_blocks(records)
    if not blocks:
        lines.append("  (none)")
    for b in blocks:
        lines.append(f"  [{b.kind}] {b.key}")
        for m in b.members:
            lines.append(f"      {records[m]!r}  {m}")
    return "\n".join(lines) + "\n"


def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Normalize names and show blocks.")
    parser.add_argument("--input", default=str(RESEARCH_PATH))
    parser.add_argument(
        "--name",
        action="append",
        help="ad-hoc names to block instead of the research.json demo set",
    )
    args = parser.parse_args(list(argv) if argv is not None else None)

    if args.name:
        records = {f"arg:{i}": n for i, n in enumerate(args.name)}
    else:
        doc = json.loads(Path(args.input).read_text(encoding="utf-8"))
        records = demo_records(doc)
    print(format_demo(records), end="")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
