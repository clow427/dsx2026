"""Configuration for the research graph pipeline (research-graph task 1, Req 1.1).

IDs below were looked up against the live OpenAlex API on 2026-10-24:
  GET https://api.openalex.org/institutions?search=boston university
  GET https://api.openalex.org/topics?search=...
"""

from __future__ import annotations

from dataclasses import dataclass, field

from pipelines.common.contract import REPO_ROOT

OPENALEX_BASE_URL = "https://api.openalex.org"
S2_BASE_URL = "https://api.semanticscholar.org/graph/v1"

# Boston University in OpenAlex (https://openalex.org/I111088046), ROR 05qwgg493.
# Works are selected with the `lineage` filter, so BU's child institutions in
# OpenAlex (for example Framingham Heart Study, CTSI) count as BU. "Related"
# institutions such as affiliated hospitals are not children and do not count.
BU_OPENALEX_ID = "I111088046"
BU_ROR_ID = "05qwgg493"

# Demo topic: AI in healthcare. OpenAlex topic IDs (https://openalex.org/T...).
# A work matches if ANY of its (up to 3) topics is in this list. Set to an
# empty tuple to fetch BU works across all topics.
DEMO_TOPIC_IDS: tuple[str, ...] = (
    "T11396",  # Artificial Intelligence in Healthcare
    "T13702",  # Machine Learning in Healthcare
    "T10862",  # AI in cancer detection
    "T11710",  # Biomedical Text Mining and Ontologies
)

CACHE_DIR = REPO_ROOT / "data" / "raw" / "research"
OUTPUT_PATH = REPO_ROOT / "data" / "modules" / "research.json"


@dataclass(frozen=True)
class ResearchConfig:
    institution_id: str = BU_OPENALEX_ID
    topic_ids: tuple[str, ...] = DEMO_TOPIC_IDS
    from_year: int = 2000
    to_year: int = 2025
    # OpenAlex work types to keep. Conference papers are typed "article".
    work_types: tuple[str, ...] = ("article", "review")
    # Optional cap on works (Req 1.2). None keeps every matching work; the topic,
    # year, and type filters bound the dataset (578 works as of 2026-10-24).
    # If you clear the topic filter, set a cap: BU has 200k+ works in OpenAlex.
    max_works: int | None = None
    # Works with more distinct authors than this get AUTHORED edges but no
    # COAUTHORED_WITH edges (Req 3.2).
    max_authors_for_coauthor: int = 25
    # Seconds between API requests (OpenAlex allows more; we stay polite).
    request_interval: float = 0.2
    max_retries: int = 5
    timeout: float = 30.0
    openalex_base_url: str = OPENALEX_BASE_URL
    s2_base_url: str = S2_BASE_URL
    cache_dir: object = field(default=CACHE_DIR)
    output_path: object = field(default=OUTPUT_PATH)

    def openalex_filter(self) -> str:
        parts = [
            f"authorships.institutions.lineage:{self.institution_id}",
            f"publication_year:{self.from_year}-{self.to_year}",
            "is_retracted:false",
        ]
        if self.work_types:
            parts.append("type:" + "|".join(self.work_types))
        if self.topic_ids:
            parts.append("topics.id:" + "|".join(self.topic_ids))
        return ",".join(parts)
