---
name: audit-graph-evidence
description: Spot-check a graph file against its original sources before a demo or merge, confirming that every shown claim traces to a real record URL and that BU affiliation statuses are justified.
---

# Audit a graph file's evidence

## Step 1: Validate

```bash
.venv/bin/python scripts/validate_graph.py data/modules/<module>.json
```

Errors block the merge. Read every warning: `verified_alumnus` backed only by OpenAlex, MOCK notes in real output, and orphan nodes all need a decision.

## Step 2: Summarize

```bash
.venv/bin/python scripts/inspect_graph.py --file <file> summary
```

Check the counts by BU status, derivation, and confidence. A real module file should have no `verified_alumnus` unless a BU repository, bio, or commencement source backs it.

## Step 3: Sample and open sources

Pick about 10 records: the richest person, a paper with several sources, the coauthor edge with the most evidence, and the top topic (`inspect_graph.py examples` chooses these deterministically). For each one, open the evidence URLs and confirm:
- the title, authors, and institution match the source record;
- the `record_id` equals the ID in the URL;
- the BU status follows the data-integrity rules (publishing at BU is not alumni status).

## Step 4: Record the result

Note mismatches in the module's tasks.md, and log the audit in `docs/KIRO_USAGE.md`. Fix the data at the pipeline level. Never hand-edit generated JSON.
