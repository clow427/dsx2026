# Frontend explorer (P4)

Static React + Vite app that loads the shared graph and implements the demo journey: search, graph explorer, detail and evidence panels, filters, and Find My People. Spec: `.kiro/specs/frontend-explorer/`.

```bash
npm ci
npm run dev        # syncs ../data into public/data, then serves on :8080
npm test           # Vitest: loader shape checks, search, filters, ranking
npm run typecheck  # strict TypeScript over the explorer code
npm run build      # syncs data, then builds dist/ (static; no backend, no auth)
```

## Data

`scripts/sync-graph.mjs` picks the first file that exists:

1. `data/graph.json`: the merged graph (P2 merge step).
2. `data/modules/research.json`: interim. The app shows a "Partial data" banner.

The mock (`data/mock/graph.sample.json`) is always copied. The app falls back to it, with a "Mock data" banner, when no real graph is served. A graph that fails the shape checks in `src/data/loadGraph.ts` shows an error state instead of rendering.
