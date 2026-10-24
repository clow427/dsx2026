# Design: Shared Data Contract and Validation

Machine-readable contracts:

#[[file:schema/graph.schema.json]]

#[[file:schema/identity_matches.schema.json]]

## File layout

```
schema/graph.schema.json              # graph envelope, nodes, edges (JSON Schema draft-07)
schema/identity_matches.schema.json   # identity resolution output
data/mock/graph.sample.json           # fictional sample covering every type
data/modules/research.json            # P1
data/modules/people.json              # P2
data/modules/identity_matches.json    # P2
data/modules/innovation.json          # P3
data/graph.json                       # merge output, consumed by the frontend
data/raw/                             # API response caches (gitignored)
scripts/validate_graph.py             # validator CLI (planned)
pipelines/common/                     # shared helpers: IDs, source refs, writer (planned)
pipelines/merge/                      # merge step (planned, P2)
tests/contract/                       # contract tests (planned)
```

## ID scheme

`<type>:<namespace>:<local_id>`, where `namespace` matches `[a-z0-9_]+` and `local_id` matches `[A-Za-z0-9._-]+`. The `local_id` keeps the source's original ID wherever possible.

| Node type | Namespace(s) | Local ID |
|---|---|---|
| person | `openalex`, `s2`, `patentsview`, `nih`, `nsf`, `canonical` | Source author or inventor ID. Canonical IDs use a slug: `firstname-lastname[-disambiguator]` |
| publication | `openalex` (preferred), `doi`, `s2` | OpenAlex work ID |
| patent | `uspto` | Patent number |
| award | `nih`, `nsf` | Award or project number |
| organization | `ror` (preferred), `openalex`, `patentsview` | ROR ID or source ID |
| topic | `openalex` | OpenAlex topic or concept ID |

Edge IDs take the form `edge:<type_lowercase>:<source_id>|<target_id>`. For symmetric edge types (`COAUTHORED_WITH`, `SAME_AS_CANDIDATE`), sort the two endpoint IDs lexically so that each pair appears exactly once.

## Edge types

| Type | From → To | Typical derivation | Evidence |
|---|---|---|---|
| `AUTHORED` | person → publication | `source_record` | The publication record |
| `COAUTHORED_WITH` | person ↔ person | `derived` | Every shared publication record |
| `INVENTED` | person → patent | `source_record` / `identity_match` | The patent record |
| `ASSIGNED_TO` | patent → organization | `source_record` | The patent record |
| `RECEIVED_AWARD` | person → award | `source_record` / `identity_match` | The award record (PI listing) |
| `FUNDED_BY` | publication or award → award or organization | `source_record` | The award or publication record that lists the link |
| `AFFILIATED_WITH` | person → organization | `source_record` | An authorship institution, bio, or profile |
| `HAS_TOPIC` | publication, patent, award, or person → topic | `source_record` / `derived` | The record that assigns the topic |
| `SAME_AS_CANDIDATE` | person ↔ person | `identity_match` | Both of the compared records |

## Recommended `attributes` per node type

All attributes are optional. Include an attribute only when a source states it.

- **person:** `orcid`, `current_title`, `profile_urls` (public, permitted URLs only)
- **publication:** `year`, `venue`, `doi`, `abstract` (only where the license allows), `citation_count`
- **patent:** `patent_number`, `grant_date`, `filing_date`, `cpc_codes`
- **award:** `agency`, `award_number`, `fiscal_year`, `amount_usd`, `title`
- **organization:** `ror_id`, `country`, `org_type`
- **topic:** `level`, `parent_topic_id`

## Confidence rubric

The rubric is defined in `.kiro/steering/data-integrity.md`. For edges with `source_record` derivation, confidence defaults to `high`.

## Merge algorithm (P2)

1. Load all module files and confirm that each one passes the validator.
2. Load `identity_matches.json`. Build a map from each member ID to its canonical ID, using only matches whose status is `merged`.
3. For each merged match, create the canonical person node:
   - `sources`: the union of all members' sources.
   - `bu_affiliation`: the strongest status that has evidence, using the order `verified_alumnus` > `bu_affiliated_researcher` > `unverified`. If the members' evidence conflicts, set the status to `ambiguous`.
4. Rewrite the `source` and `target` of every edge using the ID map. Drop self-loops that the rewrite creates.
5. Deduplicate nodes and edges by ID, merging their `sources` and `evidence`. Deduplicate evidence by `(source, record_id, url)`.
6. For each candidate match, emit `SAME_AS_CANDIDATE` edges between its members, with the confidence taken from the match.
7. Sort by ID, write `data/graph.json` with `producer: "merge"`, and run the validator.

## Validator design

Command: `python scripts/validate_graph.py <file>... [--identity data/modules/identity_matches.json]`

**Checks that cause a failure:**

- The file fails the JSON Schema.
- A node ID or edge ID is duplicated.
- An ID's type prefix doesn't match the node's type.
- An edge points to a node that doesn't exist.
- An edge's endpoints don't match the source and target types allowed for its edge type.
- A person ID with the `canonical` namespace appears in a file whose producer is not `identity` or `merge`.
- A `merged` identity match has `low` confidence.

**Checks that produce a warning:**

- A `verified_alumnus` whose evidence comes only from `openalex` sources.
- A file that contains a `MOCK` note but whose producer is not `mock`.
- An orphan node with no edges.

The validator prints a summary and exits with code 1 if any failure check fails.

## Kiro hook

`.kiro/hooks/validate-graph-data.json` (PostFileSave on `data/**/*.json`) runs the validator once it exists. Until then, it prints a reminder.

## Changelog

- **0.1.0** (2026-10-24): Initial draft.
