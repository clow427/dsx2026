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
