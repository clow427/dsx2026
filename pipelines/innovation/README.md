# Innovation and funding pipeline (P3)

Builds `data/modules/innovation.json`: NIH awards to Boston University in the demo topic (AI in healthcare), and patents assigned to BU when the PatentsView bulk tables are available. Spec: `.kiro/specs/innovation-funding/`.

```bash
python -m pipelines.innovation.run            # NIH (live, then cached) + patents if bulk tables are present
python -m pipelines.innovation.run --refresh  # ignore caches
python -m pipelines.identity.run --step match && python -m pipelines.merge.run   # fold it into data/graph.json
```

## Sources

| Source | Status | What it produces |
|---|---|---|
| NIH RePORTER (`api.reporter.nih.gov`) | Live, no key | `award:nih:<core project>`, PIs as `person:nih:<profile_id>`, `RECEIVED_AWARD`, `FUNDED_BY` award → NIH, `FUNDED_BY` publication → award |
| PatentsView bulk tables (USPTO Open Data Portal) | Needs files you download (below) | `patent:uspto:US<number><kind>`, inventors as `person:patentsview:<inventor_id>`, assignees, `INVENTED`, `ASSIGNED_TO` |
| NSF Awards API | Not used | It has no PI identifiers, and its keyword search was too loose for the topic (checked 2026-10-24) |

### Why patents need a manual download

The PatentSearch API (`search.patentsview.org`) was retired on 2026-03-20, and the old S3 bulk files now return 403. USPTO publishes the same disambiguated tables as bulk datasets on the Open Data Portal (<https://data.uspto.gov>), which requires a USPTO.gov account and an ODP API key.

To add patents, download these PatentsView tables from ODP into `data/raw/innovation/patentsview/` (gitignored). Leave them as `.tsv.zip` or unzip them to `.tsv`:

- Required: `g_patent`, `g_assignee_disambiguated`, `g_inventor_disambiguated`, `g_cpc_current`
- Optional: `g_application` (filing dates), `g_location_disambiguated` (inventor city/state for identity matching)

Then rerun the pipeline. The first scan streams the full tables once, which takes a few minutes. Later runs reuse `subset_<hash>.json`. If USPTO renames a column, the run stops with an error naming the file and the column.

## Rules applied

- **Scope:** NIH projects whose awardee is exactly one of BU's NIH organization names. NIH's `org_names` filter matches substrings and also returns Tufts University Boston and UMass Boston, so those projects are dropped. Fiscal years 2015–2026; title, terms, or abstract mention AI, ML, deep learning, neural networks, or NLP. Patents: a BU assignee plus a CPC code under `G16H`, `G06N`, `G06V`, `G06T7`, or `A61B5` (see `config.py`).
- **BU affiliation (Req 3.2):** `bu_affiliated_researcher` only for the *contact* PI of a BU project (NIH lists the awardee organization for the contact PI only), or for an inventor on a patent assigned to BU. Everyone else is `unverified`. No one is ever `verified_alumnus`.
- **Funding links (N3):** a publication → award `FUNDED_BY` edge exists only when NIH lists the PubMed ID under that award and OpenAlex resolves the PubMed ID to a work. Nothing is matched by title. By default only publications already in `research.json` are kept (`--all-publications` keeps every resolved work).
- **No cross-module person links (Req 3.1):** PIs and inventors stay source-level. The identity module matches them using the `attributes` provided here: `nih_profile_id`, `institutions`, `location`, and `assignees`.
- **Award amounts:** `amount_usd` is the latest fiscal year's award as NIH states it, not a total.

## Known gaps

- Awards have no `HAS_TOPIC` edges, because NIH doesn't assign OpenAlex topics. That means Find My People (which ranks by record → topic edges) doesn't count awards yet. They do show in the explorer and in detail panels.
