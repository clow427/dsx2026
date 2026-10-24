# Design: Research Graph

Contract: #[[file:schema/graph.schema.json]]

## Layout (planned)

```
pipelines/research/
  config.py        # BU institution ID(s), topic filters, date range, caps, contact email
  fetch.py         # OpenAlex /works paging with cache under data/raw/research/
  enrich_s2.py     # optional Semantic Scholar enrichment by DOI
  normalize.py     # raw → nodes/edges using pipelines/common helpers
  run.py           # entry point: python -m pipelines.research.run
tests/research/    # fixture-based tests (recorded API responses)
```

## Data flow

1. **Config.** At kickoff, look up BU's OpenAlex institution ID and ROR ID and record them in `config.py`. Don't hardcode guessed IDs. Also record the topic or concept IDs that map to the demo topic.
2. **Fetch.** Query `/works`, filtered by institution, topic, and publication year, using cursor paging. Store each page as a cached JSON file.
3. **Normalize.**
   - Each work becomes a `publication:openalex:<Wid>` node, with `year`, `venue`, and `doi` as attributes.
   - Each authorship becomes a `person:openalex:<Aid>` node plus an `AUTHORED` edge.
   - Each authorship institution becomes an `organization:ror:<id>` node (falling back to `organization:openalex:<Iid>`) plus an `AFFILIATED_WITH` edge. The evidence is the work.
   - The work's primary and secondary topics become `topic:openalex:<Tid>` nodes plus `HAS_TOPIC` edges.
4. **Derive.** Group authors by work to produce `COAUTHORED_WITH` edges, skipping works with more than the author cap. Accumulate evidence across every shared work.
5. **Affiliation.** Set `bu_affiliation` according to Requirement 2.3 and 2.4.
6. **Emit.** Write sorted output, then run the validator.

## Hand-off to identity (P2)

Person nodes stay source-level (`person:openalex:*`). Include the ORCID in `attributes.orcid` when OpenAlex provides it, because it is the strongest signal for identity matching.

## Correctness properties

Each property is a Hypothesis test in `tests/research/test_normalize_properties.py`. The test checks the output against a small oracle computed from the generated OpenAlex-shaped works. The generator draws from fixed pools of fictional authors, institutions (including a BU child institution and a non-BU hospital), and topics, so that people recur across works. It also produces blank titles and unattributed authorships.

| ID | Property: for any set of works… | Requirements |
|---|---|---|
| R1 | The emitted graph has zero validator errors **and** zero warnings | 2, 5.2 |
| R2 | Publications are exactly the kept works (ID, non-blank title, at least one identified author). `AUTHORED` edges are exactly their identified authorships, each with that work as its only evidence | 2.1, 2.2, 5.1 |
| R3 | A person is `bu_affiliated_researcher` **iff** one of their kept authorships lists BU or a BU child institution, and the evidence is exactly those works. Otherwise the person is `unverified`. Never `verified_alumnus` | 2.3, 2.4 |
| R4 | A and B have one `COAUTHORED_WITH` edge **iff** they share a kept work with at most `cap` distinct authors. The evidence is exactly the shared works, and the endpoints are sorted | 3.1, 3.2 |
| R5 | Normalizing the same input twice gives identical documents | 1.3 (reruns), steering |
| R6 | S2 enrichment never adds or removes nodes or edges. It adds a `semantic_scholar` source only where S2 confirms the DOI, compared case-insensitively | 4.2 |

To check that these properties actually catch regressions, we ran four hand-made mutants of `normalize.py` against them: an off-by-one author cap, `verified_alumnus` instead of `bu_affiliated_researcher`, duplicate authorships counted twice, and blank titles kept. The properties caught all four.

## Risks and fallbacks

- **API throttling.** Cached pages keep reruns offline.
- **Topic too broad.** Tighten the filter by topic ID or year.
- **Too many authors.** The author cap keeps coauthor edges readable. An optional cap on total work count (`max_works`, off by default) is available if the topic filter is widened or removed.
- **Semantic Scholar throttling.** DOIs are sent in batches of 100, each cached separately, so a throttled batch is skipped and retried on the next run without losing the others.
