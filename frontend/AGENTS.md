# AGENTS.md

- Landing page content is hardcoded in `src/pages/Landing.tsx`; graph people/edges live in `src/lib/alumniGraph.ts` — the old landing CMS (`useLandingContent`) no longer drives the public landing page.
- Alumni portraits are CDN assets (`src/assets/alumni/*.asset.json`), cropped square for graph nodes and 4:5 under `featured/` — keeps binaries out of the repo.
