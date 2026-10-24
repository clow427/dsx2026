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

## Risks and fallbacks

- **API throttling.** Cached pages keep reruns offline.
- **Topic too broad.** Tighten the filter by topic ID or year.
- **Too many authors.** The author cap and a cap on total work count keep the graph readable.
