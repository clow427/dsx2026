# Tasks: Research Graph

**Owner:** P1

- [x] 1. Record BU's institution IDs (OpenAlex and ROR) and the demo topic IDs in `pipelines/research/config.py`
  - _Requirements: 1.1_
- [x] 2. Implement the cached OpenAlex fetch with paging, a contact email, and caps
  - _Requirements: 1.2, 1.3, 1.4_
- [x] 3. Implement normalization to publication, person, organization, and topic nodes, plus `AUTHORED`, `AFFILIATED_WITH`, and `HAS_TOPIC` edges
  - _Requirements: 2.1, 2.2_
- [x] 4. Implement the BU affiliation status rules
  - _Requirements: 2.3, 2.4_
- [x] 5. Derive `COAUTHORED_WITH` edges, applying the author cap and accumulating evidence
  - _Requirements: 3_
- [x] 6. Push the first small batch (about 10 works) to `data/modules/research.json` for early integration with P2 and P4
  - _Requirements: 5_
- [x] 7. (Optional) Add Semantic Scholar enrichment by DOI
  - _Requirements: 4_
- [x] 8. Write fixture-based tests for normalization and the coauthor derivation
  - _Requirements: 2, 3_
- [x] 9. Produce the final dataset, confirm the validator passes, and spot-check 10 records by hand against their source URLs
  - _Requirements: 5_
