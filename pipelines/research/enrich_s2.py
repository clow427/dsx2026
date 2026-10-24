"""Optional Semantic Scholar enrichment by DOI (research-graph task 7, Req 4).

Adds a `semantic_scholar` source ref and `s2_citation_count` to publication
nodes whose DOI Semantic Scholar confirms. It never creates nodes or edges, and
it never adds abstracts (licensing). Any failure is logged and the graph is left
unchanged, so the pipeline still produces OpenAlex-only output.
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

BATCH_SIZE = 500  # documented maximum for POST /paper/batch
FIELDS = "paperId,url,citationCount,externalIds"


@dataclass
class EnrichStats:
    requested: int = 0
    matched: int = 0
    failed: bool = False
    from_cache: bool = False


def _cache_path(config: ResearchConfig, dois: list[str]) -> Path:
    digest = hashlib.sha256(json.dumps([FIELDS, dois]).encode()).hexdigest()[:16]
    return Path(config.cache_dir) / "s2" / f"batch_{digest}.json"


def _fetch_batches(dois: list[str], config: ResearchConfig, client: PoliteClient, api_key: str | None) -> list:
    headers = {"x-api-key": api_key} if api_key else {}
    results: list = []
    for start in range(0, len(dois), BATCH_SIZE):
        chunk = dois[start : start + BATCH_SIZE]
        resp = client.request(
            "POST",
            f"{config.s2_base_url}/paper/batch",
            params={"fields": FIELDS},
            json={"ids": [f"DOI:{d}" for d in chunk]},
            headers=headers,
        )
        page = resp.json()
        if not isinstance(page, list) or len(page) != len(chunk):
            raise ValueError("unexpected Semantic Scholar batch response shape")
        results.extend(page)
    return results


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
    if not dois:
        return stats

    cache = _cache_path(config, dois)
    try:
        if cache.exists() and not refresh:
            payload = json.loads(cache.read_text(encoding="utf-8"))
            stats.from_cache = True
        else:
            # S2 without a key is heavily throttled; give up quickly instead of stalling.
            client = client or PoliteClient(
                interval=1.0, max_retries=3 if api_key else 2, timeout=config.timeout
            )
            fetched_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
            payload = {"fetched_at": fetched_at, "dois": dois, "results": _fetch_batches(dois, config, client, api_key)}
            cache.parent.mkdir(parents=True, exist_ok=True)
            cache.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    except (requests.RequestException, ValueError, OSError) as exc:
        log.warning("Semantic Scholar enrichment skipped: %s", exc)
        stats.failed = True
        return stats

    retrieved_at = payload["fetched_at"][:10]
    by_doi = {d.lower(): r for d, r in zip(payload["dois"], payload["results"])}
    for node in pubs:
        doi = node["attributes"]["doi"]
        paper = by_doi.get(doi.lower())
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
