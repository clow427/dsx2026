# Tasks: Shared Data Contract and Validation

**Owner:** P2 (lead). Task 1 needs all four owners.

- [ ] 1. Team review and sign-off of the contract (first 20 minutes)
  - Walk through `schema/graph.schema.json`, the edge type table, and the ID scheme together.
  - Confirm the demo topic, the stack, and the deploy target.
  - _Requirements: 1, 10_
- [ ] 2. Finalize the schema files after review
  - Apply any agreed changes to `schema/*.schema.json` and `data/mock/graph.sample.json`, then add a changelog entry.
  - _Requirements: 1, 9, 10_
- [ ] 3. Implement the shared Python helpers in `pipelines/common/`
  - [ ] 3.1 ID builders (`make_node_id`, `make_edge_id`, with symmetric sorting for undirected edge types)
  - [ ] 3.2 A `SourceRef` builder and a graph file writer that sorts output by ID
  - _Requirements: 2, 4_
- [ ] 4. Implement `scripts/validate_graph.py`
  - [ ] 4.1 Schema validation using `jsonschema`
  - [ ] 4.2 Semantic checks (uniqueness, prefixes, references, edge type endpoints, canonical namespace)
  - [ ] 4.3 Warnings and summary output, with a non-zero exit code on failure
  - _Requirements: 2, 3, 4, 5, 6, 7_
- [ ] 5. Write contract tests in `tests/contract/`
  - Cover unique IDs, dangling edges, missing evidence, `verified_alumnus` without evidence, a `merged` match at low confidence, and confirmation that the mock data passes.
  - _Requirements: 7.2, 9.2_
- [ ] 6. Implement the merge step in `pipelines/merge/` (P2)
  - [ ] 6.1 ID rewriting and source union for merged matches
  - [ ] 6.2 `SAME_AS_CANDIDATE` edges for candidate matches
  - [ ] 6.3 Deduplication, deterministic output, and a validator run on `data/graph.json`
  - _Requirements: 8_
- [ ] 7. Verify that the Kiro hook fires when a file under `data/` is saved, and record the result in the Kiro usage log
  - _Requirements: 7.3_
- [ ] 8. Mirror the schema as TypeScript types in `frontend/src/types/graph.ts` (P4)
  - _Requirements: 1_
