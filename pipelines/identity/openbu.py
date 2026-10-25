"""BU theses and dissertations from OpenBU (identity-resolution Req 1.1, 1.3).

OpenBU (https://open.bu.edu) is Boston University's DSpace repository. Its
"Boston University Theses & Dissertations" community (OAI set com_2144_898,
27,380 records on 2026-10-25) is harvested over OAI-PMH, the interface DSpace
provides for this purpose (robots.txt disallows only the website's search
pages). The `dim` metadata format carries the ETD degree fields:

  dc.contributor.author    "Last, First Middle"
  dc.identifier.orcid      the author's ORCID iD (some recent records)
  dc.date.issued           year of the degree
  dc.identifier.uri        https://hdl.handle.net/2144/<n> (the public record)
  etd.degree.name          e.g. "Doctor of Philosophy"
  etd.degree.level         doctoral | masters | bachelors
  etd.degree.discipline    e.g. "Biostatistics"
  etd.degree.grantor       "Boston University"

A thesis whose grantor is Boston University states that its author earned that
BU degree, so it is `bu_repository` evidence for `verified_alumnus`.
Pages are cached under data/raw/identity/openbu/<set>/ with a manifest.
"""

from __future__ import annotations

import json
import logging
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from pipelines.common.contract import REPO_ROOT
from pipelines.research.http import PoliteClient

from .orcid_education import ORCID_RE

log = logging.getLogger(__name__)

OAI_URL = "https://open.bu.edu/server/oai/request"
ETD_SET = "com_2144_898"
CACHE_DIR = REPO_ROOT / "data" / "raw" / "identity" / "openbu"

NS = {"oai": "http://www.openarchives.org/OAI/2.0/", "dim": "http://www.dspace.org/xmlns/dspace/dim"}
HANDLE_RE = re.compile(r"https?://hdl\.handle\.net/2144/\d+")


@dataclass(frozen=True)
class Thesis:
    handle_url: str
    author: str  # "First Middle Last"
    title: str
    degree: str
    level: str | None
    discipline: str | None
    year: int
    orcid: str | None
    advisors: tuple[str, ...]

    @property
    def handle_id(self) -> str:
        return self.handle_url.rsplit("/", 1)[-1]

    def note(self) -> str:
        parts = [self.degree, self.discipline, "Boston University", str(self.year)]
        return "OpenBU thesis/dissertation: " + ", ".join(p for p in parts if p) + f' ("{self.title}")'


def display_name(author: str) -> str:
    """'Doe, Jane Q.' -> 'Jane Q. Doe'. Names without a comma are kept as written."""
    author = re.sub(r"\s+", " ", author).strip().rstrip(",")
    if "," not in author:
        return author
    last, _, rest = author.partition(",")
    rest = re.sub(r",?\s*\d{4}-?(\d{4})?\.?$", "", rest).strip()  # drop life dates like ", 1925-"
    return f"{rest} {last.strip()}".strip()


def _fields(record: ET.Element) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    for field in record.iterfind(".//dim:field", NS):
        key = ".".join(x for x in (field.get("mdschema"), field.get("element"), field.get("qualifier")) if x)
        if field.text and field.text.strip():
            out.setdefault(key, []).append(field.text.strip())
    return out


def parse_record(record: ET.Element) -> Thesis | None:
    """A Thesis for a BU-granted degree with an author, year, and handle; otherwise None."""
    header = record.find("oai:header", NS)
    if header is not None and header.get("status") == "deleted":
        return None
    f = _fields(record)
    grantor = (f.get("etd.degree.grantor") or [""])[0]
    if not re.fullmatch(r"boston university\.?", grantor.strip(), re.IGNORECASE):
        return None
    authors = f.get("dc.contributor.author") or []
    handle = next((u for u in f.get("dc.identifier.uri", []) if HANDLE_RE.fullmatch(u)), None)
    degree = (f.get("etd.degree.name") or [""])[0]
    year_match = re.match(r"(\d{4})", (f.get("dc.date.issued") or [""])[0])
    if len(authors) != 1 or not handle or not degree or not year_match:
        return None
    orcid = None
    if f.get("dc.identifier.orcid"):
        m = ORCID_RE.search(f["dc.identifier.orcid"][0].upper())
        orcid = m.group(0) if m else None
    return Thesis(
        handle_url=handle.replace("http://", "https://"),
        author=display_name(authors[0]),
        title=(f.get("dc.title") or [""])[0],
        degree=degree,
        level=(f.get("etd.degree.level") or [None])[0],
        discipline=(f.get("etd.degree.discipline") or [None])[0],
        year=int(year_match.group(1)),
        orcid=orcid,
        advisors=tuple(display_name(a) for a in f.get("dc.contributor.advisor", [])),
    )


def parse_page(xml_text: str) -> tuple[list[Thesis], str | None, int]:
    """(theses, resumption token or None, records on the page)."""
    root = ET.fromstring(xml_text)
    error = root.find("oai:error", NS)
    if error is not None:
        if error.get("code") == "noRecordsMatch":
            return [], None, 0
        raise RuntimeError(f"OAI-PMH error {error.get('code')}: {error.text}")
    records = root.findall(".//oai:record", NS)
    theses = [t for t in (parse_record(r) for r in records) if t]
    token_el = root.find(".//oai:resumptionToken", NS)
    token = token_el.text.strip() if token_el is not None and token_el.text else None
    return theses, token, len(records)


def harvest_theses(
    client: PoliteClient | None = None,
    cache_dir: Path = CACHE_DIR,
    set_spec: str = ETD_SET,
    refresh: bool = False,
) -> tuple[list[Thesis], str]:
    """All BU-granted theses in the set, plus the harvest time (cached)."""
    cache = Path(cache_dir) / set_spec
    manifest_path = cache / "manifest.json"
    if manifest_path.exists() and not refresh:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        if manifest.get("complete"):
            theses: list[Thesis] = []
            for name in manifest["pages"]:
                theses.extend(parse_page((cache / name).read_text(encoding="utf-8"))[0])
            log.info("OpenBU: %d theses from cache %s", len(theses), cache)
            return theses, manifest["fetched_at"]

    cache.mkdir(parents=True, exist_ok=True)
    client = client or PoliteClient(interval=1.0, max_retries=5, timeout=120.0)
    fetched_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    params: dict = {"verb": "ListRecords", "metadataPrefix": "dim", "set": set_spec}
    pages: list[str] = []
    theses = []
    seen = 0
    while True:
        text = client.request("GET", OAI_URL, params=params).text
        name = f"page_{len(pages) + 1:04d}.xml"
        (cache / name).write_text(text, encoding="utf-8")
        pages.append(name)
        batch, token, count = parse_page(text)
        theses.extend(batch)
        seen += count
        if len(pages) % 25 == 0:
            log.info("OpenBU: %d pages, %d records, %d BU theses kept", len(pages), seen, len(theses))
        if not token:
            break
        params = {"verb": "ListRecords", "resumptionToken": token}
    manifest_path.write_text(json.dumps(
        {"set": set_spec, "fetched_at": fetched_at, "pages": pages, "records": seen, "complete": True}, indent=2
    ), encoding="utf-8")
    log.info("OpenBU: harvested %d records, kept %d BU theses", seen, len(theses))
    return theses, fetched_at
