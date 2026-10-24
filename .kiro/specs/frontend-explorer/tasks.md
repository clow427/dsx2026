# Tasks: Frontend Explorer

**Owner:** P4

- [x] 1. Scaffold the Vite + React + TypeScript app in `frontend/` and add Cytoscape.js, using pinned versions
  - The Lovable app was imported as the scaffold. Cytoscape is pinned (`3.34.4`). The imported dependencies still use caret ranges.
  - _Requirements: 8_
- [x] 2. Mirror the schema as TypeScript types, and implement `loadGraph` with the mock fallback and the "Mock data" banner
  - `src/types/graph.ts`, `src/data/loadGraph.ts`. A "Partial data" banner also appears when the producer is not `merge`.
  - _Requirements: 1_
- [x] 3. Build the in-memory graph index and the search with type-grouped results
  - _Requirements: 2_
- [x] 4. Build the explorer canvas (visual encoding, neighborhood focus, node expansion) and the accessible list view
  - The focus shows the 40 most connected neighbors and each expansion adds 25. The status line reports "N of M neighbors".
  - _Requirements: 3_
- [x] 5. Build the node detail panels, including the person affiliation section and the "unconfirmed match" notice
  - _Requirements: 4_
- [x] 6. Build the edge evidence panel
  - _Requirements: 5_
- [x] 7. Build the filters and the "Research" and "Patent" presets
  - _Requirements: 6_
- [x] 8. Build Find My People (ranking and explanations)
  - Weight per record = person-edge weight × HAS_TOPIC-edge weight. Affiliation bonus is +0.5 for verified alumni and +0.25 for BU-affiliated researchers.
  - _Requirements: 7_
- [ ] 8.5 Write fast-check property tests for correctness properties F1–F5 in `design.md`
  - Example tests for F1, F2, F3, and F5 are in `src/test/graphData.test.ts`. fast-check generators and F4 are still to do.
  - _Requirements: 6, 7_
- [ ] 9. Add loading, empty, and error states, and run an accessibility pass
  - The states are done and were checked in a headless browser. The full keyboard and contrast pass has not been run.
  - _Requirements: 8.1_
- [ ] 10. Switch to the merged `graph.json`, deploy, and rehearse the demo journey end to end
  - Blocked on shared-data-contract task 6 (merge). `scripts/sync-graph.mjs` already prefers `data/graph.json` when it exists.
  - _Requirements: 1, 8.2_
- [ ] 11. (Stretch) Add an evidence-grounded summary panel
  - _Requirements: 9_
