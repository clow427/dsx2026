# Tasks: Innovation and Funding

**Owner:** P3

- [ ] 1. Kickoff checks: confirm PatentsView, NIH RePORTER, and NSF access, then add `.env.example` with the required keys
  - _Requirements: 1.1, 1.4, 2.1_
- [ ] 2. Define the scope in `pipelines/innovation/config.py` (CPC codes, keywords, BU filters, caps)
  - _Requirements: 1.1_
- [ ] 3. Implement the cached patent and inventor fetch
  - _Requirements: 1.1, 1.4_
- [ ] 4. Implement normalization to patent, person, and organization nodes, plus `INVENTED` and `ASSIGNED_TO` edges
  - _Requirements: 1.2, 1.3, 3.2, 3.3_
- [ ] 5. Push the first small batch to `data/modules/innovation.json` for P2 and P4
  - _Requirements: 4_
- [ ] 6. (Stretch) Implement NIH and NSF award fetch and normalization, including `RECEIVED_AWARD` and `FUNDED_BY` edges
  - _Requirements: 2_
- [ ] 7. Write fixture-based tests for normalization and the affiliation status rules
  - _Requirements: 1, 3_
- [ ] 7.5 Write property-based tests for correctness properties N1–N5 in `design.md`
  - _Requirements: 1, 2, 3, 4_
- [ ] 8. Produce the final dataset, confirm the validator passes, and spot-check records by hand against their source URLs
  - _Requirements: 4_
