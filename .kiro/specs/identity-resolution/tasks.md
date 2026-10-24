# Tasks: Alumni Discovery and Identity Resolution

**Owner:** P2. Also leads `.kiro/specs/shared-data-contract/tasks.md`.

- [ ] 1. Define the formats of `data/curation/people.yaml` and `reviews.yaml`, and seed them with 5 to 10 real, publicly documented people relevant to the demo topic
  - _Requirements: 1.2, 1.3, 2.1_
- [ ] 2. Implement directory building that turns curation entries into canonical person nodes (`people.json`)
  - _Requirements: 1.1, 1.4, 4.1_
- [ ] 3. Implement name normalization and blocking
  - _Requirements: 3.1_
- [ ] 4. Implement signal scoring and the decision rules
  - _Requirements: 3.2, 3.3, 4.2_
- [ ] 5. Implement manual review overrides
  - _Requirements: 3.4_
- [ ] 6. Run matching on P1's and P3's first batches, then review every candidate match by hand
  - _Requirements: 3, 6.2_
- [ ] 7. Implement and run the merge step (see shared-data-contract task 6)
  - _Requirements: 5, 6.1_
- [ ] 8. Write tests: ORCID merge, name-only candidate, rejection on ORCID conflict, low-confidence matches never merged
  - _Requirements: 3, 6_
