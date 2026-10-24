---
inclusion: fileMatch
fileMatchPattern: ['tests/**', 'pipelines/**', 'scripts/**']
---

# Testing Conventions

## Two kinds of tests

- **Example tests** (`tests/<module>/test_*.py`) pin specific behaviour against recorded fixtures in `tests/<module>/fixtures/`. Never call live APIs from tests.
- **Property-based tests** (`tests/<module>/test_*_properties.py`, Hypothesis) check the correctness properties listed in each spec's `design.md` under "Correctness properties". Every property has an ID (for example `C5`, `R3`). Put that ID and the requirement number in the test's docstring.

## When to write a property instead of an example

Write a property when a requirement says "every", "never", "for any", "iff", or "exactly":

- Contract invariants: every edge endpoint exists, IDs fully match the pattern, every node has a source.
- Provenance: output evidence is exactly the input records that support the claim, with nothing invented.
- Status rules: `bu_affiliated_researcher` iff BU authorship evidence exists, and never `verified_alumnus` from publications.
- Determinism: same input gives an identical document, and insertion order doesn't matter.
- Validator teeth: a mutated valid graph (dangling edge, duplicate ID, missing evidence) is always rejected.

Compare the output against a small oracle computed directly from the generated input. Don't re-implement the code under test.

## Generators

- Generated data is fictional and labeled MOCK, with `example.org` URLs (data-integrity rules).
- Include boundary characters on purpose: separators (`:`, `|`, `/`), whitespace, a trailing `\n`, and non-ASCII. Plain `st.text()` almost never produces `"A1\n"`, which is how the `$`-before-newline ID bug was found (see `pipelines/common/ids.py`).
- Use regexes with `.fullmatch()`, never `.match()`, when the regex validates an identifier.
- In `st.lists(..., unique_by=...)`, pass a named function, not a lambda. Hypothesis 6.170.9 crashes on some lambda sources.

## Running

```bash
.venv/bin/python -m pytest                            # everything, `dev` profile (100 examples per property)
HYPOTHESIS_PROFILE=ci .venv/bin/python -m pytest      # 1,000 examples per property
HYPOTHESIS_PROFILE=hook .venv/bin/python -m pytest --deselect tests/research/test_research_output.py tests  # what the Stop hook runs
```

When Hypothesis reports a falsifying example, add it as an `@example(...)` or as a plain regression test before fixing the code.
