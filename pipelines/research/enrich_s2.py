"""Optional Semantic Scholar enrichment by DOI (research-graph task 7, Req 4).

Adds a `semantic_scholar` source ref and `s2_citation_count` to publication
nodes whose DOI Semantic Scholar confirms. It never creates nodes or edges, and
it never adds abstracts (licensing).

DOIs are sent in batches, and each batch is cached on its own. A throttled or
failed batch is logged and skipped, so the rest still enrich the graph, and a
rerun only requests the batches that are missing from the cache.
"""

from __future__ import annotations

import hashlib
import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import requests

from pipelines.common.graph import GraphBuilder
from pipelines.common.sources import source_ref

from .config import ResearchConfig
from .http import PoliteClient

log = logging.getLogger(__name__)

# The documented maximum is 500. Smaller batches lose less when one is throttled.
BATCH_SIZE = 100
FIELDS = "paperId,url,citationCount,externalIds"


@dataclass
class EnrichStats:
    requested: int = 0
    matched: int = 0
    batches: int = 0
    failed_batches: int = 0
    cached_batches: int = 0

    @property
    def failed(self) -> bool:
        """True when no batch succeeded, so the graph is unchanged."""
        return self.batches > 0 and self.failed_batches == self.batches

    @property
    def from_cache(self) -> bool:
        return self.batches > 0 and self.cached_batches == self.batches


def _batch_cache_path(config: ResearchConfig, dois: list[str]) -> Path:
    digest = hashlib.sha256(json.dumps([FIELDS, dois]).encode()).hexdigest()[:16]
    return Path(config.cache_dir) / "s2" / f"batch_{digest}.json"


def _fetch_batch(dois: list[str], config: ResearchConfig, client: PoliteClient, api_key: str | None) -> dict:
    resp = client.request(
        "POST",
        f"{config.s2_base_url}/paper/batch",
        params={"fields": FIELDS},
        json={"ids": [f"DOI:{d}" for d in dois]},
        headers={"x-api-key": api_key} if api_key else {},
    )
    results = resp.json()
    if not isinstance(results, list) or len(results) != len(dois):
        raise ValueError("unexpected Semantic Scholar batch response shape")
    fetched_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    return {"fetched_at": fetched_at, "dois": dois, "results": results}


def enrich_with_s2(
    g: GraphBuilder,
    config: ResearchConfig,
    client: PoliteClient | None = None,
    api_key: str | None = None,
    refresh: bool = False,
) -> EnrichStats:
    pubs = [
        n for n in g.nodes.values() if n["type"] == "publication" and (n.get("attributes") or {}).get("doi")
    ]
    dois = sorted({n["attributes"]["doi"] for n in pubs})
    stats = EnrichStats(requested=len(dois))

    # DOI (lowercase) -> (S2 paper record, retrieved date)
    found: dict[str, tuple[object, str]] = {}
    for start in range(0, len(dois), BATCH_SIZE):
        chunk = dois[start : start + BATCH_SIZE]
        stats.batches += 1
        path = _batch_cache_path(config, chunk)
        try:
            if path.exists() and not refresh:
                payload = json.loads(path.read_text(encoding="utf-8"))
                stats.cached_batches += 1
            else:
                if client is None:
                    # Unauthenticated S2 shares a throttled pool: space requests out and back off longer.
                    client = PoliteClient(
                        interval=1.0 if api_key else 3.0, max_retries=3 if api_key else 5, timeout=config.timeout
                    )
                payload = _fetch_batch(chunk, config, client, api_key)
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        except (requests.RequestException, ValueError, OSError) as exc:
            stats.failed_batches += 1
            log.warning("Semantic Scholar batch %d skipped (%d DOIs): %s", stats.batches, len(chunk), exc)
            continue
        for doi, paper in zip(payload["dois"], payload["results"]):
            found[doi.lower()] = (paper, payload["fetched_at"][:10])

    for node in pubs:
        doi = node["attributes"]["doi"]
        paper, retrieved_at = found.get(doi.lower(), (None, None))
        if not isinstance(paper, dict) or not paper.get("paperId"):
            continue
        s2_doi = (paper.get("externalIds") or {}).get("DOI")
        if not s2_doi or s2_doi.lower() != doi.lower():
            continue  # Req 4.2: only enrich on a confirmed DOI match
        url = paper.get("url") or f"https://www.semanticscholar.org/paper/{paper['paperId']}"
        try:
            ref = source_ref(
                "semantic_scholar", url, record_id=paper["paperId"], retrieved_at=retrieved_at, note="Matched by DOI"
            )
        except ValueError:
            continue
        attrs = {"s2_citation_count": paper["citationCount"]} if isinstance(paper.get("citationCount"), int) else None
        g.add_node(node["id"], "publication", node["label"], [ref], attributes=attrs)
        stats.matched += 1
    return stats
