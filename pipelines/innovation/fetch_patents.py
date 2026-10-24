"""Patent records from the PatentsView bulk tables (innovation-funding task 3, Req 1.1, 1.4).

The PatentSearch API was retired on 2026-03-20 (see config.py), so this reads
the disambiguated bulk tables that USPTO now publishes on the Open Data Portal.
Put the files in data/raw/innovation/patentsview/ (gitignored), either as .tsv
or as the .tsv.zip they download as:

  g_patent, g_assignee_disambiguated, g_inventor_disambiguated, g_cpc_current  (required)
  g_application, g_location_disambiguated                                     (optional)

The tables are large (the inventor table is several GB unzipped), so each one
is streamed once and only rows for the selected patents are kept. Selection:
a patent is kept when an assignee organization matches BU_ASSIGNEE_PATTERN and,
if cpc_prefixes is set, any of its CPC codes starts with one of the prefixes.
The selected subset is cached as subset_<hash>.json so reruns skip the scan.

Columns are read by header name, so column order doesn't matter, and a missing
column raises an error that names the file and column instead of guessing.
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
import logging
import re
import sys
import zipfile
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator

from .config import PATENTSVIEW_TABLES, InnovationConfig

log = logging.getLogger(__name__)

REQUIRED_TABLES = ("patent", "assignee", "inventor", "cpc")

REQUIRED_COLUMNS = {
    "patent": ("patent_id", "patent_date", "patent_title"),
    "application": ("patent_id", "filing_date"),
    "inventor": ("patent_id", "inventor_sequence", "inventor_id",
                 "disambig_inventor_name_first", "disambig_inventor_name_last"),
    "assignee": ("patent_id", "assignee_sequence", "assignee_id", "disambig_assignee_organization"),
    "cpc": ("patent_id", "cpc_sequence", "cpc_group"),
    "location": ("location_id", "disambig_city", "disambig_state", "disambig_country"),
}

# Some cells (long titles, abstracts) exceed csv's default 128 KB field limit.
csv.field_size_limit(min(sys.maxsize, 2**31 - 1))


class MissingColumnError(ValueError):
    pass


@dataclass
class PatentsFetchResult:
    patents: list[dict]
    fetched_at: str  # when the bulk files were last modified (UTC), i.e. the data snapshot
    from_cache: bool
    source_files: dict[str, str]

    @property
    def retrieved_date(self) -> str:
        return self.fetched_at[:10]


def find_table(directory: Path, table: str) -> Path | None:
    base = PATENTSVIEW_TABLES[table]
    for name in (f"{base}.tsv", f"{base}.tsv.zip", f"{base}.zip"):
        path = directory / name
        if path.exists():
            return path
    return None


def available(config: InnovationConfig) -> bool:
    directory = Path(config.patentsview_dir)
    return all(find_table(directory, t) for t in REQUIRED_TABLES)


@contextmanager
def _open_text(path: Path) -> Iterator[io.TextIOBase]:
    if path.suffix == ".zip":
        with zipfile.ZipFile(path) as zf:
            members = [m for m in zf.namelist() if m.endswith(".tsv")]
            if len(members) != 1:
                raise ValueError(f"{path}: expected one .tsv inside, found {members}")
            with zf.open(members[0]) as raw:
                yield io.TextIOWrapper(raw, encoding="utf-8", newline="")
    else:
        with path.open(encoding="utf-8", newline="") as fh:
            yield fh


def iter_rows(path: Path, table: str) -> Iterator[dict]:
    """Yield rows as dicts, after checking that the table has the columns we read."""
    with _open_text(path) as fh:
        reader = csv.DictReader(fh, delimiter="\t", quoting=csv.QUOTE_MINIMAL)
        missing = [c for c in REQUIRED_COLUMNS[table] if c not in (reader.fieldnames or [])]
        if missing:
            raise MissingColumnError(f"{path.name}: missing column(s) {missing}; found {reader.fieldnames}")
        yield from reader


def _clean(value: str | None) -> str | None:
    value = (value or "").strip()
    return value if value and value.upper() not in ("NULL", "NAN", "NONE") else None


def _int(value: str | None) -> int:
    try:
        return int(float(value or 0))
    except ValueError:
        return 0


def cpc_code(row: dict) -> str | None:
    """CPC group as written by PatentsView, e.g. 'G16H50/20'."""
    return _clean(row.get("cpc_group"))


def cpc_matches(codes: list[str], prefixes: tuple[str, ...]) -> bool:
    if not prefixes:
        return True
    compact = [c.replace(" ", "").upper() for c in codes]
    return any(c.startswith(p.upper()) for c in compact for p in prefixes)


def select_patents(directory: Path, config: InnovationConfig) -> list[dict]:
    """Scan the bulk tables and assemble one record per selected patent."""
    bu = re.compile(config.bu_assignee_pattern, re.IGNORECASE)
    paths = {t: find_table(directory, t) for t in PATENTSVIEW_TABLES}

    # 1. BU patents, by assignee organization.
    bu_patents: set[str] = set()
    for row in iter_rows(paths["assignee"], "assignee"):
        org = _clean(row.get("disambig_assignee_organization"))
        if org and bu.search(org):
            bu_patents.add(row["patent_id"].strip())
    log.info("PatentsView: %d patents with a BU assignee", len(bu_patents))

    # 2. CPC codes for those patents, then the topic filter.
    cpcs: dict[str, list[tuple[int, str]]] = {}
    for row in iter_rows(paths["cpc"], "cpc"):
        pid = row["patent_id"].strip()
        code = cpc_code(row)
        if pid in bu_patents and code:
            cpcs.setdefault(pid, []).append((_int(row.get("cpc_sequence")), code))
    selected = {pid for pid in bu_patents if cpc_matches([c for _, c in cpcs.get(pid, [])], config.cpc_prefixes)}
    log.info("PatentsView: %d BU patents match CPC prefixes %s", len(selected), list(config.cpc_prefixes) or "(all)")

    # 3. Patent rows.
    patents: dict[str, dict] = {}
    for row in iter_rows(paths["patent"], "patent"):
        pid = row["patent_id"].strip()
        if pid not in selected or _clean(row.get("withdrawn")) in ("1", "True", "true"):
            continue
        record = {"patent_id": pid, "title": _clean(row.get("patent_title")), "grant_date": _clean(row.get("patent_date"))}
        kind = _clean(row.get("wipo_kind"))
        if kind:
            record["kind"] = kind
        record["cpc_codes"] = [c for _, c in sorted(set(cpcs.get(pid, [])))]
        record["inventors"] = []
        record["assignees"] = []
        patents[pid] = record

    if config.max_patents is not None:
        keep = sorted(patents.values(), key=lambda p: (p.get("grant_date") or "", p["patent_id"]), reverse=True)
        patents = {p["patent_id"]: p for p in keep[: config.max_patents]}

    # 4. Filing dates (optional table).
    if paths["application"]:
        for row in iter_rows(paths["application"], "application"):
            pid = row["patent_id"].strip()
            if pid in patents and _clean(row.get("filing_date")):
                patents[pid]["filing_date"] = _clean(row["filing_date"])

    # 5. Inventors and all assignees of the selected patents.
    location_ids: set[str] = set()
    for row in iter_rows(paths["inventor"], "inventor"):
        pid = row["patent_id"].strip()
        if pid not in patents:
            continue
        inv = {
            "inventor_id": _clean(row.get("inventor_id")),
            "sequence": _int(row.get("inventor_sequence")),
            "first": _clean(row.get("disambig_inventor_name_first")),
            "last": _clean(row.get("disambig_inventor_name_last")),
            "location_id": _clean(row.get("location_id")),
        }
        patents[pid]["inventors"].append(inv)
        if inv["location_id"]:
            location_ids.add(inv["location_id"])
    for row in iter_rows(paths["assignee"], "assignee"):
        pid = row["patent_id"].strip()
        if pid not in patents:
            continue
        asg = {
            "assignee_id": _clean(row.get("assignee_id")),
            "sequence": _int(row.get("assignee_sequence")),
            "organization": _clean(row.get("disambig_assignee_organization")),
            "location_id": _clean(row.get("location_id")),
        }
        patents[pid]["assignees"].append(asg)

    # 6. Inventor locations (optional table), for identity blocking hints.
    locations: dict[str, dict] = {}
    if paths["location"] and location_ids:
        for row in iter_rows(paths["location"], "location"):
            lid = _clean(row.get("location_id"))
            if lid in location_ids:
                locations[lid] = {k: v for k in ("city", "state", "country")
                                  if (v := _clean(row.get(f"disambig_{k}")))}
    for record in patents.values():
        record["inventors"].sort(key=lambda i: i["sequence"])
        record["assignees"].sort(key=lambda a: a["sequence"])
        for inv in record["inventors"]:
            loc = locations.get(inv.pop("location_id") or "")
            if loc:
                inv["location"] = loc
        for asg in record["assignees"]:
            asg.pop("location_id")

    return [patents[k] for k in sorted(patents)]


def _subset_key(config: InnovationConfig, paths: dict[str, Path | None]) -> str:
    stamp = {t: [p.name, p.stat().st_size, int(p.stat().st_mtime)] if p else None for t, p in paths.items()}
    key = {"files": stamp, "pattern": config.bu_assignee_pattern, "cpc": list(config.cpc_prefixes),
           "max": config.max_patents}
    return hashlib.sha256(json.dumps(key, sort_keys=True).encode()).hexdigest()[:16]


def fetch_patents(config: InnovationConfig, refresh: bool = False) -> PatentsFetchResult | None:
    """Selected patent records, or None when the required bulk tables are absent."""
    directory = Path(config.patentsview_dir)
    if not available(config):
        missing = [PATENTSVIEW_TABLES[t] for t in REQUIRED_TABLES if not find_table(directory, t)]
        log.warning("PatentsView bulk tables not found in %s (missing %s); skipping patents", directory, missing)
        return None

    paths = {t: find_table(directory, t) for t in PATENTSVIEW_TABLES}
    snapshot = max(p.stat().st_mtime for p in paths.values() if p)
    fetched_at = datetime.fromtimestamp(snapshot, timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    source_files = {t: p.name for t, p in paths.items() if p}

    cache = directory / f"subset_{_subset_key(config, paths)}.json"
    if cache.exists() and not refresh:
        log.info("Using cached PatentsView subset %s", cache)
        return PatentsFetchResult(json.loads(cache.read_text(encoding="utf-8")), fetched_at, True, source_files)

    patents = select_patents(directory, config)
    cache.write_text(json.dumps(patents, ensure_ascii=False), encoding="utf-8")
    return PatentsFetchResult(patents, fetched_at, False, source_files)
