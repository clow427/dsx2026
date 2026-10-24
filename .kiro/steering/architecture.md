---
inclusion: always
---

# Architecture

## Overview

```
Public data sources
  OpenAlex · Semantic Scholar · BU repository / bios · PatentsView · NIH RePORTER / NSF
        │
        ▼
Four independent modules (each owns its pipeline and output file)
  research (P1) ─► data/modules/research.json
  identity (P2) ─► data/modules/people.json + data/modules/identity_matches.json
  innovation (P3) ─► data/modules/innovation.json
        │
        ▼
Merge step (owned by P2) ─► data/graph.json   (validated against schema/graph.schema.json)
        │
        ▼
Frontend (P4) loads graph.json (or data/mock/graph.sample.json until real data exists)
  Search · Graph explorer · Detail & evidence panels · Filters · Find My People
```

## Module ownership

| Module | Owner | Code | Output | Spec |
|---|---|---|---|---|
| Shared data contract + validation | P2 leads, all review | `schema/`, `scripts/`, `tests/contract/` | n/a | `.kiro/specs/shared-data-contract/` |
| Research graph | P1 | `pipelines/research/` | `data/modules/research.json` | `.kiro/specs/research-graph/` |
| Identity resolution + merge | P2 | `pipelines/identity/`, `pipelines/merge/` | `people.json`, `identity_matches.json`, `graph.json` | `.kiro/specs/identity-resolution/` |
| Innovation and funding | P3 | `pipelines/innovation/` | `data/modules/innovation.json` | `.kiro/specs/innovation-funding/` |
| Frontend explorer | P4 | `frontend/` | Deployed web app | `.kiro/specs/frontend-explorer/` |

Each data owner is responsible for the accuracy of their own source records. P2 owns identity resolution across the whole system.

## Stack (proposed — confirm at kickoff)

- Frontend: React + TypeScript, built with Vite.
- Graph visualization: Cytoscape.js.
- Pipelines: Python 3.11+, tested with pytest. Validation uses `jsonschema`.
- Storage: committed JSON files. No database.
- Deployment: Vercel, serving a static build plus the committed `graph.json`.
- AI: optional, stretch goal only. Evidence-grounded summaries of existing records; never used to create edges.

## Integration rules

- Module output files must be self-contained. Every node that an edge references must also appear in the same file. Duplicates across files are expected, and the merge step deduplicates them.
- Integrate early. Push the first small batch of real records as soon as a pipeline produces any. Don't wait for the end.
- The frontend never computes facts the data doesn't contain. Derived views, such as rankings, must trace back to the edges they come from.
- Changing the contract requires agreement from all four owners, a `schema_version` bump, and a changelog entry in `.kiro/specs/shared-data-contract/design.md`.
