---
inclusion: always
---

# Shared Data Contract (summary)

The full specification lives in `.kiro/specs/shared-data-contract/design.md`. The machine-readable contract is:

#[[file:schema/graph.schema.json]]

## Envelope

Every graph file has this shape:

```json
{ "schema_version": "0.1.0", "generated_at": "<ISO datetime>", "producer": "research|identity|innovation|merge|mock", "nodes": [], "edges": [] }
```

## Node IDs

Node IDs use the format `<type>:<namespace>:<local_id>`. IDs are lowercase except for `local_id`, which keeps the source's original casing.

| Type | Example | Notes |
|---|---|---|
| person (source record) | `person:openalex:A5000000001` | Emitted by the research and innovation modules |
| person (canonical) | `person:canonical:jane-doe-bme` | Minted only by the identity module |
| publication | `publication:openalex:W0000000001` | |
| patent | `patent:uspto:US0000000B2` | |
| award | `award:nih:R01XX000000` / `award:nsf:0000000` | |
| organization | `organization:ror:0xxxxxx00` | Prefer ROR. Fall back to `organization:<source>:<id>` |
| topic | `topic:openalex:T00000` | |

## Edge types

`AUTHORED`, `COAUTHORED_WITH`, `INVENTED`, `ASSIGNED_TO`, `RECEIVED_AWARD`, `FUNDED_BY`, `AFFILIATED_WITH`, `HAS_TOPIC`, `SAME_AS_CANDIDATE`

## Enumerations

- `bu_affiliation.status`: `verified_alumnus`, `bu_affiliated_researcher`, `unverified`, `ambiguous`
- `confidence`: `high`, `medium`, `low`
- `derivation`: `source_record`, `derived`, `identity_match`
