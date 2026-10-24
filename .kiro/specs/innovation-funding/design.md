# Design: Innovation and Funding

Contract: #[[file:schema/graph.schema.json]]

## Layout (planned)

```
pipelines/innovation/
  config.py           # CPC codes / keywords, BU assignee and location filters, caps
  fetch_patents.py    # PatentsView client with cache under data/raw/innovation/
  fetch_awards.py     # NIH RePORTER / NSF (stretch)
  normalize.py
  run.py              # python -m pipelines.innovation.run
tests/innovation/
.env.example          # documents required keys (e.g. PATENTSVIEW_API_KEY) — never commit .env
```

## Kickoff checks (do these first)

- Confirm the current PatentsView access requirements (API key, endpoints, rate limits). If the API is blocked, fall back to PatentsView bulk downloads for a narrow slice of data.
- Confirm the NIH RePORTER and NSF query options. If neither works within the first 90 minutes, drop awards and record that decision in the README.

## Normalization

- Patent becomes `patent:uspto:<number>`, with attributes `grant_date`, `filing_date`, and `cpc_codes`.
- Inventor becomes `person:patentsview:<inventor_id>`, with an `INVENTED` edge (`source_record`, `high`).
- Assignee becomes `organization:ror:<id>` when a ROR match is known; otherwise `organization:patentsview:<assignee_id>`. Add an `ASSIGNED_TO` edge.
- Award becomes `award:nih:<project_num>` or `award:nsf:<award_id>`. PI becomes a source-level person with a `RECEIVED_AWARD` edge.
- Publications listed by an award become `FUNDED_BY` edges, but only when the publication ID or DOI is present in the source record.

## Hand-off to identity (P2)

Provide each inventor's or PI's name, location, and assignee or institution in `attributes`, so that P2 can block and score matches. Do not attempt to match people yourself.

## Correctness properties (planned)

Implement these as Hypothesis tests in `tests/innovation/test_normalize_properties.py`, reusing the oracle style of `tests/research/test_normalize_properties.py`.

| ID | Property: for any set of patent and award records… | Requirements |
|---|---|---|
| N1 | The emitted graph has zero validator errors | 4 |
| N2 | `INVENTED` edges are exactly the inventor listings, and `ASSIGNED_TO` edges are exactly the assignee listings, each with its patent record as evidence | 1.2, 1.3 |
| N3 | A `FUNDED_BY` edge exists **only** when the award record names the publication ID or DOI. Nothing is inferred from titles | 2 |
| N4 | No person from this module is `verified_alumnus`, and no person ID uses the `canonical` namespace | 3 |
| N5 | Normalizing the same input twice gives identical documents | 4 |
