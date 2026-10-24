# Design: Frontend Explorer

Contract: #[[file:schema/graph.schema.json]]

## Layout (planned)

```
frontend/
  public/graph.json            # copied from data/graph.json at build (or the mock fallback)
  src/
    types/graph.ts             # mirrors schema/graph.schema.json
    data/loadGraph.ts          # fetch + shape check + mock fallback
    data/graphIndex.ts         # in-memory indexes: byId, edgesByNode, byType, label search
    features/search/
    features/explorer/         # Cytoscape canvas + accessible list view
    features/details/          # NodePanel (per type), EdgeEvidencePanel
    features/filters/
    features/find-my-people/   # ranking + explanations
    components/                # ConfidenceBadge, AffiliationBadge, SourceLink, MockDataBanner
```

## State

- **Single store:** a React context or a lightweight store. It holds the loaded graph, the active filters, the selected node or edge, and the focused neighborhood.
- **URL state:** `?node=<id>` and `?topic=<id>`, so that the demo can deep-link straight to a scene.

## Visual encoding

| Node type | Shape | Color (paired with a text label) |
|---|---|---|
| person | ellipse | blue |
| publication | rectangle | green |
| patent | diamond | orange |
| award | hexagon | purple |
| organization | round-rectangle | gray |
| topic | tag | teal |

Edges use a solid line for `high` confidence, dashed for `medium`, and dotted for `low`. `SAME_AS_CANDIDATE` edges are always dotted and labeled "possible match".

## Find My People ranking (deterministic)

1. Resolve the topic to its topic node or nodes, matching by label or ID.
2. Collect the works linked to those topics through `HAS_TOPIC`: publications, patents, and awards.
3. Collect the people linked to those works through `AUTHORED`, `INVENTED`, or `RECEIVED_AWARD`.
4. Score each person:
   - Add one point per distinct connecting record, weighted by edge confidence (high = 1, medium = 0.6, low = 0.2).
   - Add a small bonus for `verified_alumnus`, then for `bu_affiliated_researcher`.
5. Return the people with the contributing records attached, so that the UI can explain the score.

## Build-order principle

Build every feature first against `data/mock/graph.sample.json`. Switch to `graph.json` once the merge produces it.
