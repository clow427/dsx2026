"""Cached fetches for person profiles (public ORCID records and OpenAlex author records).

- ORCID public API, per iD: /person (biography, keywords, researcher URLs) and
  /employments (positions). Cached as data/raw/profiles/orcid/<iD>.{person,employments}.json.
  Deactivated or locked records (404/409/410) are cached as empty.
- OpenAlex /authors, 50 IDs per request (filter=openalex_id:A1|A2|...). Cached per
  author as data/raw/profiles/openalex/<A id>.json.

Reruns read the cache and need no network. API keys are never written to the cache.
"""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path

import requests

from pipelines.common.contract import REPO_ROOT
from pipelines.research.http import PoliteClient

log = logging.getLogger(__name__)

CACHE_DIR = REPO_ROOT / "data" / "raw" / "profiles"
ORCID_API = "https://pub.orcid.org/v3.0"
OPENALEX_API = "https://api.openalex.org"
ORCID_RE = re.compile(r"\d{4}-\d{4}-\d{4}-\d{3}[\dX]")
OPENALEX_AUTHOR_RE = re.compile(r"A\d+")
OPENALEX_BATCH = 50
AUTHOR_FIELDS = "id,display_name,works_count,cited_by_count,summary_stats,last_known_institutions,topics"


def _client(interval: float) -> PoliteClient:
    client = PoliteClient(interval=interval, max_retries=5, timeout=30.0)
    client.session.headers["Accept"] = "application/json"
    return client


def fetch_orcid(
    orcids: list[str], client: PoliteClient | None = None, cache_dir: Path = CACHE_DIR, refresh: bool = False
) -> dict[str, dict]:
    """ORCID iD -> {"person": {...}, "employments": {...}}."""
    cache = Path(cache_dir) / "orcid"
    cache.mkdir(parents=True, exist_ok=True)
    out: dict[str, dict] = {}
    fetched = 0
    for orcid in orcids:
        if not ORCID_RE.fullmatch(orcid):
            continue
        record: dict = {}
        for part in ("person", "employments"):
            path = cache / f"{orcid}.{part}.json"
            if path.exists() and not refresh:
                record[part] = json.loads(path.read_text(encoding="utf-8"))
                continue
            client = client or _client(0.1)  # ORCID allows 24 requests/second
            try:
                payload = client.request("GET", f"{ORCID_API}/{orcid}/{part}", headers={"Accept": "application/json"}).json()
            except requests.HTTPError as exc:
                if getattr(exc.response, "status_code", None) not in (404, 409, 410):
                    raise
                payload = {}
            path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
            record[part] = payload
            fetched += 1
            if fetched % 500 == 0:
                log.info("ORCID: %d requests so far", fetched)
        out[orcid] = record
    log.info("ORCID: %d records (%d requests live)", len(out), fetched)
    return out


def fetch_openalex_authors(
    author_ids: list[str],
    client: PoliteClient | None = None,
    cache_dir: Path = CACHE_DIR,
    refresh: bool = False,
    api_key: str | None = None,
    mailto: str | None = None,
) -> dict[str, dict]:
    """OpenAlex author ID (A...) -> author record. IDs OpenAlex doesn't return are cached as empty."""
    cache = Path(cache_dir) / "openalex"
    cache.mkdir(parents=True, exist_ok=True)
    ids = sorted({a for a in author_ids if OPENALEX_AUTHOR_RE.fullmatch(a)})
    out: dict[str, dict] = {}
    todo = []
    for a in ids:
        path = cache / f"{a}.json"
        if path.exists() and not refresh:
            out[a] = json.loads(path.read_text(encoding="utf-8"))
        else:
            todo.append(a)
    credentials = {k: v for k, v in (("api_key", api_key), ("mailto", mailto)) if v}
    for i in range(0, len(todo), OPENALEX_BATCH):
        batch = todo[i : i + OPENALEX_BATCH]
        client = client or _client(0.2)
        page = client.request(
            "GET",
            f"{OPENALEX_API}/authors",
            params={"filter": "openalex_id:" + "|".join(batch), "select": AUTHOR_FIELDS, "per-page": OPENALEX_BATCH, **credentials},
        ).json()
        found = {r["id"].rsplit("/", 1)[-1]: r for r in page.get("results") or [] if r.get("id")}
        for a in batch:
            record = found.get(a, {})
            (cache / f"{a}.json").write_text(json.dumps(record, ensure_ascii=False), encoding="utf-8")
            out[a] = record
    log.info("OpenAlex: %d authors (%d fetched live)", len(out), len(todo))
    return out
