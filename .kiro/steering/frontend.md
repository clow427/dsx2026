---
inclusion: fileMatch
fileMatchPattern: 'frontend/**'
---

# Frontend Conventions

- React + TypeScript (strict mode), built with Vite. Graph rendering uses Cytoscape.js.
- TypeScript types in `frontend/src/types/graph.ts` must mirror `schema/graph.schema.json`. Update them in the same PR as any schema change.
- Load data from a single source. Use `graph.json` when it exists, and fall back to `data/mock/graph.sample.json`. Never hardcode records in components.
- Build all UI against the mock data first, so the frontend is never blocked by the pipelines.
- Show uncertainty explicitly:
  - Display a confidence label on every edge.
  - Render `SAME_AS_CANDIDATE` and `ambiguous` people with a visible "unconfirmed match" treatment.
- Open evidence links in a new tab with `rel="noopener noreferrer"`. Show the source name and record ID next to each link.
- Accessibility:
  - Everything must be reachable by keyboard.
  - Provide a list or table alternative to the graph canvas.
  - Never use color as the only signal for a node type or confidence level.
  - Use visible focus states and readable contrast.
- Every data view needs loading, empty, and error states.
