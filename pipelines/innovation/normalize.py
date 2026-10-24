"""Normalize NIH RePORTER awards and PatentsView patents into contract nodes and edges.

Awards (innovation-funding task 6, Req 2, 3):
  core project            -> award node `award:nih:<core_project_num>` (one per award,
                             with every fetched project-year as a source)
  principal investigator  -> source-level person `person:nih:<profile_id>` + RECEIVED_AWARD
  administering agency    -> FUNDED_BY award -> NIH (organization:ror:01cwqze88)
  contact PI's awardee    -> AFFILIATED_WITH contact PI -> Boston University
  NIH publication link    -> FUNDED_BY publication -> award, only when NIH lists the
                             PubMed ID and OpenAlex resolves it to a work ID (Req 2, N3)

Patents (innovation-funding task 4, Req 1, 3):
  patent    -> patent node `patent:uspto:US<number><kind>`
  inventor  -> source-level person `person:patentsview:<inventor_id>` + INVENTED
  assignee  -> organization (`organization:ror:05qwgg493` for BU, otherwise
               `organization:patentsview:<assignee_id>`) + ASSIGNED_TO

BU affiliation (Req 3.2): a person is `bu_affiliated_researcher` only when one of
their records lists BU: they are the contact PI of a project whose awardee is BU,
or an inventor on a patent assigned to BU. Co-PIs are not, because NIH lists the
awardee organization of the contact PI only. Everyone else is `unverified`.
Never `verified_alumnus`, and no `person:canonical:*` IDs (Req 3.1, N4).

Nothing here links people across modules. Inventors' and PIs' names, locations,
and institutions go in `attributes` for the identity module to match on.
"""

from __future__ import annotations

import hashlib
import re
from collections import Counter
from dataclasses import dataclass, field

from pipelines.common.graph import GraphBuilder
from pipelines.common.ids import LOCAL_ID_RE, make_node_id
from pipelines.common.sources import merge_refs, source_ref

from .config import BU_ROR_ID, NIH_ROR_ID

BU_ORG_ID = make_node_id("organization", "ror", BU_ROR_ID)
NIH_ORG_ID = make_node_id("organization", "ror", NIH_ROR_ID)
OPENALEX_PREFIX = "https://openalex.org/"
DOI_PREFIX = "https://doi.org/"
NIH_PROJECT_URL = "https://reporter.nih.gov/project-details/"
PATENT_URL = "https://patents.google.com/patent/"
PATENTSVIEW_NOTE = "PatentsView disambiguated bulk data (USPTO Open Data Portal)"


@dataclass
class NormalizeStats:
    awards: int = 0
    award_people: int = 0
    funded_publications: int = 0
    patents: int = 0
    inventors: int = 0
    bu_people: int = 0
    skipped: Counter = field(default_factory=Counter)


def safe_local_id(raw: str | None) -> str | None:
    """The source ID when it fits the contract, else a stable hash of it (raw ID kept as record_id)."""
    if not raw:
        return None
    raw = raw.strip()
    if LOCAL_ID_RE.fullmatch(raw):
        return raw
    return "h" + hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]


def _name(*parts: str | None) -> str:
    return re.sub(r"\s+", " ", " ".join(p for p in parts if p)).strip()


# --- Awards -----------------------------------------------------------------


def nih_ref(project: dict, retrieved_at: str, note: str | None = None) -> dict:
    url = project.get("project_detail_url") or f"{NIH_PROJECT_URL}{project['appl_id']}"
    return source_ref("nih_reporter", url, record_id=project.get("project_num") or str(project["appl_id"]),
                      retrieved_at=retrieved_at, note=note)


def _is_bu(project: dict, bu_org_names: tuple[str, ...]) -> bool:
    name = ((project.get("organization") or {}).get("org_name") or "").strip().upper()
    return name in {n.upper() for n in bu_org_names}


def _year_key(project: dict) -> tuple:
    return (project.get("fiscal_year") or 0, project.get("appl_id") or 0)


def normalize_awards(
    projects: list[dict],
    publication_links: list[dict],
    pmid_works: dict[str, dict],
    retrieved_at: str,
    bu_org_names: tuple[str, ...],
    known_publication_ids: set[str] | None = None,
    max_awards: int | None = None,
    builder: GraphBuilder | None = None,
    stats: NormalizeStats | None = None,
) -> tuple[GraphBuilder, NormalizeStats]:
    g = builder or GraphBuilder()
    stats = stats or NormalizeStats()

    by_core: dict[str, list[dict]] = {}
    for project in projects:
        if not _is_bu(project, bu_org_names):
            stats.skipped["project_not_at_bu"] += 1
            continue
        core = (project.get("core_project_num") or "").strip()
        if not core or not LOCAL_ID_RE.fullmatch(core) or not project.get("appl_id"):
            stats.skipped["project_without_valid_core_number"] += 1
            continue
        if not (project.get("project_title") or "").strip():
            stats.skipped["project_without_title"] += 1
            continue
        by_core.setdefault(core, []).append(project)

    cores = sorted(by_core, key=lambda c: max(_year_key(p) for p in by_core[c]), reverse=True)
    if max_awards is not None:
        cores = cores[:max_awards]

    # person id -> (name, attrs, BU evidence refs)
    people: dict[str, tuple[str, dict, list[dict]]] = {}
    person_source: dict[str, dict] = {}
    appl_to_core: dict[int, str] = {}
    for core in sorted(cores):
        years = sorted(by_core[core], key=_year_key)
        latest = years[-1]
        stats.awards += 1
        award_id = make_node_id("award", "nih", core)
        refs = [nih_ref(p, retrieved_at) for p in years]
        for p in years:
            appl_to_core[p["appl_id"]] = core
        g.add_node(award_id, "award", latest["project_title"].strip(), refs, attributes=_award_attributes(core, latest))

        ic = (latest.get("agency_ic_admin") or {})
        _add_org(g, NIH_ORG_ID, "National Institutes of Health", refs[-1], NIH_ROR_ID)
        g.add_edge("FUNDED_BY", award_id, NIH_ORG_ID, refs, "high", "source_record",
                   note=f"Administering institute: {ic['name']}" if ic.get("name") else None)

        pi_refs: dict[str, list[dict]] = {}
        contact: dict[str, list[dict]] = {}
        for p in years:
            for pi in p.get("principal_investigators") or []:
                profile = pi.get("profile_id")
                name = _name(pi.get("first_name"), pi.get("middle_name"), pi.get("last_name"))
                if not profile or not name:
                    stats.skipped["pi_without_profile_id_or_name"] += 1
                    continue
                pid = make_node_id("person", "nih", str(profile))
                pi_refs.setdefault(pid, []).append(nih_ref(p, retrieved_at))
                if pid not in people:
                    people[pid] = (name, {"nih_profile_id": str(profile)}, [])
                    person_source[pid] = nih_ref(p, retrieved_at, note="Listed as principal investigator")
                if pi.get("is_contact_pi"):
                    org_name = p["organization"]["org_name"]
                    contact.setdefault(pid, []).append(nih_ref(p, retrieved_at, note=f"Contact PI; awardee: {org_name}"))
                    people[pid][1].setdefault("institutions", set()).add(org_name)

        for pid, evidence in pi_refs.items():
            note = "Contact PI" if pid in contact else "Principal investigator"
            g.add_edge("RECEIVED_AWARD", pid, award_id, merge_refs([], evidence), "high", "source_record", note=note)
        for pid, evidence in contact.items():
            people[pid][2].extend(evidence)
            _add_org(g, BU_ORG_ID, "Boston University", evidence[0], BU_ROR_ID)
            g.add_edge("AFFILIATED_WITH", pid, BU_ORG_ID, evidence, "high", "source_record",
                       note="Awardee organization of an NIH project where this person is contact PI")

    for pid, (name, attrs, bu_evidence) in people.items():
        stats.award_people += 1
        _add_person(g, pid, name, person_source[pid], attrs, bu_evidence, stats)

    _add_funded_publications(g, publication_links, pmid_works, appl_to_core, set(cores), retrieved_at,
                             known_publication_ids, stats)
    return g, stats


def _award_attributes(core: str, latest: dict) -> dict:
    attrs: dict = {"agency": "NIH", "award_number": core}
    if latest.get("project_num"):
        attrs["latest_project_number"] = latest["project_num"]
    if isinstance(latest.get("fiscal_year"), int):
        attrs["fiscal_year"] = latest["fiscal_year"]
    if isinstance(latest.get("award_amount"), (int, float)) and latest["award_amount"] > 0:
        attrs["amount_usd"] = latest["award_amount"]  # the latest fiscal year's award, as NIH states it
    ic = latest.get("agency_ic_admin") or {}
    if ic.get("abbreviation"):
        attrs["institute"] = ic["abbreviation"]
    if latest.get("activity_code"):
        attrs["activity_code"] = latest["activity_code"]
    for key, out in (("project_start_date", "start_date"), ("project_end_date", "end_date")):
        if latest.get(key):
            attrs[out] = str(latest[key])[:10]
    org = (latest.get("organization") or {}).get("org_name")
    if org:
        attrs["awardee"] = org
    return attrs


def _add_funded_publications(
    g: GraphBuilder,
    links: list[dict],
    pmid_works: dict[str, dict],
    appl_to_core: dict[int, str],
    cores: set[str],
    retrieved_at: str,
    known: set[str] | None,
    stats: NormalizeStats,
) -> None:
    for link in links:
        core = link.get("coreproject")
        pmid = str(link.get("pmid") or "")
        if core not in cores or not pmid.isdigit():
            continue
        work = pmid_works.get(pmid)
        wid = (work or {}).get("id", "")
        wid = wid[len(OPENALEX_PREFIX):] if wid.startswith(OPENALEX_PREFIX) else wid
        title = ((work or {}).get("display_name") or "").strip()
        if not wid or not LOCAL_ID_RE.fullmatch(wid) or not title:
            stats.skipped["funded_pmid_not_resolved_by_openalex"] += 1
            continue
        pub_id = make_node_id("publication", "openalex", wid)
        if known is not None and pub_id not in known:
            stats.skipped["funded_publication_outside_research_graph"] += 1
            continue
        attrs: dict = {"pmid": pmid}
        doi = work.get("doi")
        if doi:
            attrs["doi"] = doi[len(DOI_PREFIX):] if doi.startswith(DOI_PREFIX) else doi
        if isinstance(work.get("publication_year"), int):
            attrs["year"] = work["publication_year"]
        g.add_node(pub_id, "publication", title,
                   [source_ref("openalex", f"{OPENALEX_PREFIX}{wid}", record_id=wid, retrieved_at=retrieved_at)],
                   attributes=attrs)
        appl = link.get("applid")
        url = f"{NIH_PROJECT_URL}{appl}" if appl else f"{NIH_PROJECT_URL}{core}"
        evidence = source_ref("nih_reporter", url, record_id=f"{core}:PMID{pmid}", retrieved_at=retrieved_at,
                              note=f"NIH RePORTER lists PubMed ID {pmid} under core project {core}")
        edge = g.add_edge("FUNDED_BY", pub_id, make_node_id("award", "nih", core), [evidence], "high", "source_record")
        if len(edge["evidence"]) == 1:
            stats.funded_publications += 1


# --- Patents ----------------------------------------------------------------


def patent_number(record: dict) -> str | None:
    number = f"US{record['patent_id'].strip()}{record.get('kind') or ''}"
    return number if LOCAL_ID_RE.fullmatch(number) else None


def patent_ref(record: dict, retrieved_at: str, note: str | None = PATENTSVIEW_NOTE) -> dict:
    return source_ref("patentsview", f"{PATENT_URL}{patent_number(record)}", record_id=record["patent_id"].strip(),
                      retrieved_at=retrieved_at, note=note)


def normalize_patents(
    patents: list[dict],
    retrieved_at: str,
    bu_assignee_pattern: str,
    builder: GraphBuilder | None = None,
    stats: NormalizeStats | None = None,
) -> tuple[GraphBuilder, NormalizeStats]:
    g = builder or GraphBuilder()
    stats = stats or NormalizeStats()
    bu = re.compile(bu_assignee_pattern, re.IGNORECASE)

    people: dict[str, tuple[str, dict, list[dict]]] = {}
    for record in patents:
        number = patent_number(record)
        title = (record.get("title") or "").strip()
        if not number:
            stats.skipped["patent_with_invalid_number"] += 1
            continue
        if not title:
            stats.skipped["patent_without_title"] += 1
            continue
        inventors = [i for i in record.get("inventors") or [] if safe_local_id(i.get("inventor_id")) and _name(i.get("first"), i.get("last"))]
        if not inventors:
            stats.skipped["patent_without_identified_inventor"] += 1
            continue
        stats.patents += 1
        ref = patent_ref(record, retrieved_at)
        patent_id = make_node_id("patent", "uspto", number)
        g.add_node(patent_id, "patent", title, [ref], attributes=_patent_attributes(record, number))

        bu_assignees = []
        assignee_names = []
        for asg in record.get("assignees") or []:
            org = (asg.get("organization") or "").strip()
            local = safe_local_id(asg.get("assignee_id"))
            if not org or not local:
                stats.skipped["assignee_without_organization_or_id"] += 1
                continue
            assignee_names.append(org)
            if bu.search(org):
                bu_assignees.append(org)
                org_id = BU_ORG_ID
                _add_org(g, org_id, "Boston University", ref, BU_ROR_ID)
            else:
                org_id = make_node_id("organization", "patentsview", local)
                attrs = {"patentsview_assignee_id": asg["assignee_id"]}
                g.add_node(org_id, "organization", org,
                           [source_ref("patentsview", ref["url"], record_id=asg["assignee_id"], retrieved_at=retrieved_at,
                                       note=f"Assignee on {number}")], attributes=attrs)
            g.add_edge("ASSIGNED_TO", patent_id, org_id, [ref], "high", "source_record",
                       note=f"Assignee: {org}" if org_id == BU_ORG_ID else None)

        for inv in inventors:
            raw = inv["inventor_id"].strip()
            pid = make_node_id("person", "patentsview", safe_local_id(raw))
            name = _name(inv.get("first"), inv.get("last"))
            if pid not in people:
                attrs: dict = {"patentsview_inventor_id": raw}
                people[pid] = (name, attrs, [])
            attrs = people[pid][1]
            if inv.get("location") and "location" not in attrs:
                attrs["location"] = inv["location"]
            attrs.setdefault("assignees", set()).update(assignee_names)
            if bu_assignees:
                people[pid][2].append(patent_ref(record, retrieved_at, note=f"Patent assigned to {bu_assignees[0]}"))
            g.add_edge("INVENTED", pid, patent_id, [ref], "high", "source_record",
                       note=f"Inventor sequence: {inv['sequence']}" if inv.get("sequence") is not None else None)

    for pid, (name, attrs, bu_evidence) in people.items():
        stats.inventors += 1
        _add_person(g, pid, name, _first_invented_ref(g, pid), attrs, bu_evidence, stats)
    return g, stats


def _first_invented_ref(g: GraphBuilder, person_id: str) -> dict:
    prefix = f"edge:invented:{person_id}|"
    return next(e["evidence"][0] for k, e in sorted(g.edges.items()) if k.startswith(prefix))


def _patent_attributes(record: dict, number: str) -> dict:
    attrs: dict = {"patent_number": number}
    for key in ("grant_date", "filing_date"):
        if record.get(key):
            attrs[key] = record[key]
    if record.get("cpc_codes"):
        attrs["cpc_codes"] = list(record["cpc_codes"])
    return attrs


# --- Shared -----------------------------------------------------------------


def _add_org(g: GraphBuilder, org_id: str, label: str, ref: dict, ror: str) -> None:
    """Add a well-known organization once; its first source record is enough provenance."""
    if org_id in g.nodes:
        return
    g.add_node(org_id, "organization", label, [ref], attributes={"ror_id": ror})


def _add_person(g: GraphBuilder, pid: str, name: str, source: dict, attrs: dict, bu_evidence: list[dict],
                stats: NormalizeStats) -> None:
    attrs = {k: sorted(v) if isinstance(v, set) else v for k, v in attrs.items() if v}
    evidence = merge_refs([], bu_evidence)
    if evidence:
        affiliation = {"status": "bu_affiliated_researcher", "evidence": evidence}
        stats.bu_people += 1
    else:
        affiliation = {"status": "unverified", "evidence": []}
    g.add_node(pid, "person", name, [source], attributes=attrs, bu_affiliation=affiliation)
