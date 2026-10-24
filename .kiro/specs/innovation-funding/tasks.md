# Tasks: Innovation and Funding

**Owner:** P3

- [x] 1. Kickoff checks: confirm PatentsView, NIH RePORTER, and NSF access, then add `.env.example` with the required keys
  - Findings (2026-10-24): the PatentSearch API was retired on 2026-03-20 and the old S3 bulk files return 403. Patents now come from the PatentsView bulk tables on the USPTO Open Data Portal (needs a USPTO.gov API key; downloaded manually). NIH RePORTER is open with no key. NSF was dropped: no PI identifiers and loose keyword search. No new keys are needed, so `.env.example` is unchanged. See `pipelines/innovation/README.md`.
  - _Requirements: 1.1, 1.4, 2.1_
- [x] 2. Define the scope in `pipelines/innovation/config.py` (CPC codes, keywords, BU filters, caps)
  - _Requirements: 1.1_
- [x] 3. Implement the cached patent and inventor fetch
  - Reads the bulk tables from `data/raw/innovation/patentsview/` (`fetch_patents.py`), caching the selected subset. Skipped when the tables are absent.
  - _Requirements: 1.1, 1.4_
- [x] 4. Implement normalization to patent, person, and organization nodes, plus `INVENTED` and `ASSIGNED_TO` edges
  - _Requirements: 1.2, 1.3, 3.2, 3.3_
- [x] 5. Push the first small batch to `data/modules/innovation.json` for P2 and P4
  - NIH awards only, until the patent bulk tables are downloaded.
  - _Requirements: 4_
- [x] 6. (Stretch) Implement NIH and NSF award fetch and normalization, including `RECEIVED_AWARD` and `FUNDED_BY` edges
  - NIH done (`fetch_awards.py`). NSF not implemented (see task 1).
  - _Requirements: 2_
- [x] 7. Write fixture-based tests for normalization and the affiliation status rules
  - `tests/innovation/test_normalize.py`, `tests/innovation/test_fetch.py`
  - _Requirements: 1, 3_
- [x] 7.5 Write property-based tests for correctness properties N1–N5 in `design.md`
  - `tests/innovation/test_normalize_properties.py`
  - _Requirements: 1, 2, 3, 4_
- [ ] 8. Produce the final dataset, confirm the validator passes, and spot-check records by hand against their source URLs
  - Done for NIH: validator clean (0 errors, 0 warnings), and award R01DC022565 checked against the live NIH record. Still open: patents, once the bulk tables are downloaded.
  - _Requirements: 4_
