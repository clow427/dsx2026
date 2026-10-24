# dsx2026: Alumni Network Graph

An evidence-backed, explorable map of Boston University's alumni and research network. It connects people to publications, patents, funding awards, organizations, and research topics, so students can discover relevant people to learn from. Every connection links back to a real source record. Verified alumni are clearly distinguished from BU-affiliated researchers, and uncertain identity matches are flagged instead of being silently merged.

> **Status:** The shared contract, validator, and research pipeline (P1) are implemented, and `data/modules/research.json` holds real OpenAlex data. The identity, innovation, merge, and frontend modules haven't been written yet.

## Demo journey

1. A BU student searches for a topic (proposed demo topic: **AI in healthcare**).
2. They explore a connected graph of people, papers, patents, awards, organizations, and topics.
3. They open a BU-linked researcher and see their affiliation status and its source records.
4. They click an edge to see the evidence for why it exists.
5. They filter the graph to research-only or patent-only connections.
6. **Find My People** returns a ranked, evidence-backed list of people to learn more about.

## Team and ownership

| Role | Owner | Spec | Output |
|---|---|---|---|
| P1: Research Graph (OpenAlex + Semantic Scholar) | _TBD_ | [`research-graph`](.kiro/specs/research-graph/) | `data/modules/research.json` |
| P2: Alumni Discovery & Identity, plus the merge step | _TBD_ | [`identity-resolution`](.kiro/specs/identity-resolution/) | `people.json`, `identity_matches.json`, `data/graph.json` |
| P3: Innovation & Funding (PatentsView + NIH/NSF) | _TBD_ | [`innovation-funding`](.kiro/specs/innovation-funding/) | `data/modules/innovation.json` |
| P4: Frontend & Product | _TBD_ | [`frontend-explorer`](.kiro/specs/frontend-explorer/) | Deployed web app |
| Shared: data contract and validation (P2 leads, all review) | All | [`shared-data-contract`](.kiro/specs/shared-data-contract/) | `schema/`, validator, tests |

## How the pieces fit

```
OpenAlex / S2 ─► P1 research.json ─┐
BU bios / curation ─► P2 people.json + identity_matches.json ─┼─► P2 merge ─► data/graph.json ─► P4 web app
PatentsView / NIH / NSF ─► P3 innovation.json ─┘
```

- **One shared format.** Every module emits files that conform to [`schema/graph.schema.json`](schema/graph.schema.json). Nobody invents a separate graph format.
- **P4 starts immediately.** The frontend builds against the fictional sample in [`data/mock/graph.sample.json`](data/mock/graph.sample.json), which covers every node type, every edge type, and one ambiguous identity.
- **Identity resolution is centralized.** Modules emit source-level people (`person:openalex:…`, `person:patentsview:…`). Only P2 mints canonical people (`person:canonical:…`), and the merge step collapses confirmed matches.

### Contract at a glance

- **Node types:** `person`, `publication`, `patent`, `award`, `organization`, `topic`
- **Node IDs:** `<type>:<namespace>:<local_id>`, for example `publication:openalex:W123` or `patent:uspto:US1234567B2`
- **Edge types:** `AUTHORED`, `COAUTHORED_WITH`, `INVENTED`, `ASSIGNED_TO`, `RECEIVED_AWARD`, `FUNDED_BY`, `AFFILIATED_WITH`, `HAS_TOPIC`, `SAME_AS_CANDIDATE`
- **Sources and evidence:** every node has at least one `sources` entry and every edge has at least one `evidence` entry. Each entry has a URL. Edges also carry a `confidence` (`high`/`medium`/`low`) and a `derivation` (`source_record`/`derived`/`identity_match`).
- **BU affiliation status** (required on every person): `verified_alumnus`, `bu_affiliated_researcher`, `unverified`, `ambiguous`

The full details are in [`.kiro/specs/shared-data-contract/design.md`](.kiro/specs/shared-data-contract/design.md).

## Repository layout

```
.kiro/
  steering/      product, data-integrity, architecture, data-contract (always loaded);
                 python-pipelines (pipelines/**), frontend (frontend/**)
  specs/         one spec per module + shared-data-contract (requirements → design → tasks)
  hooks/         validate-graph-data.json: runs the validator when data/**/*.json is saved
schema/          graph.schema.json, identity_matches.schema.json
data/
  mock/          graph.sample.json (fictional, example.org URLs)
  modules/       per-module outputs (generated)
  curation/      hand-curated people and review decisions (P2)
  raw/           API response caches (gitignored)
  graph.json     merged graph consumed by the frontend (generated)
pipelines/       common/, research/, identity/, innovation/, merge/   (Python, planned)
scripts/         validate_graph.py (planned)
tests/           contract/, research/, identity/, innovation/          (pytest, planned)
frontend/        React + TypeScript + Vite + Cytoscape.js app (planned)
brainstorm.md    original planning notes
```

## Proposed stack (confirm at kickoff)

- **Frontend:** React + TypeScript, built with Vite, with Cytoscape.js for the graph
- **Pipelines:** Python 3.11+, pytest, and `jsonschema`
- **Storage:** committed JSON files; no database
- **Deployment:** Vercel, as a static build with `graph.json`
- **AI:** stretch goal only. Evidence-grounded summaries of existing records; never used to create relationships.

## Working agreement

1. **Contract first.** Review and sign off on the shared contract (shared-data-contract task 1) before writing any pipeline code. Any later change to it requires agreement from all four owners and a `schema_version` bump.
2. **Spec-driven.** Work from your spec's `tasks.md`. Check off tasks as you finish them, and reference requirement numbers in your commits and PRs.
3. **Integrate early.** Push a small first batch of real records as soon as you have one. Don't wait until the end to merge.
4. **Branches:** use `p1/…`, `p2/…`, `p3/…`, and `p4/…` for feature work. Open small PRs into `main`, with at least one teammate reviewing each one.
5. **Data integrity rules** ([`.kiro/steering/data-integrity.md`](.kiro/steering/data-integrity.md)):
   - Missing data is allowed. Inventing data is not.
   - No automated LinkedIn scraping.
   - Store public, professional information only.
6. **Secrets:** put API keys in `.env` (gitignored) and document them in `.env.example`.

## Schedule (relative to hackathon start)

| Time | Milestone |
|---|---|
| T+0:00–0:20 | Agree on the user journey, stack, contract, and repo structure. Sign off on the shared contract. |
| T+0:20–1:50 | P1–P3 build ingestion and normalization. P4 builds the UI against the mock data. P2 builds the validator. |
| T+1:50–2:50 | Integrate real records, identity matching, the merge step, and graph interactions. |
| T+2:50–3:35 | Evidence panels, filters, error states, and one polished demo path. |
| T+3:35–4:35 | Deploy, test, record the demo video (under 3 minutes), and finish the README and submission. |

## Getting started

Setup commands will be added as each module is implemented.

```bash
uv venv --python 3.11 .venv && uv pip install --python .venv/bin/python -r pipelines/requirements.txt
cp .env.example .env            # optional: OPENALEX_API_KEY, OPENALEX_MAILTO, S2_API_KEY
.venv/bin/python -m pytest      # fixture-based tests, no network
```

- **Research pipeline:** `.venv/bin/python -m pipelines.research.run` writes `data/modules/research.json`. Raw API responses are cached in `data/raw/research/`, so reruns are offline and byte-identical. Flags: `--refresh`, `--skip-s2`, `--max-works N` (optional cap; by default every matching work is kept). The scope (BU institution, topics, years) lives in `pipelines/research/config.py`.
- **Other pipelines:** `python -m pipelines.<module>.run` (planned)
- **Validate:** `.venv/bin/python scripts/validate_graph.py data/mock/graph.sample.json data/modules/research.json`
- **Inspect data:** `.venv/bin/python scripts/inspect_graph.py examples` prints a summary plus a sample person, paper, coauthor edge, and topic, each with its evidence URLs. Other views: `person "<name>"`, `paper "<title>"`, `topic "<name>"`, `edge <edge-id>`, `summary`. Use `--file` to point it at another graph file.
- **Verify real output:** `.venv/bin/python -m pytest tests/research/test_research_output.py -v` checks `research.json` against the research-graph requirements, including a byte-identical rerun from the cache.
- **Frontend:** `cd frontend && npm install && npm run dev` (planned)

## Kiro usage (for the submission write-up)

Hackachusetts requires that `.kiro/` sit in the repo root and that the submission include a Kiro usage write-up. Each person logs concrete uses here as they happen.

| Who | Task | How Kiro helped | Outcome |
|---|---|---|---|
| Team | Project scaffolding | Turned the brainstorm into steering files, five specs, the JSON Schema contract, mock data, and a validation hook | This repo structure |
| P1 | Research graph pipeline, shared helpers, validator | Looked up BU's OpenAlex/ROR IDs and topic IDs live, implemented fetch → normalize → S2 enrichment → validate, wrote fixture tests, spot-checked 10 works against OpenAlex | `data/modules/research.json` (573 works, 4,147 people), 81 passing tests |
| P2 | | | |
| P3 | | | |
| P4 | | | |

## Data sources and ethics

Data comes from [OpenAlex](https://openalex.org), [Semantic Scholar](https://www.semanticscholar.org), [PatentsView](https://patentsview.org), [NIH RePORTER](https://reporter.nih.gov), [NSF Award Search](https://www.nsf.gov/awardsearch/), BU public pages, and permitted, user-supplied professional profile links. We don't scrape LinkedIn or bypass any access controls. Every fact in the graph links to its source.

## License

See [LICENSE](LICENSE).
