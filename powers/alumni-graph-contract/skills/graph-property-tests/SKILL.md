---
name: graph-property-tests
description: Turn a spec's correctness properties into Hypothesis property-based tests for graph pipelines, with oracles, boundary-character generators, and a mutation check.
---

# Property-based tests for graph pipelines

## Step 1: Find the properties

Each spec's `design.md` has a "Correctness properties" table, with IDs such as C1, R3, and N2. If a requirement says "every", "never", "iff", "exactly", or "for any", it belongs in that table. Add it there first.

## Step 2: Write generators

- Draw from small fixed pools of fictional entities (authors, institutions, topics), so that records recur across inputs. Recurrence is what exercises dedup, evidence accumulation, and coauthor derivation.
- Include awkward inputs: blank or whitespace titles, missing IDs, unattributed authorships, `None` years, mixed-case DOIs.
- For ID-like text, use an alphabet with separators (`:`, `|`, `/`), a space, a trailing `\n`, and non-ASCII. Plain `st.text()` almost never produces `"A1\n"`, which is how this repo found that `re.match` with `$` accepted trailing newlines.
- Label generated data MOCK, and use `example.org` URLs.
- In `unique_by=`, pass a named function, not a lambda (works around a crash in Hypothesis 6.170.9).

## Step 3: Assert against an oracle

Compute the expected nodes, edges, or statuses directly from the generated input, in a few lines, and compare them with set equality. Don't call the code under test to build the expectation. See `tests/research/test_normalize_properties.py` for R1–R6.

Always include:
- The validator is clean: `validate_graph(doc).errors == []`.
- Determinism: same input gives an identical document, and shuffled insertion order gives an identical document.
- Validator teeth: mutate a valid graph (drop a referenced node, duplicate an ID, empty the evidence) and assert that it's rejected.

## Step 4: Mutation-check the properties

Break the implementation on purpose, one line at a time (an off-by-one cap, a wrong status, a dropped filter). Run the properties with `HYPOTHESIS_PROFILE=hook`, and confirm that each mutant fails at least one test. Revert the change afterward.

## Step 5: Record falsifying examples

When Hypothesis finds a bug, add the shrunk input as `@example(...)` and a plain regression test. Then fix the code, and note the bug in the spec's design.md and in `docs/KIRO_USAGE.md`.

## Profiles

`tests/conftest.py` registers `dev` (100 examples, the default), `hook` (20, used by the Stop hook), and `ci` (1,000).
