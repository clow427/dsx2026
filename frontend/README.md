# Frontend explorer (P4)

Static React + Vite app that loads the shared graph and implements the demo journey: search, graph explorer, detail and evidence panels, filters, and Find My People. Spec: `.kiro/specs/frontend-explorer/`.

```bash
npm ci
npm run dev        # syncs ../data into public/data, then serves on :8080
npm test           # Vitest: loader shape checks, search, filters, ranking
npm run typecheck  # strict TypeScript over the explorer code
npm run build      # syncs data, then builds dist/ (static; no backend, no auth)
```

## Views (`/explore`)

| View | URL | What it shows |
|---|---|---|
| People network (default) | `/explore?node=<topic or person id>` | Search a topic to see the BU people working on it around it, or a person to see who they work with. People only, colored by BU status. Verified alumni sit on the inner ring, then BU researchers, then others. Links are shared papers and NIH grants; click one to see the records behind it. |
| How are we connected? | `?view=connect&from=<id>&to=<id>` | Shortest chain of real collaborations between two people (up to 6 steps), with the record behind every step. |
| Topics | `?view=topics&field=<field>&topic=<topic id>` | Field → subfield → topic, then the BU people working on a topic, alumni first. |
| Find My People | `?view=people&topic=<query>` | Ranked people for a topic, with the records that explain each rank. |
| All records | `?view=records&node=<id>` | Every node type (papers, topics, organizations, grants) and the full filter panel. |

People links are computed in `src/data/people.ts` from edges already in the graph (COAUTHORED_WITH, shared RECEIVED_AWARD, and FUNDED_BY + AUTHORED); each link keeps those edges as evidence.

## Data

`scripts/sync-graph.mjs` picks the first file that exists:

1. `data/graph.json`: the merged graph (P2 merge step).
2. `data/modules/research.json`: interim. The app shows a "Partial data" banner.

The mock (`data/mock/graph.sample.json`) is always copied. The app falls back to it, with a "Mock data" banner, when no real graph is served. A graph that fails the shape checks in `src/data/loadGraph.ts` shows an error state instead of rendering.
