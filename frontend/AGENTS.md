# AGENTS.md

- Landing page content is hardcoded in `src/pages/Landing.tsx`; graph people/edges live in `src/lib/alumniGraph.ts` — the old landing CMS (`useLandingContent`) no longer drives the public landing page.
- Alumni portraits are CDN assets (`src/assets/alumni/*.asset.json`), cropped square for graph nodes and 4:5 under `featured/` — keeps binaries out of the repo.
- The alumni chatbot (`/chat/:threadId`, `src/pages/Chat.tsx`) streams from the `alumni-chat` edge function; `/auth` redirects to it and the real sign-in page lives at `/login` — keeps organizer login reachable while the chatbot replaces the login page.
- `alumni-chat` only shows profiles returned by its own `search_linkedin` tool in the same request (Firecrawl web search, `site:linkedin.com/in "Boston University"`) — so the model can never present invented people.
- Chat threads are stored in browser localStorage via `src/lib/chatStore.ts` (no database) — matches the chosen "remember in this browser" storage.
