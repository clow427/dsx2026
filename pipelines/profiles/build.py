"""Person profiles: what to show on a person's card beyond the graph itself.

Built from two public sources and attached to person nodes as ``attributes.profile``:

  ORCID (the person's own public record; evidence ``user_submitted``, as in curation)
    position    current employment (an entry with no end date): title, organization, department
    biography   the person's own biography text
    keywords    the person's own research keywords
    links       the person's own websites (lab page, faculty page, BU Profiles, ...)
  OpenAlex (author record; evidence ``openalex``)
    metrics     works, citations, h-index, i10-index (all time, across all of OpenAlex)
    institutions  last known institutions
    topics      top research topics

Profiles are keyed by ORCID iD and OpenAlex author ID, not by graph node ID, so they
reattach to the right person after every merge (canonical IDs absorb source records).
``data/modules/profiles.json`` holds them; ``apply_profiles`` writes them onto a graph.

Nothing is inferred: fields a source doesn't state are left out, and email addresses or
postal addresses in ORCID records are never read.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path

from pipelines.common.contract import REPO_ROOT
from pipelines.common.sources import is_http_url, merge_refs, source_ref

PROFILES_PATH = REPO_ROOT / "data" / "modules" / "profiles.json"
PROFILES_VERSION = 1
MAX_BIO = 700
MAX_LINKS = 6
MAX_KEYWORDS = 8
MAX_TOPICS = 3
MAX_INSTITUTIONS = 3


@dataclass
class ProfileStats:
    orcid_records: int = 0
    with_position: int = 0
    with_bio: int = 0
    with_links: int = 0
    openalex_authors: int = 0
    applied: int = 0
    skipped: dict = field(default_factory=dict)


def _text(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    value = re.sub(r"\s+", " ", value).strip()
    return value or None


def _year(date: dict | None) -> int | None:
    value = ((date or {}).get("year") or {}).get("value")
    return int(value) if value and str(value).isdigit() else None


def orcid_profile(orcid: str, record: dict) -> dict:
    """Profile fields stated in an ORCID record ({"person": ..., "employments": ...})."""
    out: dict = {}
    person = record.get("person") or {}
    employments = record.get("employments") or {}

    current = []
    for group in employments.get("affiliation-group") or []:
        for summary in group.get("summaries") or []:
            emp = summary.get("employment-summary") or {}
            org = _text((emp.get("organization") or {}).get("name"))
            if not org or emp.get("end-date"):
                continue  # only positions the record states as current
            current.append((_year(emp.get("start-date")) or 0, emp, org))
    if current:
        start, emp, org = max(current, key=lambda x: x[0])
        position = {"organization": org}
        if _text(emp.get("role-title")):
            position["title"] = _text(emp["role-title"])
        if _text(emp.get("department-name")):
            position["department"] = _text(emp["department-name"])
        if start:
            position["since"] = start
        out["position"] = position

    bio = _text((person.get("biography") or {}).get("content"))
    if bio:
        out["biography"] = bio if len(bio) <= MAX_BIO else bio[: MAX_BIO - 1].rsplit(" ", 1)[0] + "…"

    keywords = []
    for k in (person.get("keywords") or {}).get("keyword") or []:
        # People often put several keywords in one entry, separated by commas or semicolons.
        for part in re.split(r"[;,]", k.get("content") or ""):
            part = _text(part)
            if part and part.lower() not in {x.lower() for x in keywords}:
                keywords.append(part)
    if keywords:
        out["keywords"] = keywords[:MAX_KEYWORDS]

    links = []
    for u in (person.get("researcher-urls") or {}).get("researcher-url") or []:
        url = ((u.get("url") or {}).get("value") or "").strip()
        if not is_http_url(url) or any(l["url"] == url for l in links):
            continue
        links.append({"label": _text(u.get("url-name")) or _host(url), "url": url})
    if links:
        out["links"] = links[:MAX_LINKS]
    return out


def _host(url: str) -> str:
    return re.sub(r"^https?://(www\.)?", "", url).split("/")[0]


def openalex_profile(author: dict) -> dict:
    """Profile fields from an OpenAlex author record."""
    out: dict = {}
    stats = author.get("summary_stats") or {}
    metrics = {}
    for key, value in (("works", author.get("works_count")), ("citations", author.get("cited_by_count")),
                       ("h_index", stats.get("h_index")), ("i10_index", stats.get("i10_index"))):
        if isinstance(value, int):
            metrics[key] = value
    if metrics:
        out["metrics"] = metrics
    institutions = []
    for inst in author.get("last_known_institutions") or []:
        name = _text(inst.get("display_name"))
        if name and name not in institutions:
            institutions.append(name)
    if institutions:
        out["institutions"] = institutions[:MAX_INSTITUTIONS]
    topics = [t for t in (_text(x.get("display_name")) for x in author.get("topics") or []) if t]
    if topics:
        out["topics"] = topics[:MAX_TOPICS]
    return out


def build_profiles(orcid_records: dict[str, dict], authors: dict[str, dict], retrieved_at: str) -> tuple[dict, ProfileStats]:
    """The profiles.json document: {"orcid": {iD: fields}, "openalex": {A id: fields}}."""
    stats = ProfileStats()
    by_orcid = {}
    for orcid, record in sorted(orcid_records.items()):
        fields = orcid_profile(orcid, record)
        if not fields:
            continue
        stats.orcid_records += 1
        stats.with_position += "position" in fields
        stats.with_bio += "biography" in fields
        stats.with_links += "links" in fields
        by_orcid[orcid] = fields
    by_author = {}
    for aid, author in sorted(authors.items()):
        fields = openalex_profile(author)
        if fields:
            stats.openalex_authors += 1
            by_author[aid] = fields
    doc = {
        "profiles_version": PROFILES_VERSION,
        "retrieved_at": retrieved_at,
        "notes": "Person profile fields keyed by ORCID iD (from the public ORCID record) and OpenAlex author ID. "
                 "Applied to person nodes as attributes.profile by pipelines.profiles.build.apply_profiles.",
        "orcid": by_orcid,
        "openalex": by_author,
    }
    return doc, stats


def _author_ids(node: dict) -> list[str]:
    return sorted({s["record_id"] for s in node.get("sources") or []
                   if s.get("source") == "openalex" and re.fullmatch(r"A\d+", str(s.get("record_id", "")))})


def apply_profiles(graph: dict, profiles: dict) -> ProfileStats:
    """Attach attributes.profile (and the matching source refs) to person nodes, in place."""
    stats = ProfileStats()
    retrieved = profiles.get("retrieved_at")
    for node in graph.get("nodes", []):
        if node.get("type") != "person":
            continue
        profile: dict = {}
        refs: list[dict] = []
        # OpenAlex: a merged person can carry several author IDs; use the one with the most works.
        candidates = [(aid, profiles.get("openalex", {}).get(aid)) for aid in _author_ids(node)]
        candidates = [(aid, p) for aid, p in candidates if p]
        if candidates:
            aid, p = max(candidates, key=lambda x: (x[1].get("metrics", {}).get("works", 0), x[0]))
            profile.update(p)
            profile["openalex_id"] = aid
            refs.append(source_ref("openalex", f"https://openalex.org/{aid}", record_id=aid, retrieved_at=retrieved,
                                   note="Author profile: works, citations, h-index, topics"))
        orcid = str((node.get("attributes") or {}).get("orcid") or "").upper()
        if orcid and orcid in profiles.get("orcid", {}):
            profile.update(profiles["orcid"][orcid])
            refs.append(source_ref("user_submitted", f"https://orcid.org/{orcid}", record_id=orcid, retrieved_at=retrieved,
                                   note="Public ORCID record: position, biography, keywords, websites"))
        if not profile:
            continue
        if retrieved:
            profile["retrieved_at"] = retrieved
        node.setdefault("attributes", {})["profile"] = profile
        node["sources"] = sorted(merge_refs(node["sources"], refs),
                                 key=lambda r: (r.get("source", ""), r.get("record_id", ""), r.get("url", "")))
        stats.applied += 1
    return stats


def load_profiles(path: Path = PROFILES_PATH) -> dict | None:
    path = Path(path)
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def write_profiles(doc: dict, path: Path = PROFILES_PATH) -> Path:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return path
