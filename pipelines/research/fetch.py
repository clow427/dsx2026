"""Cached OpenAlex /works fetch with cursor paging (research-graph task 2, Req 1.2-1.4).

Each query gets its own cache directory under data/raw/research/openalex/<hash>/
holding the raw response pages and a manifest. A complete cache is reused on
reruns so they work offline. The API key is never written to the cache.
"""

from __future__ import annotations

import hashlib
import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from .config import ResearchConfig
from .http import PoliteClient

log = logging.getLogger(__name__)

# Only the fields normalization needs, to keep responses (and API cost) small.
WORK_FIELDS = (
    "id",
    "doi",
    "display_name",
    "publication_year",
    "type",
    "primary_location",
    "authorships",
    "topics",
    "primary_topic",
    "cited_by_count",
)

MAX_PER_PAGE = 200

# OpenAlex list endpoints return at most this many authorships per work. Works at
# the limit are re-fetched individually, which returns the full author list.
LIST_AUTHORSHIP_LIMIT = 100


@dataclass
class FetchResult:
    works: list[dict]
    fetched_at: str  # ISO date-time (UTC) when the cached pages were fetched
    query: dict
    from_cache: bool

    @property
    def retrieved_date(self) -> str:
        return self.fetched_at[:10]


def build_query(config: ResearchConfig) -> dict:
    return {
        "endpoint": "/works",
        "filter": config.openalex_filter(),
        "sort": "cited_by_count:desc",
        "select": ",".join(WORK_FIELDS),
        "per-page": MAX_PER_PAGE if config.max_works is None else min(MAX_PER_PAGE, config.max_works),
        "max_works": config.max_works,
    }


def query_hash(query: dict) -> str:
    return hashlib.sha256(json.dumps(query, sort_keys=True).encode()).hexdigest()[:16]


def _load_cache(cache_dir: Path) -> FetchResult | None:
    manifest_path = cache_dir / "manifest.json"
    if not manifest_path.exists():
        return None
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if not manifest.get("complete"):
        return None
    works: list[dict] = []
    for name in manifest["pages"]:
        page = json.loads((cache_dir / name).read_text(encoding="utf-8"))
        works.extend(page.get("results", []))
    return FetchResult(works[: manifest["query"]["max_works"]], manifest["fetched_at"], manifest["query"], True)


def _complete_truncated_authorships(
    works: list[dict],
    cache_dir: Path,
    config: ResearchConfig,
    get_client,
    credentials: dict,
    select: str,
) -> int:
    """Replace works whose author list hit the list-endpoint limit with the full record.

    Full records are cached as full_<Wid>.json next to the pages. Returns the
    number of works that needed a live request.
    """
    fetched = 0
    for i, work in enumerate(works):
        if len(work.get("authorships") or []) < LIST_AUTHORSHIP_LIMIT:
            continue
        wid = (work.get("id") or "").rsplit("/", 1)[-1]
        if not wid:
            continue
        path = cache_dir / f"full_{wid}.json"
        if path.exists():
            full = json.loads(path.read_text(encoding="utf-8"))
        else:
            resp = get_client().request(
                "GET", f"{config.openalex_base_url}/works/{wid}", params={"select": select, **credentials}
            )
            full = resp.json()
            path.write_text(json.dumps(full, ensure_ascii=False), encoding="utf-8")
            fetched += 1
            log.info("Fetched full author list for %s: %d authorships", wid, len(full.get("authorships") or []))
        if full.get("id") == work.get("id"):
            works[i] = full
    return fetched


def fetch_works(
    config: ResearchConfig,
    client: PoliteClient | None = None,
    api_key: str | None = None,
    mailto: str | None = None,
    refresh: bool = False,
) -> FetchResult:
    query = build_query(config)
    cache_dir = Path(config.cache_dir) / "openalex" / query_hash(query)

    credentials = {}
    if api_key:
        credentials["api_key"] = api_key
    if mailto:
        credentials["mailto"] = mailto

    def get_client() -> PoliteClient:
        nonlocal client
        if client is None:
            client = PoliteClient(
                interval=config.request_interval, max_retries=config.max_retries, timeout=config.timeout
            )
        return client

    if not refresh:
        cached = _load_cache(cache_dir)
        if cached is not None:
            log.info("Using cached OpenAlex pages in %s (%d works)", cache_dir, len(cached.works))
            _complete_truncated_authorships(cached.works, cache_dir, config, get_client, credentials, query["select"])
            return cached

    cache_dir.mkdir(parents=True, exist_ok=True)
    for stale in cache_dir.glob("full_*.json"):
        stale.unlink()  # full records belong to the previous fetch
    fetched_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

    params = {k: v for k, v in query.items() if k not in ("endpoint", "max_works")}
    params.update(credentials)

    url = config.openalex_base_url + query["endpoint"]
    works: list[dict] = []
    pages: list[str] = []
    cursor = "*"
    total = None
    while cursor and (config.max_works is None or len(works) < config.max_works):
        resp = get_client().request("GET", url, params={**params, "cursor": cursor})
        page = resp.json()
        name = f"page_{len(pages) + 1:04d}.json"
        (cache_dir / name).write_text(json.dumps(page, ensure_ascii=False), encoding="utf-8")
        pages.append(name)

        results = page.get("results", [])
        works.extend(results)
        total = page.get("meta", {}).get("count", total)
        cursor = page.get("meta", {}).get("next_cursor")
        log.info("Fetched OpenAlex page %d: %d works (total matching: %s)", len(pages), len(results), total)
        if not results:
            break

    manifest = {
        "query": query,
        "fetched_at": fetched_at,
        "pages": pages,
        "matching_works": total,
        "complete": True,
    }
    (cache_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    works = works[: config.max_works]
    _complete_truncated_authorships(works, cache_dir, config, get_client, credentials, query["select"])
    return FetchResult(works, fetched_at, query, False)
