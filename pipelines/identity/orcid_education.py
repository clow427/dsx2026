"""BU degrees from public ORCID education records (identity-resolution Req 1.1, 1.3).

For each ORCID iD found on a source-level person, fetch the public education
summaries (``GET https://pub.orcid.org/v3.0/<orcid>/educations``) and keep the
entries that state a completed Boston University degree:

  - the organization is Boston University (ROR 05qwgg493, or a name that is
    "Boston University" or one of its schools; see ``is_bu_organization``),
  - ``role-title`` names a degree (``DEGREE_RE``; postdocs, fellowships,
    residencies, and certificates are not degrees), and
  - ``end-date`` has a year that is not in the future.

An ORCID record is a public professional profile maintained by the person (or,
for some entries, asserted by an institution), so evidence uses
``source: user_submitted`` with the record URL, as in data/curation/people.yaml.
Each response is cached as data/raw/identity/orcid/<orcid>.json.
"""

from __future__ import annotations

import datetime as _dt
import json
import logging
import re
from dataclasses import dataclass
from pathlib import Path

import requests

from pipelines.common.contract import REPO_ROOT
from pipelines.research.http import PoliteClient

log = logging.getLogger(__name__)

ORCID_API = "https://pub.orcid.org/v3.0"
CACHE_DIR = REPO_ROOT / "data" / "raw" / "identity" / "orcid"
ORCID_RE = re.compile(r"\d{4}-\d{4}-\d{4}-\d{3}[\dX]")

BU_ROR = "https://ror.org/05qwgg493"
# "Boston University" and its degree-granting schools and colleges. Hospitals
# ("Boston University Medical Center") and other institutions are not degree grantors.
BU_NAME_RE = re.compile(
    r"^(the )?(trustees of )?boston university"
    r"(\s*[-,:(]?\s*(school|college|graduate|questrom|metropolitan|wheelock|sargent|pardee|frederick|goldman|"
    r"henry m\. goldman|chobanian|avedisian|bu |division|department|faculty|kilachand|university professors|"
    r"medical campus)\b.*)?$",
    re.IGNORECASE,
)

# Degree titles. Matched against role-title as a whole word, case-insensitive.
DEGREE_RE = re.compile(
    r"\b(ph\.?\s?d|d\.?\s?phil|doctor(ate)?( of)?|sc\.?\s?d|d\.?\s?sc|ed\.?\s?d|dr\.?\s?p\.?\s?h|d\.?\s?p\.?\s?h|"
    r"m\.?\s?d|d\.?\s?m\.?\s?d|d\.?\s?d\.?\s?s|pharm\.?\s?d|j\.?\s?d|ll\.?\s?m|d\.?\s?p\.?\s?t|o\.?\s?t\.?\s?d|"
    r"master(s|'s)?( of)?|m\.?\s?s\.?\s?[ce]?|m\.?\s?a|m\.?\s?b\.?\s?a|m\.?\s?p\.?\s?h|m\.?\s?eng|m\.?\s?ed|m\.?\s?s\.?\s?w|"
    r"m\.?\s?fa|m\.?\s?m|m\.?\s?p\.?\s?a|m\.?\s?u\.?\s?p|"
    r"bachelor(s|'s)?( of)?|b\.?\s?s\.?\s?c?|b\.?\s?a|b\.?\s?eng|b\.?\s?fa|b\.?\s?m)\b",
    re.IGNORECASE,
)
NOT_DEGREE_RE = re.compile(
    r"post-?doc|fellow|residen|intern\b|internship|visiting|certificate|trainee|research (assistant|associate|scientist)|"
    r"professor|lecturer|faculty|candidate|student|exchange|course|summer",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class OrcidDegree:
    orcid: str
    degree: str
    year: int
    organization: str
    department: str | None
    asserted_by: str | None  # source-name from ORCID (the person, or an institution)
    put_code: str | None

    @property
    def url(self) -> str:
        return f"https://orcid.org/{self.orcid}"

    def note(self) -> str:
        parts = [self.degree, self.department, self.organization, str(self.year)]
        text = "ORCID education entry: " + ", ".join(p for p in parts if p)
        if self.asserted_by:
            text += f" (source: {self.asserted_by})"
        return text


def is_bu_organization(org: dict) -> bool:
    disamb = org.get("disambiguated-organization") or {}
    if (disamb.get("disambiguation-source") or "").upper() == "ROR" and (
        disamb.get("disambiguated-organization-identifier") or ""
    ).rstrip("/") == BU_ROR:
        return True
    return bool(BU_NAME_RE.match((org.get("name") or "").strip()))


def is_degree(role: str | None) -> bool:
    role = (role or "").strip()
    return bool(role) and bool(DEGREE_RE.search(role)) and not NOT_DEGREE_RE.search(role)


def _year(date: dict | None) -> int | None:
    value = ((date or {}).get("year") or {}).get("value")
    return int(value) if value and str(value).isdigit() else None


def bu_degrees(orcid: str, educations: dict, this_year: int | None = None) -> list[OrcidDegree]:
    """BU degrees stated in an ORCID /educations response, oldest first."""
    this_year = this_year or _dt.date.today().year
    out: list[OrcidDegree] = []
    for group in educations.get("affiliation-group") or []:
        for summary in group.get("summaries") or []:
            edu = summary.get("education-summary") or {}
            org = edu.get("organization") or {}
            year = _year(edu.get("end-date"))
            if not is_bu_organization(org) or not is_degree(edu.get("role-title")):
                continue
            if year is None or year > this_year:
                continue  # no completion year, or not finished yet: not a stated degree
            out.append(OrcidDegree(
                orcid=orcid,
                degree=edu["role-title"].strip(),
                year=year,
                organization=(org.get("name") or "").strip(),
                department=(edu.get("department-name") or "").strip() or None,
                asserted_by=((edu.get("source") or {}).get("source-name") or {}).get("value"),
                put_code=str(edu["put-code"]) if edu.get("put-code") is not None else None,
            ))
    return sorted(out, key=lambda d: (d.year, d.degree))


def fetch_educations(
    orcids: list[str],
    client: PoliteClient | None = None,
    cache_dir: Path = CACHE_DIR,
    refresh: bool = False,
) -> dict[str, dict]:
    """ORCID -> /educations response. Cached per ORCID; 404s are cached as empty."""
    cache_dir = Path(cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)
    out: dict[str, dict] = {}
    fetched = 0
    for orcid in orcids:
        if not ORCID_RE.fullmatch(orcid):
            continue
        path = cache_dir / f"{orcid}.json"
        if path.exists() and not refresh:
            out[orcid] = json.loads(path.read_text(encoding="utf-8"))
            continue
        if client is None:
            # ORCID's public API allows 24 requests/second; stay well under it.
            client = PoliteClient(interval=0.1, max_retries=5, timeout=30.0)
            client.session.headers["Accept"] = "application/json"
        try:
            payload = client.request("GET", f"{ORCID_API}/{orcid}/educations",
                                     headers={"Accept": "application/json"}).json()
        except requests.HTTPError as exc:
            if getattr(exc.response, "status_code", None) not in (404, 409, 410):
                raise
            payload = {}  # deactivated, deprecated, or locked record
        path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        out[orcid] = payload
        fetched += 1
        if fetched % 250 == 0:
            log.info("ORCID: fetched %d records (%d of %d done)", fetched, len(out), len(orcids))
    log.info("ORCID: %d records (%d fetched live)", len(out), fetched)
    return out
