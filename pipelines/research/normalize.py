"""Normalize raw OpenAlex works into contract nodes and edges.

Research-graph tasks 3-5 (Req 2, 3):
  work                  -> publication node
  authorship            -> source-level person node + AUTHORED edge
  authorship institution-> organization node + AFFILIATED_WITH edge (evidence: the work)
  work topic (up to 3)  -> topic node + HAS_TOPIC edge
  shared works          -> COAUTHORED_WITH edges (derived, evidence: every shared work)

BU affiliation (Req 2.3, 2.4): an author is `bu_affiliated_researcher` when at
least one of their authorships in the dataset lists BU or a BU child institution,
with those works as evidence. Otherwise `unverified`. Never `verified_alumnus`.
"""

from __future__ import annotations

import logging
from collections import Counter
from dataclasses import dataclass, field
from itertools import combinations

from pipelines.common.graph import GraphBuilder
from pipelines.common.ids import LOCAL_ID_RE, make_node_id
from pipelines.common.sources import merge_refs, source_ref

log = logging.getLogger(__name__)

OPENALEX_PREFIX = "https://openalex.org/"
ORCID_PREFIX = "https://orcid.org/"
ROR_PREFIX = "https://ror.org/"
DOI_PREFIX = "https://doi.org/"


@dataclass
class NormalizeStats:
    works: int = 0
    skipped: Counter = field(default_factory=Counter)
    coauthor_skipped_works: int = 0
    bu_authors: int = 0
    unverified_authors: int = 0


def short_id(value: str | None, prefix: str = OPENALEX_PREFIX) -> str | None:
    """Strip a URL prefix from an ID, returning None if the result isn't a valid local ID."""
    if not value or not isinstance(value, str):
        return None
    local = value[len(prefix) :] if value.startswith(prefix) else value
    return local if LOCAL_ID_RE.match(local) else None


def openalex_ref(local_id: str, retrieved_at: str, note: str | None = None) -> dict:
    return source_ref(
        "openalex", f"{OPENALEX_PREFIX}{local_id}", record_id=local_id, retrieved_at=retrieved_at, note=note
    )


def is_bu_institution(inst: dict, bu_id: str) -> bool:
    lineage = inst.get("lineage") or [inst.get("id")]
    return any(short_id(i) == bu_id for i in lineage if i)


def normalize_works(
    works: list[dict],
    retrieved_at: str,
    bu_institution_id: str,
    max_authors_for_coauthor: int = 25,
    builder: GraphBuilder | None = None,
) -> tuple[GraphBuilder, NormalizeStats]:
    g = builder or GraphBuilder()
    stats = NormalizeStats()

    # person id -> BU evidence refs (one per BU authorship) and display name
    bu_evidence: dict[str, list[dict]] = {}
    person_info: dict[str, tuple[str, dict]] = {}
    work_authors: list[tuple[dict, list[str]]] = []

    for work in works:
        wid = short_id(work.get("id"))
        title = (work.get("display_name") or "").strip()
        if not wid:
            stats.skipped["work_without_id"] += 1
            continue
        if not title:
            stats.skipped["work_without_title"] += 1
            continue
        if not any(_author_key(a) for a in work.get("authorships") or []):
            # Req 5.1: a paper must be able to show its authors. Without any author
            # ID there is no person to connect it to.
            stats.skipped["work_without_identified_authors"] += 1
            continue
        stats.works += 1

        work_ref = openalex_ref(wid, retrieved_at)
        pub_id = make_node_id("publication", "openalex", wid)
        g.add_node(pub_id, "publication", title, [work_ref], attributes=_publication_attributes(work))

        authors_in_work: list[str] = []
        for authorship in work.get("authorships") or []:
            author = authorship.get("author") or {}
            key = _author_key(authorship)
            if not key:
                stats.skipped["authorship_without_author_id_or_name"] += 1
                continue
            aid, name = key
            person_id = make_node_id("person", "openalex", aid)
            attrs = {}
            orcid = short_id(author.get("orcid"), ORCID_PREFIX)
            if orcid:
                attrs["orcid"] = orcid
            if person_id not in person_info:
                person_info[person_id] = (name, attrs)
                bu_evidence[person_id] = []
            else:
                person_info[person_id][1].update({k: v for k, v in attrs.items() if k not in person_info[person_id][1]})
            if person_id not in authors_in_work:
                authors_in_work.append(person_id)

            g.add_edge(
                "AUTHORED",
                person_id,
                pub_id,
                [work_ref],
                "high",
                "source_record",
                note=_authorship_note(authorship),
            )

            for inst in authorship.get("institutions") or []:
                org_id, org_name = _add_organization(g, inst, retrieved_at)
                if not org_id:
                    stats.skipped["institution_without_id"] += 1
                    continue
                g.add_edge("AFFILIATED_WITH", person_id, org_id, [work_ref], "high", "source_record")
                if is_bu_institution(inst, bu_institution_id):
                    bu_evidence[person_id].append(
                        openalex_ref(wid, retrieved_at, note=f"Authorship institution: {org_name}")
                    )

        for topic in work.get("topics") or []:
            tid = short_id(topic.get("id"))
            tname = (topic.get("display_name") or "").strip()
            if not tid or not tname:
                stats.skipped["topic_without_id_or_name"] += 1
                continue
            topic_id = make_node_id("topic", "openalex", tid)
            g.add_node(topic_id, "topic", tname, [openalex_ref(tid, retrieved_at)], attributes=_topic_attributes(topic))
            g.add_edge(
                "HAS_TOPIC", pub_id, topic_id, [work_ref], "high", "source_record", note=_topic_note(work, topic, tid)
            )

        work_authors.append((work_ref, authors_in_work))

    # Person nodes, with BU affiliation status from the accumulated evidence.
    for person_id, (name, attrs) in person_info.items():
        aid = person_id.split(":", 2)[2]
        evidence = merge_refs([], bu_evidence[person_id])
        if evidence:
            affiliation = {"status": "bu_affiliated_researcher", "evidence": evidence}
            stats.bu_authors += 1
        else:
            affiliation = {"status": "unverified", "evidence": []}
            stats.unverified_authors += 1
        g.add_node(
            person_id, "person", name, [openalex_ref(aid, retrieved_at)], attributes=attrs, bu_affiliation=affiliation
        )

    # Coauthor edges (Req 3).
    for work_ref, authors in work_authors:
        if len(authors) > max_authors_for_coauthor:
            stats.coauthor_skipped_works += 1
            continue
        for a, b in combinations(sorted(authors), 2):
            g.add_edge("COAUTHORED_WITH", a, b, [work_ref], "high", "derived")

    return g, stats


def _author_key(authorship: dict) -> tuple[str, str] | None:
    """(OpenAlex author ID, display name) if the authorship identifies a person, else None."""
    author = authorship.get("author") or {}
    aid = short_id(author.get("id"))
    name = (author.get("display_name") or "").strip()
    return (aid, name) if aid and name else None


def _publication_attributes(work: dict) -> dict:
    attrs: dict = {}
    if isinstance(work.get("publication_year"), int):
        attrs["year"] = work["publication_year"]
    venue = ((work.get("primary_location") or {}).get("source") or {}).get("display_name")
    if venue:
        attrs["venue"] = venue
    doi = work.get("doi")
    if doi:
        attrs["doi"] = doi[len(DOI_PREFIX) :] if doi.startswith(DOI_PREFIX) else doi
    if isinstance(work.get("cited_by_count"), int):
        attrs["citation_count"] = work["cited_by_count"]
    if work.get("type"):
        attrs["work_type"] = work["type"]
    return attrs


def _add_organization(g: GraphBuilder, inst: dict, retrieved_at: str) -> tuple[str | None, str | None]:
    iid = short_id(inst.get("id"))
    name = (inst.get("display_name") or "").strip()
    if not iid or not name:
        return None, None
    ror = short_id(inst.get("ror"), ROR_PREFIX)
    org_id = make_node_id("organization", "ror", ror) if ror else make_node_id("organization", "openalex", iid)
    attrs: dict = {"openalex_id": iid}
    if ror:
        attrs["ror_id"] = ror
    if inst.get("country_code"):
        attrs["country"] = inst["country_code"]
    if inst.get("type"):
        attrs["org_type"] = inst["type"]
    g.add_node(org_id, "organization", name, [openalex_ref(iid, retrieved_at)], attributes=attrs)
    return org_id, name


def _topic_attributes(topic: dict) -> dict:
    attrs = {}
    for level in ("subfield", "field", "domain"):
        label = (topic.get(level) or {}).get("display_name")
        if label:
            attrs[level] = label
    return attrs


def _topic_note(work: dict, topic: dict, tid: str) -> str:
    parts = []
    score = topic.get("score")
    if isinstance(score, (int, float)):
        parts.append(f"OpenAlex topic score: {score:.4f}")
    if short_id((work.get("primary_topic") or {}).get("id")) == tid:
        parts.append("primary topic")
    return "; ".join(parts) or "OpenAlex topic assignment"


def _authorship_note(authorship: dict) -> str | None:
    parts = []
    if authorship.get("author_position"):
        parts.append(f"Author position: {authorship['author_position']}")
    if authorship.get("is_corresponding"):
        parts.append("corresponding author")
    return "; ".join(parts) or None

