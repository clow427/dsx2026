"""Configuration for the innovation and funding pipeline (innovation-funding tasks 1-2, Req 1.1, 2.1).

Kickoff checks, run against the live services on 2026-10-24:

- PatentsView: the PatentSearch API (search.patentsview.org) was retired on
  2026-03-20 and its domain no longer resolves. The old S3 bulk files return 403.
  The same disambiguated tables are now published as bulk datasets on the USPTO
  Open Data Portal (https://data.uspto.gov), which needs a USPTO.gov API key.
  The patent step therefore reads those bulk TSV files from PATENTSVIEW_BULK_DIR
  and is skipped when they are absent. See pipelines/innovation/README.md.
- NIH RePORTER (https://api.reporter.nih.gov): open, no key. Used for awards.
- NSF Awards API: open, but it has no PI identifiers and its keyword search is
  loose (the top "machine learning ... health" hit for BU was a hardware
  precision grant). Dropped for now, as the design allows (Req 2 is NIH or NSF).

ROR IDs below were looked up on api.ror.org on 2026-10-24.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from pipelines.common.contract import REPO_ROOT

NIH_REPORTER_BASE_URL = "https://api.reporter.nih.gov/v2"
OPENALEX_BASE_URL = "https://api.openalex.org"

BU_ROR_ID = "05qwgg493"  # Boston University
NIH_ROR_ID = "01cwqze88"  # National Institutes of Health (the funder)

# NIH RePORTER organization names for Boston University. The API's org_names
# filter matches substrings ("BOSTON UNIVERSITY" also returns Tufts University
# Boston and UMass Boston), so projects are re-checked against this exact list.
BU_NIH_ORG_NAMES: tuple[str, ...] = (
    "BOSTON UNIVERSITY",
    "BOSTON UNIVERSITY (CHARLES RIVER CAMPUS)",
    "BOSTON UNIVERSITY MEDICAL CAMPUS",
)

# Demo topic: AI in healthcare (same theme as research-graph's DEMO_TOPIC_IDS).
# NIH RePORTER advanced text search, OR of quoted phrases over title, terms, and abstract.
NIH_SEARCH_PHRASES: tuple[str, ...] = (
    "artificial intelligence",
    "machine learning",
    "deep learning",
    "neural network",
    "natural language processing",
)

# PatentsView bulk tables (USPTO ODP). Files may be .tsv or .tsv.zip.
PATENTSVIEW_TABLES = {
    "patent": "g_patent",
    "application": "g_application",
    "inventor": "g_inventor_disambiguated",
    "assignee": "g_assignee_disambiguated",
    "cpc": "g_cpc_current",
    "location": "g_location_disambiguated",
}

# A patent is BU's when an assignee organization matches this (case-insensitive).
BU_ASSIGNEE_PATTERN = r"^(the )?trustees of boston university\b|^boston university\b"

# CPC prefixes for the demo topic. A BU patent is kept if ANY of its CPC codes
# starts with one of these. Empty tuple keeps every BU patent.
DEMO_CPC_PREFIXES: tuple[str, ...] = (
    "G16H",  # healthcare informatics
    "G06N",  # computing based on specific models (AI, ML)
    "G06V",  # image or video recognition
    "G06T7",  # image analysis
    "A61B5",  # measuring for diagnostic purposes
)

CACHE_DIR = REPO_ROOT / "data" / "raw" / "innovation"
PATENTSVIEW_BULK_DIR = CACHE_DIR / "patentsview"
RESEARCH_PATH = REPO_ROOT / "data" / "modules" / "research.json"
OUTPUT_PATH = REPO_ROOT / "data" / "modules" / "innovation.json"


@dataclass(frozen=True)
class InnovationConfig:
    nih_org_names: tuple[str, ...] = BU_NIH_ORG_NAMES
    nih_search_phrases: tuple[str, ...] = NIH_SEARCH_PHRASES
    from_fiscal_year: int = 2015
    to_fiscal_year: int = 2026
    # Optional cap on NIH awards (core projects), most recent first. None keeps all.
    max_awards: int | None = None
    bu_assignee_pattern: str = BU_ASSIGNEE_PATTERN
    cpc_prefixes: tuple[str, ...] = DEMO_CPC_PREFIXES
    # Optional cap on patents, most recent grant first. None keeps all.
    max_patents: int | None = None
    request_interval: float = 0.5
    max_retries: int = 5
    timeout: float = 60.0
    nih_base_url: str = NIH_REPORTER_BASE_URL
    openalex_base_url: str = OPENALEX_BASE_URL
    cache_dir: object = field(default=CACHE_DIR)
    patentsview_dir: object = field(default=PATENTSVIEW_BULK_DIR)
    research_path: object = field(default=RESEARCH_PATH)
    output_path: object = field(default=OUTPUT_PATH)

    def fiscal_years(self) -> list[int]:
        return list(range(self.from_fiscal_year, self.to_fiscal_year + 1))

    def nih_text_search(self) -> str:
        return " ".join(f'"{p}"' for p in self.nih_search_phrases)
