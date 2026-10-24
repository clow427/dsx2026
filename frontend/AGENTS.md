# AGENTS.md

- All people, counts, and links come from the loaded graph (`src/data/GraphContext.tsx`). Never hardcode records or use photos of real people (`.kiro/steering/data-integrity.md`).
- `scripts/sync-graph.mjs` runs before `dev` and `build`. It copies `data/graph.json`, or, until the merge exists, `data/modules/research.json`, into `public/data/graph.json`, plus the mock as `public/data/graph.sample.json`.
- Routes: `/` (landing, `src/pages/Landing.tsx`) and `/explore` (`src/pages/Explore.tsx`, URL state `node`, `sel`, `edge`, `view`, `topic`).
- The event-studio pages imported from Lovable (auth, dashboard, registration, tickets, Supabase) are no longer routed. Their files are still in `src/` pending a decision to delete them.
- `npm run typecheck` runs strict TypeScript over the explorer code only. The rest of the app predates strict mode.
