"""Tests for name normalization and blocking (identity-resolution task 3, Req 3.1)."""

from __future__ import annotations

import json

import pytest

from pipelines.identity.normalize_names import (
    RESEARCH_PATH,
    Block,
    blocking_key,
    candidate_blocks,
    demo_records,
    normalize_name,
    person_names,
    skeleton,
    variant_key,
)


@pytest.mark.parametrize(
    "name, expected",
    [
        # Accented names (real research.json labels).
        ("Raúl San Jośe Estépar", "estepar|r"),
        ("Álvaro Alonso", "alonso|a"),
        ("Özgün Babur", "babur|o"),
        ("Uğur Doğrusöz", "dogrusoz|u"),
        ("Aleš Žagar", "zagar|a"),
        ("Sandra Weıntraub", "weintraub|s"),  # Turkish dotless i
        ("İclal Ocak", "ocak|i"),
        # Initials-only / initial-led names.
        ("R. San José Estépar", "estepar|r"),
        ("A Lacey.", "lacey|a"),
        ("C M Tilton", "tilton|c"),
        ("A. Cecile J.W. Janssens", "janssens|a"),
        ("J. Michael Gaziano", "gaziano|j"),
        # Punctuation: curly apostrophe, Unicode hyphen, comma form, suffix.
        ("Abigail O’Connelll", "oconnelll|a"),
        ("Jan‐Erik Scholtz", "scholtz|j"),
        ("Kathleen Anne Welsh-Bohmer", "bohmer|k"),
        ("Parfitt, Francine C.", "parfitt|f"),
        ("John Smith Jr.", "smith|j"),
        # The known typo and its correct spelling: exact keys differ.
        ("Francine Parftt", "parftt|f"),
        ("Francine C. Parfitt", "parfitt|f"),
    ],
)
def test_blocking_key(name, expected):
    assert blocking_key(name) == expected


def test_accent_variants_share_exact_key():
    assert blocking_key("Raúl San Jośe Estépar") == blocking_key("R. San José Estépar")
    assert blocking_key("Sandra Weıntraub") == blocking_key("Sandra Weintraub")


def test_known_typo_surfaced_by_variant_key():
    assert blocking_key("Francine Parftt") != blocking_key("Francine C. Parfitt")
    assert variant_key("Francine Parftt") == variant_key("Francine C. Parfitt") == "prft|f"
    assert variant_key("Abigail O’Connelll") == variant_key("Abigail O'Connell")


def test_variant_key_respects_first_initial():
    assert variant_key("Francine Parfitt") != variant_key("George Parfitt")


def test_skeleton():
    assert skeleton("parfitt") == skeleton("parftt") == "prft"
    assert skeleton("oconnelll") == "ocnl"
    assert skeleton("") == ""


def test_degenerate_names():
    assert blocking_key("") is None
    assert blocking_key("  .,- ") is None
    assert blocking_key("Madonna") == "madonna|"
    assert normalize_name("").first_initial == ""


def test_candidate_blocks_labels_exact_and_variant():
    records = {
        "a": "Francine Parftt",
        "b": "Francine C. Parfitt",
        "c": "Raúl San Jośe Estépar",
        "d": "R. San José Estépar",
        "e": "Liam Gaziano",
    }
    assert candidate_blocks(records) == [
        Block("exact", "estepar|r", ("c", "d")),
        Block("variant", "prft|f", ("a", "b")),
    ]


def test_variant_block_not_duplicated_when_exact_already_groups():
    records = {"x": "Karen Anderson", "y": "Karen L. Anderson"}
    assert [b.kind for b in candidate_blocks(records)] == ["exact"]


@pytest.fixture(scope="module")
def research_doc():
    return json.loads(RESEARCH_PATH.read_text(encoding="utf-8"))


def test_real_research_typo_surfaced(research_doc):
    names = person_names(research_doc)
    blocks = candidate_blocks(demo_records(research_doc))
    parfitt = {"person:openalex:A5000243171", "person:openalex:A5079524556"}
    assert parfitt <= set(names)
    assert any(b.kind == "variant" and parfitt <= set(b.members) for b in blocks)
    assert any(
        b.kind == "exact" and {names[m] for m in b.members}
        >= {"Raúl San Jośe Estépar", "R. San José Estépar"}
        for b in blocks
    )


def test_every_real_person_gets_ascii_keys(research_doc):
    # Invariant over all ~4k real labels: keys exist and contain only a-z, 0-9,
    # and the separator, so blocking never depends on accents or punctuation.
    for label in person_names(research_doc).values():
        for key in (blocking_key(label), variant_key(label)):
            assert key is not None, label
            last, initial = key.split("|")
            assert last and last.isascii() and last.isalnum(), (label, key)
            assert initial == "" or (initial.isascii() and initial.isalnum()), (label, key)
