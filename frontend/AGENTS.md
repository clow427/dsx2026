# AGENTS.md

- All people, counts, and links come from the loaded graph (`src/data/GraphContext.tsx`). Never hardcode records or use photos of real people (`.kiro/steering/data-integrity.md`).
- `scripts/sync-graph.mjs` runs before `dev` and `build`. It copies `data/graph.json`, or, until the merge exists, `data/modules/research.json`, into `public/data/graph.json`, plus the mock as `public/data/graph.sample.json`.
- Routes: `/` (landing, `src/pages/Landing.tsx`), `/explore` (`src/pages/Explore.tsx`, URL state `node`, `sel`, `edge`, `view`, `topic`), and `/chat/:threadId` (alumni chatbot, `src/pages/Chat.tsx`).
- The alumni chatbot streams from the `alumni-chat` Supabase edge function (needs `VITE_SUPABASE_URL`). It only shows profiles returned by its own `search_linkedin` tool in the same request, so the model cannot present invented people. Its empty-state sidebar lists people from the loaded graph.
- Chat threads are stored in browser localStorage via `src/lib/chatStore.ts` (no database).
- The event-studio pages imported from Lovable (auth, dashboard, registration, tickets) are no longer routed. Their files are still in `src/` pending a decision to delete them.
- `npm run typecheck` runs strict TypeScript over the explorer code only. The rest of the app predates strict mode.
