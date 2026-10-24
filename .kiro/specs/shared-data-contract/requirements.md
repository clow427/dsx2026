# Requirements: Shared Data Contract and Validation

**Owner:** P2 (lead), with review from all four owners · **Status:** Draft. Sign-off is required within the first 20 minutes.

## Introduction

All four modules integrate through a single graph format. This spec defines that format, the identity-match file, the merge step that produces `data/graph.json`, and the validation that keeps every file consistent.

## Glossary

- **Graph file**: any JSON file that conforms to `schema/graph.schema.json`. This includes module outputs, the merged graph, and mock data.
- **Source-level person**: a person node minted by the research or innovation module, such as `person:openalex:...`.
- **Canonical person**: a person node minted by the identity module (`person:canonical:...`).
- **Validator**: `scripts/validate_graph.py`.

## Requirements

### Requirement 1: One shared graph format

**User story:** As a module owner, I want a single agreed format, so that my output integrates without custom glue code.

1. THE contract SHALL define one JSON envelope containing `schema_version`, `generated_at`, `producer`, `nodes`, and `edges`.
2. WHEN a module emits graph data, THE module SHALL emit the shared format directly or through an adapter.
3. THE contract SHALL support the node types `person`, `publication`, `patent`, `award`, `organization`, and `topic`.
4. THE contract SHALL support the edge types listed in `design.md`, each with a defined source type and target type.

### Requirement 2: Stable, unique IDs

**User story:** As a frontend developer, I want IDs that never change between pipeline runs, so that links and URLs stay valid.

1. THE node ID SHALL follow the pattern `<type>:<namespace>:<local_id>`, and the `<type>` prefix SHALL equal the node's `type`.
2. WHEN a pipeline runs twice on the same cached input, THE pipeline SHALL produce identical node and edge IDs.
3. IF two nodes in one graph file share an ID, THEN THE validator SHALL fail.
4. THE identity module SHALL be the only producer of `person:canonical:*` IDs.

### Requirement 3: Referential integrity

1. IF an edge `source` or `target` does not exist among the nodes in the same file, THEN THE validator SHALL fail.
2. WHEN a module emits a file, THE file SHALL contain every node its edges reference.

### Requirement 4: Evidence on every fact

1. THE validator SHALL reject any node that has no `sources` and any edge that has no `evidence`.
2. THE validator SHALL reject any source or evidence reference that has no URL.
3. WHEN the source system provides an identifier, THE source reference SHALL include it as `record_id`.

### Requirement 5: BU affiliation

1. THE validator SHALL require `bu_affiliation` on every person node and reject it on every other node type.
2. IF the status is `verified_alumnus` or `bu_affiliated_researcher` and there is no evidence, THEN THE validator SHALL fail.
3. THE contract SHALL NOT allow a status of `verified_alumnus` when the only evidence is a publication affiliation. Reviewers check this rule; the validator flags it with a warning.

### Requirement 6: Identity confidence separate from relationship evidence

1. THE edge `evidence` field SHALL identify the records that support the relationship, and the `confidence` field SHALL express certainty that the relationship holds.
2. WHEN two person records may be the same individual and the evidence is not sufficient to merge them, THE graph SHALL connect them with a `SAME_AS_CANDIDATE` edge rather than merging them.
3. THE contract SHALL NOT allow a `merged` identity match at `low` confidence.

### Requirement 7: Validation tooling

**User story:** As a teammate, I want automatic validation when data changes, so that broken data never reaches the frontend.

1. THE validator SHALL check the schema and the semantic rules in Requirements 2 through 6. It SHALL exit with a non-zero code when it finds an error.
2. THE test suite SHALL cover unique node IDs, valid edge references, required evidence fields, and the handling of ambiguous identity matches.
3. WHEN a file under `data/` is saved, THE Kiro hook `.kiro/hooks/validate-graph-data.json` SHALL run the validator.

### Requirement 8: Merge into `data/graph.json`

1. THE merge step SHALL combine `research.json`, `people.json`, and `innovation.json` with `identity_matches.json` to produce `data/graph.json`.
2. WHEN a match has status `merged`, THE merge step SHALL replace the member IDs with the canonical ID in all edges, and SHALL take the union of the members' sources.
3. WHEN a match has status `candidate`, THE merge step SHALL keep the member nodes separate and emit `SAME_AS_CANDIDATE` edges between them.
4. THE merge step SHALL deduplicate identical nodes and edges, combining their sources and evidence.
5. THE merged graph SHALL pass the validator.
6. THE merge step SHALL never include mock data.

### Requirement 9: Mock data

1. THE repository SHALL contain `data/mock/graph.sample.json`. This file SHALL exercise every node type, every edge type, and at least one ambiguous identity.
2. THE mock data SHALL use only fictional entities and example domains, and SHALL pass the validator.

### Requirement 10: Contract change process

1. WHEN the schema changes, THE change SHALL bump `schema_version`, add an entry to the changelog in `design.md`, and receive approval from all four owners.
