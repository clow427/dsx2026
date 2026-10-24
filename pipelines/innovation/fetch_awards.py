"""Cached NIH RePORTER fetch (innovation-funding task 6, Req 2.1, 1.4).

Three cached steps, each under data/raw/innovation/nih/<query hash>/:

1. projects_*.json: BU projects matching the demo-topic text search, one page
   per request. NIH's org_names filter matches substrings, so projects whose
   organization is not exactly one of BU's names are dropped after fetching.
2. publications_*.json: the PubMed IDs NIH links to each core project.
3. openalex_pmid_*.json: OpenAlex works for those PubMed IDs, so a FUNDED_BY
   edge can target the publication's contract ID. Nothing is matched by title.

A complete cache (manifest with complete: true) is reused on reruns, so they
work offline. No API key is used for NIH; the OpenAlex key is never cached.
"""

from __future__ import annotations

import hashlib
import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from pipelines.research.http import PoliteClient

from .config import InnovationConfig

log = logging.getLogger(__name__)

PROJECT_FIELDS = (
    "ApplId",
    "ProjectNum",
    "CoreProjectNum",
    "FiscalYear",
    "ProjectTitle",
    "Organization",
    "PrincipalInvestigators",
    "AgencyIcAdmin",
    "AwardAmount",
    "ProjectStartDate",
    "ProjectEndDate",
    "ActivityCode",
    "ProjectDetailUrl",
)

PAGE_SIZE = 500  # NIH RePORTER maximum
MAX_OFFSET = 14_999  # NIH RePORTER rejects larger offsets
PUBLICATION_BATCH = 100  # core project numbers per publications request
OPENALEX_PMID_BATCH = 50  # OR-ed PubMed IDs per OpenAlex request


@dataclass
class AwardsFetchResult:
    projects: list[dict]
    # (core_project_num, pmid) links from NIH, as published
    publication_links: list[dict]
    # pmid (str) -> OpenAlex work {id, doi, display_name, publication_year}
    pmid_works: dict[str, dict]
    fetched_at: str
    from_cache: bool

    @property
    def retrieved_date(self) -> str:
        return self.fetched_at[:10]


def build_query(config: InnovationConfig) -> dict:
    return {
        "endpoint": "/projects/search",
        "criteria": {
            "org_names": list(config.nih_org_names),
            "fiscal_years": config.fiscal_years(),
            "advanced_text_search": {
                "operator": "or",
                "search_field": "projecttitle,terms,abstracttext",
                "search_text": config.nih_text_search(),
            },
        },
        "include_fields": list(PROJECT_FIELDS),
        "sort_field": "fiscal_year",
        "sort_order": "desc",
    }


def query_hash(query: dict) -> str:
    return hashlib.sha256(json.dumps(query, sort_keys=True).encode()).hexdigest()[:16]


def is_bu_project(project: dict, org_names: tuple[str, ...]) -> bool:
    name = ((project.get("organization") or {}).get("org_name") or "").strip().upper()
    return name in {n.upper() for n in org_names}


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _write(path: Path, payload: object) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


def _read_pages(cache_dir: Path, names: list[str], key: str) -> list:
    out: list = []
    for name in names:
        out.extend(json.loads((cache_dir / name).read_text(encoding="utf-8")).get(key) or [])
    return out


def _load_cache(cache_dir: Path) -> AwardsFetchResult | None:
    path = cache_dir / "manifest.json"
    if not path.exists():
        return None
    manifest = json.loads(path.read_text(encoding="utf-8"))
    if not manifest.get("complete"):
        return None
    return AwardsFetchResult(
        projects=_read_pages(cache_dir, manifest["project_pages"], "results"),
        publication_links=_read_pages(cache_dir, manifest["publication_pages"], "results"),
        pmid_works=_pmid_index(_read_pages(cache_dir, manifest["openalex_pages"], "results")),
        fetched_at=manifest["fetched_at"],
        from_cache=True,
    )


def _pmid_index(works: list[dict]) -> dict[str, dict]:
    index: dict[str, dict] = {}
    for work in works:
        pmid_url = (work.get("ids") or {}).get("pmid") or ""
        pmid = pmid_url.rstrip("/").rsplit("/", 1)[-1]
        if pmid.isdigit():
            index[pmid] = work
    return index


def _paged_search(client: PoliteClient, url: str, body: dict, cache_dir: Path, prefix: str) -> tuple[list, list[str]]:
    results: list = []
    pages: list[str] = []
    offset = 0
    while True:
        resp = client.request("POST", url, json={**body, "offset": offset, "limit": PAGE_SIZE})
        page = resp.json()
        name = f"{prefix}_{len(pages) + 1:04d}.json"
        _write(cache_dir / name, page)
        pages.append(name)
        batch = page.get("results") or []
        results.extend(batch)
        total = (page.get("meta") or {}).get("total", 0)
        offset += len(batch)
        log.info("NIH %s page %d: %d records (total %s)", prefix, len(pages), len(batch), total)
        if not batch or offset >= total:
            break
        if offset > MAX_OFFSET:
            log.warning("NIH %s: stopped at offset %d (API limit); narrow the query", prefix, offset)
            break
    return results, pages


def fetch_awards(
    config: InnovationConfig,
    client: PoliteClient | None = None,
    openalex_api_key: str | None = None,
    openalex_mailto: str | None = None,
    refresh: bool = False,
) -> AwardsFetchResult:
    query = build_query(config)
    cache_dir = Path(config.cache_dir) / "nih" / query_hash(query)

    if not refresh:
        cached = _load_cache(cache_dir)
        if cached is not None:
            log.info("Using cached NIH RePORTER responses in %s", cache_dir)
            return cached

    client = client or PoliteClient(
        interval=config.request_interval, max_retries=config.max_retries, timeout=config.timeout
    )
    cache_dir.mkdir(parents=True, exist_ok=True)
    fetched_at = _utc_now()

    body = {k: v for k, v in query.items() if k != "endpoint"}
    projects, project_pages = _paged_search(
        client, config.nih_base_url + query["endpoint"], body, cache_dir, "projects"
    )

    cores = sorted({p["core_project_num"] for p in projects if is_bu_project(p, config.nih_org_names)
                    and p.get("core_project_num")})
    links: list[dict] = []
    publication_pages: list[str] = []
    for i in range(0, len(cores), PUBLICATION_BATCH):
        batch_links, pages = _paged_search(
            client,
            config.nih_base_url + "/publications/search",
            {"criteria": {"core_project_nums": cores[i : i + PUBLICATION_BATCH]}},
            cache_dir,
            f"publications_{i // PUBLICATION_BATCH + 1:03d}",
        )
        links.extend(batch_links)
        publication_pages.extend(pages)

    credentials = {}
    if openalex_api_key:
        credentials["api_key"] = openalex_api_key
    if openalex_mailto:
        credentials["mailto"] = openalex_mailto
    pmids = sorted({str(link["pmid"]) for link in links if link.get("pmid")}, key=int)
    works: list[dict] = []
    openalex_pages: list[str] = []
    for i in range(0, len(pmids), OPENALEX_PMID_BATCH):
        batch = pmids[i : i + OPENALEX_PMID_BATCH]
        resp = client.request(
            "GET",
            f"{config.openalex_base_url}/works",
            params={
                "filter": "pmid:" + "|".join(batch),
                "select": "id,ids,doi,display_name,publication_year",
                "per-page": OPENALEX_PMID_BATCH,
                **credentials,
            },
        )
        page = resp.json()
        page.pop("meta", None)  # holds request details; not needed
        name = f"openalex_pmid_{len(openalex_pages) + 1:04d}.json"
        _write(cache_dir / name, page)
        openalex_pages.append(name)
        works.extend(page.get("results") or [])
    log.info("OpenAlex resolved %d of %d NIH-linked PubMed IDs", len(_pmid_index(works)), len(pmids))

    manifest = {
        "query": query,
        "fetched_at": fetched_at,
        "project_pages": project_pages,
        "publication_pages": publication_pages,
        "openalex_pages": openalex_pages,
        "complete": True,
    }
    (cache_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return AwardsFetchResult(projects, links, _pmid_index(works), fetched_at, False)
