---
inclusion: fileMatch
fileMatchPattern: 'pipelines/**'
---

# Python Pipeline Conventions

- Use Python 3.11+. Keep each module's dependencies in `pipelines/requirements.txt` with pinned versions.
- Each module exposes a single entry point: `python -m pipelines.<module>.run`.
- Pipeline stages are fetch, cache, normalize, emit:
  - **Fetch**: call the source APIs politely. Respect documented rate limits, and send a contact email where the API supports it (for example, the OpenAlex `mailto` parameter).
  - **Cache**: save raw responses under `data/raw/<module>/`, which is gitignored, so reruns don't hit the APIs again.
  - **Normalize**: convert raw records into contract nodes and edges, using the shared helpers in `pipelines/common/` for IDs, source references, and file writing.
  - **Emit**: write `data/modules/<module>.json`, sorted by `id`, so that reruns produce identical diffs.
- Every emitted node and edge carries provenance (`sources` / `evidence`) built from the raw record it came from.
- Never fabricate fields. If a value is missing, leave the key out.
- Read API keys from environment variables only. Document them in `.env.example`; never commit `.env`.
- Run the validator before committing output: `python scripts/validate_graph.py data/modules/<module>.json`.
- Name tests `tests/<module>/test_*.py`. Use recorded fixtures, not live API calls.
