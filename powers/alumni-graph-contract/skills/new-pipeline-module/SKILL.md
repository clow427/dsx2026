---
name: new-pipeline-module
description: Scaffold a new data pipeline module (for example innovation or identity) that emits the shared graph contract, following the research module's fetch, cache, normalize, emit layout.
---

# Scaffold a contract-compliant pipeline module

Use the research module (`pipelines/research/`) as the reference implementation. Don't invent a new graph format.

## Step 1: Read the spec first

Open `.kiro/specs/<module>/requirements.md`, `design.md`, and `tasks.md`. Work task by task, and cite requirement numbers in commits.

## Step 2: Create the layout

```
pipelines/<module>/
  config.py      # source IDs and filters, looked up live. Never guessed. Record the lookup URL in a comment.
  http.py        # or reuse pipelines/research/http.py PoliteClient (spacing, retries, Retry-After)
  fetch.py       # paged fetch, with each raw page cached under data/raw/<module>/
  normalize.py   # raw -> GraphBuilder, using pipelines/common helpers only
  run.py         # entry point: python -m pipelines.<module>.run
tests/<module>/
  fixtures/      # recorded (or MOCK example.org) API responses
  test_normalize.py
  test_normalize_properties.py
```

## Step 3: Normalize with the shared helpers

- IDs: `pipelines.common.ids.make_node_id(type, namespace, local_id)`. It raises on invalid parts. Skip the record and count it in the stats instead of rewriting the ID.
- Provenance: `pipelines.common.sources.source_ref(source, url, record_id=..., retrieved_at=...)` on every node and edge.
- Build: `GraphBuilder.add_node` / `add_edge`. Adding an edge twice unions its evidence, which is how derived edges accumulate support.
- Persons are source-level (`person:<source>:<id>`). Never mint `person:canonical:*` outside the identity module.
- Set `bu_affiliation` from evidence only. Never set `verified_alumnus` from a publication, patent, or award address.
- Omit unknown attributes. Never guess them.

## Step 4: Emit and validate

```bash
.venv/bin/python -m pipelines.<module>.run
.venv/bin/python scripts/validate_graph.py data/modules/<module>.json
.venv/bin/python scripts/inspect_graph.py --file data/modules/<module>.json examples
```

Push a small first batch early, so the merge step and the frontend can integrate.

## Step 5: Tests

Write fixture-based example tests, then follow the `graph-property-tests` skill for the spec's correctness properties.
