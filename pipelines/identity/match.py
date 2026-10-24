"""Signal scoring and match decisions (identity-resolution task 4, Req 3.1-3.3, 4.2).

Compares the canonical people in ``data/modules/people.json`` with the
source-level persons of one or more module graphs (today ``research.json``) and
writes ``data/modules/identity_matches.json``.

Pipeline
--------
1. **Blocking.** ``normalize_names.candidate_blocks`` groups canonical and
   source records by ``last|first-initial`` (exact blocks) and by surname
   skeleton (variant blocks). Only canonical x source pairs inside a block are
   scored. ORCID is also used as an exact lookup key, so two records that carry
   the same ORCID are always compared even when their names block apart
   (e.g. a name change). That lookup only adds pairs; it never decides alone.
2. **Signals.** Each pair is scored on the schema signal enum:

   * ``orcid``: equal ORCIDs, or both carry an ORCID and they differ (conflict).
   * ``exact_name``: normalized full names are identical
     (``David R. Gagnon`` == ``DAVID R. GAGNON``).
   * ``name_variant``: names share a block but are not identical (initials,
     middle names, accent-free spelling, or a surname typo).
   * ``shared_affiliation``: both records are tied to Boston University (the
     canonical person's curated BU status, and the source record's
     ``bu_affiliated_researcher`` status or an AFFILIATED_WITH edge to BU).
   * ``shared_coauthor``: the source record shares a coauthor with a record
     already ORCID-linked to the canonical person (an "anchor").
   * ``shared_topic``: same idea for publication topics. Recorded for review,
     but not counted as corroboration (design.md lists only affiliation,
     coauthor, and bio link).
   * ``institutional_bio``: the source record cites one of the canonical
     person's institutional-bio URLs.

   Photos are never read or compared (Requirement 7.5).
3. **Decision table** (design.md), first matching row wins:

   ============================================  =========  ==========
   Signals                                       Status     Confidence
   ============================================  =========  ==========
   ORCID conflict                                rejected   high
   ORCID equal                                   merged     high
   Exact name + 2 or more corroborating signals  merged     medium
   Exact name + 1 corroborating signal           candidate  medium
   Exact name only, or name variant              candidate  low
   ============================================  =========  ==========

   A pair with none of these signals produces no match.
4. **Conflicts (Req 4.2).** If the evidence for a person disagrees, nothing is
   merged on it: a canonical person whose merged members carry different
   ORCIDs, or a source record that would merge into two canonical people, is
   downgraded to ``candidate``/``low`` and an ``orcid``/``manual_review``
   signal explains the conflict. Those canonical IDs are reported as
   ambiguous (``MatchRun.ambiguous``) so the merge step can set
   ``bu_affiliation.status: ambiguous``.
5. **Manual review (Req 3.4).** ``apply_reviews`` replaces the automated
   result of every (canonical_id, member_id) pair named in
   ``data/curation/reviews.yaml``, records ``reviewed: {by, at, note}`` and a
   ``manual_review`` signal, and creates the pair if it was never scored.
   Reviews naming people absent from this run are reported, not applied.
6. **Invariant.** ``enforce_invariants`` turns any ``merged``/``low`` result
   into ``candidate``/``low``. It runs after the automated decisions and again
   after manual overrides.
7. **Output.** The contract validator allows one match entry per
   ``canonical_id``, so pair decisions are aggregated per canonical person with
   precedence ``merged`` > ``candidate`` > ``rejected``. Pairs that lose on
   precedence are listed in ``MatchRun.deferred`` and summarized in the file's
   ``notes``. Matches are sorted by ``canonical_id``.

Run:
    python -m pipelines.identity.run --step match
"""

from __future__ import annotations

import datetime as _dt
import json
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable, Mapping

import yaml

from pipelines.common.contract import REPO_ROOT, SCHEMA_VERSION
from pipelines.common.graph import utc_now_iso, write_graph

from .normalize_names import blocking_key, candidate_blocks, normalize_name, variant_key

PEOPLE_PATH = REPO_ROOT / "data" / "modules" / "people.json"
RESEARCH_PATH = REPO_ROOT / "data" / "modules" / "research.json"
OUTPUT_PATH = REPO_ROOT / "data" / "modules" / "identity_matches.json"
REVIEWS_PATH = REPO_ROOT / "data" / "curation" / "reviews.yaml"

CANONICAL_PREFIX = "person:canonical:"

# Boston University in research.json (ROR 05qwgg493).
BU_ORG_IDS = frozenset({"organization:ror:05qwgg493"})
BU_STATUSES = frozenset({"verified_alumnus", "bu_affiliated_researcher"})

# Signals that count as corroboration for an exact-name pair (design.md).
CORROBORATING = frozenset({"shared_affiliation", "shared_coauthor", "institutional_bio"})

STATUS_RANK = {"merged": 3, "candidate": 2, "rejected": 1}
CONFIDENCE_RANK = {"high": 3, "medium": 2, "low": 1}

# Cap evidence lists so a prolific author doesn't bloat the file.
MAX_EVIDENCE_URLS = 3
MAX_DETAIL_NAMES = 3


# ---------------------------------------------------------------------------
# Records and graph indexes
# ---------------------------------------------------------------------------


def normalize_orcid(value: object) -> str | None:
    """Bare upper-case ORCID (``0000-0002-9268-810X``) or None."""
    if not isinstance(value, str) or not value.strip():
        return None
    v = value.strip()
    for prefix in ("https://orcid.org/", "http://orcid.org/", "orcid.org/"):
        if v.lower().startswith(prefix):
            v = v[len(prefix):]
    return v.upper()


def orcid_url(orcid: str) -> str:
    return f"https://orcid.org/{orcid}"


@dataclass(frozen=True)
class PersonRecord:
    """The fields of a person node that matching uses. Photos are deliberately absent."""

    id: str
    label: str
    orcid: str | None
    bu_status: str | None
    bu_evidence_urls: tuple[str, ...]
    institutional_bio_urls: frozenset[str]
    cited_urls: frozenset[str]

    @property
    def is_canonical(self) -> bool:
        return self.id.startswith(CANONICAL_PREFIX)

    @classmethod
    def from_node(cls, node: Mapping) -> "PersonRecord":
        attrs = node.get("attributes") or {}
        aff = node.get("bu_affiliation") or {}
        refs = list(node.get("sources") or []) + list(aff.get("evidence") or [])
        urls = [r.get("url") for r in refs if isinstance(r, dict) and r.get("url")]
        bio = [
            r["url"]
            for r in refs
            if isinstance(r, dict) and r.get("source") == "institutional_bio" and r.get("url")
        ]
        evidence = [r.get("url") for r in aff.get("evidence") or [] if isinstance(r, dict) and r.get("url")]
        return cls(
            id=node["id"],
            label=node.get("label", ""),
            orcid=normalize_orcid(attrs.get("orcid")),
            bu_status=aff.get("status"),
            bu_evidence_urls=tuple(evidence),
            institutional_bio_urls=frozenset(bio),
            cited_urls=frozenset(urls),
        )


@dataclass
class SourceIndex:
    """Per-person lookups over one or more source graph documents."""

    records: dict[str, PersonRecord] = field(default_factory=dict)
    coauthors: dict[str, set[str]] = field(default_factory=lambda: defaultdict(set))
    topics: dict[str, set[str]] = field(default_factory=lambda: defaultdict(set))
    bu_affiliated: set[str] = field(default_factory=set)
    labels: dict[str, str] = field(default_factory=dict)

    @classmethod
    def from_documents(cls, docs: Iterable[Mapping]) -> "SourceIndex":
        index = cls()
        for doc in docs:
            pub_topics: dict[str, set[str]] = defaultdict(set)
            authored: list[tuple[str, str]] = []
            for node in doc.get("nodes", []):
                index.labels[node["id"]] = node.get("label", "")
                if node.get("type") == "person" and not node["id"].startswith(CANONICAL_PREFIX):
                    index.records[node["id"]] = PersonRecord.from_node(node)
            for edge in doc.get("edges", []):
                etype, src, tgt = edge.get("type"), edge.get("source"), edge.get("target")
                if etype == "COAUTHORED_WITH":
                    index.coauthors[src].add(tgt)
                    index.coauthors[tgt].add(src)
                elif etype == "AFFILIATED_WITH" and tgt in BU_ORG_IDS:
                    index.bu_affiliated.add(src)
                elif etype == "AUTHORED":
                    authored.append((src, tgt))
                elif etype == "HAS_TOPIC":
                    if src.startswith("person:"):
                        index.topics[src].add(tgt)
                    else:
                        pub_topics[src].add(tgt)
            for person, pub in authored:
                index.topics[person].update(pub_topics.get(pub, ()))
        return index

    def is_bu_affiliated(self, record: PersonRecord) -> bool:
        return record.bu_status in BU_STATUSES or record.id in self.bu_affiliated


def canonical_records(people_doc: Mapping) -> dict[str, PersonRecord]:
    return {
        n["id"]: PersonRecord.from_node(n)
        for n in people_doc.get("nodes", [])
        if n.get("type") == "person" and n["id"].startswith(CANONICAL_PREFIX)
    }


# ---------------------------------------------------------------------------
# Pair generation (blocking)
# ---------------------------------------------------------------------------


def candidate_pairs(
    canonicals: Mapping[str, PersonRecord], sources: Mapping[str, PersonRecord]
) -> list[tuple[str, str]]:
    """(canonical_id, source_id) pairs that share a name block or an ORCID."""
    names = {rid: r.label for rid, r in canonicals.items()}
    names.update({rid: r.label for rid, r in sources.items()})
    pairs: set[tuple[str, str]] = set()
    for block in candidate_blocks(names):
        canon = [m for m in block.members if m in canonicals]
        src = [m for m in block.members if m in sources]
        pairs.update((c, s) for c in canon for s in src)

    by_orcid: dict[str, list[str]] = defaultdict(list)
    for rid, r in sources.items():
        if r.orcid:
            by_orcid[r.orcid].append(rid)
    for cid, c in canonicals.items():
        if c.orcid:
            pairs.update((cid, s) for s in by_orcid.get(c.orcid, ()))
    return sorted(pairs)


# ---------------------------------------------------------------------------
# Signals
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Signal:
    signal: str
    detail: str
    evidence_urls: tuple[str, ...] = ()
    # True for an ORCID conflict or a cross-record conflict. Internal only.
    conflict: bool = False

    def to_json(self) -> dict:
        out: dict = {"signal": self.signal, "detail": self.detail}
        if self.evidence_urls:
            out["evidence_urls"] = list(self.evidence_urls)
        return out


def _urls(*groups: Iterable[str]) -> tuple[str, ...]:
    seen: list[str] = []
    for group in groups:
        for url in group:
            if url and url not in seen:
                seen.append(url)
    return tuple(seen[:MAX_EVIDENCE_URLS])


def _names(ids: Iterable[str], labels: Mapping[str, str]) -> str:
    ordered = sorted(ids)
    shown = [f"{labels.get(i) or i} ({i})" for i in ordered[:MAX_DETAIL_NAMES]]
    extra = len(ordered) - len(shown)
    return ", ".join(shown) + (f", and {extra} more" if extra > 0 else "")


def score_pair(
    canonical: PersonRecord,
    source: PersonRecord,
    index: SourceIndex,
    anchors: Iterable[str] = (),
) -> list[Signal]:
    """All signals for one canonical x source pair, in a fixed order.

    ``anchors`` are source records already ORCID-linked to ``canonical``; their
    coauthors and topics stand in for the canonical person's own, since a
    curated node carries no edges.
    """
    signals: list[Signal] = []
    sid = source.id

    # ORCID: equal or conflicting.
    if canonical.orcid and source.orcid:
        if canonical.orcid == source.orcid:
            signals.append(
                Signal("orcid", f"{sid} carries the same ORCID {source.orcid}", (orcid_url(source.orcid),))
            )
        else:
            signals.append(
                Signal(
                    "orcid",
                    f"ORCID conflict: {sid} has {source.orcid}, canonical person has {canonical.orcid}",
                    (orcid_url(canonical.orcid), orcid_url(source.orcid)),
                    conflict=True,
                )
            )

    # Names.
    c_name, s_name = normalize_name(canonical.label), normalize_name(source.label)
    if c_name.tokens and c_name.tokens == s_name.tokens:
        signals.append(Signal("exact_name", f"{sid} name {source.label!r} equals {canonical.label!r} after normalization"))
    elif blocking_key(canonical.label) == blocking_key(source.label):
        signals.append(
            Signal("name_variant", f"{sid} name {source.label!r} shares last name and first initial with {canonical.label!r}")
        )
    elif _same_variant_block(canonical.label, source.label):
        signals.append(
            Signal("name_variant", f"{sid} name {source.label!r} is a surname spelling variant of {canonical.label!r}")
        )

    # Shared affiliation (Boston University).
    if canonical.bu_status in BU_STATUSES and index.is_bu_affiliated(source):
        signals.append(
            Signal(
                "shared_affiliation",
                f"{sid} has a Boston University affiliation; canonical person is {canonical.bu_status}",
                _urls(source.bu_evidence_urls, canonical.bu_evidence_urls),
            )
        )

    # Institutional bio link.
    shared_bio = sorted(canonical.institutional_bio_urls & source.cited_urls)
    if shared_bio:
        signals.append(Signal("institutional_bio", f"{sid} cites the canonical person's institutional bio", _urls(shared_bio)))

    # Coauthors and topics via ORCID-linked anchor records (not the record itself).
    other_anchors = [a for a in anchors if a != sid]
    if other_anchors:
        anchor_coauthors = set().union(*(index.coauthors.get(a, set()) for a in other_anchors))
        shared = (index.coauthors.get(sid, set()) & anchor_coauthors) - set(other_anchors) - {sid}
        if shared:
            signals.append(
                Signal("shared_coauthor", f"{sid} shares coauthor(s) with ORCID-linked records: {_names(shared, index.labels)}")
            )
        anchor_topics = set().union(*(index.topics.get(a, set()) for a in other_anchors))
        topics = index.topics.get(sid, set()) & anchor_topics
        if topics:
            signals.append(
                Signal("shared_topic", f"{sid} shares topic(s) with ORCID-linked records: {_names(topics, index.labels)}")
            )
    return signals


def _same_variant_block(a: str, b: str) -> bool:
    ka, kb = variant_key(a), variant_key(b)
    return ka is not None and ka == kb


# ---------------------------------------------------------------------------
# Decisions
# ---------------------------------------------------------------------------


@dataclass
class PairDecision:
    canonical_id: str
    member_id: str
    status: str
    confidence: str
    signals: list[Signal]
    conflict: bool = False
    # Set when a reviews.yaml decision overrode this pair: {"by", "at", "note"?}.
    reviewed: dict | None = None


def decide(signals: Iterable[Signal]) -> tuple[str, str] | None:
    """Apply the design.md decision table. Returns (status, confidence) or None."""
    signals = list(signals)
    kinds = {s.signal for s in signals}
    orcid = [s for s in signals if s.signal == "orcid"]
    if any(s.conflict for s in orcid):
        return ("rejected", "high")
    if orcid:
        return ("merged", "high")
    corroboration = len(kinds & CORROBORATING)
    if "exact_name" in kinds:
        if corroboration >= 2:
            return ("merged", "medium")
        if corroboration == 1:
            return ("candidate", "medium")
        return ("candidate", "low")
    if "name_variant" in kinds:
        return ("candidate", "low")
    return None


def enforce_invariants(decisions: Iterable[PairDecision]) -> list[PairDecision]:
    """A merged match is never low confidence (Req 3.3): demote it to a candidate."""
    out = []
    for d in decisions:
        if d.status == "merged" and d.confidence == "low":
            d.status = "candidate"
        out.append(d)
    return out


def _mark_conflict(d: PairDecision, signal: Signal) -> None:
    d.status, d.confidence, d.conflict = "candidate", "low", True
    if signal not in d.signals:
        d.signals.append(signal)


def resolve_conflicts(decisions: list[PairDecision], sources: Mapping[str, PersonRecord]) -> set[str]:
    """Demote merges whose evidence disagrees (Req 4.2). Returns ambiguous canonical IDs."""
    ambiguous: set[str] = set()
    merged = [d for d in decisions if d.status == "merged"]

    # A canonical person whose merged members carry different ORCIDs.
    by_canonical: dict[str, list[PairDecision]] = defaultdict(list)
    for d in merged:
        by_canonical[d.canonical_id].append(d)
    for cid, group in by_canonical.items():
        orcids = sorted({sources[d.member_id].orcid for d in group if sources[d.member_id].orcid})
        if len(orcids) > 1:
            ambiguous.add(cid)
            sig = Signal(
                "orcid",
                f"CONFLICT: records that would merge into {cid} carry different ORCIDs ({', '.join(orcids)}); not merged",
                _urls(orcid_url(o) for o in orcids),
                conflict=True,
            )
            for d in group:
                _mark_conflict(d, sig)

    # A source record that would merge into more than one canonical person.
    by_member: dict[str, list[PairDecision]] = defaultdict(list)
    for d in decisions:
        if d.status == "merged":
            by_member[d.member_id].append(d)
    for mid, group in by_member.items():
        if len(group) > 1:
            targets = sorted(d.canonical_id for d in group)
            sig = Signal(
                "manual_review",
                f"CONFLICT: {mid} matches several canonical people ({', '.join(targets)}); not merged",
                conflict=True,
            )
            for d in group:
                ambiguous.add(d.canonical_id)
                _mark_conflict(d, sig)
    return ambiguous


def score_and_decide(
    canonicals: Mapping[str, PersonRecord], index: SourceIndex
) -> tuple[list[PairDecision], set[str]]:
    """Score every blocked pair and apply the decision table and conflict rules."""
    pairs = candidate_pairs(canonicals, index.records)

    anchors: dict[str, list[str]] = defaultdict(list)
    for cid, sid in pairs:
        c, s = canonicals[cid], index.records[sid]
        if c.orcid and c.orcid == s.orcid:
            anchors[cid].append(sid)

    decisions: list[PairDecision] = []
    for cid, sid in pairs:
        signals = score_pair(canonicals[cid], index.records[sid], index, anchors.get(cid, ()))
        result = decide(signals)
        if result is None:
            continue
        decisions.append(PairDecision(cid, sid, result[0], result[1], signals))

    ambiguous = resolve_conflicts(decisions, index.records)
    return enforce_invariants(decisions), ambiguous


# ---------------------------------------------------------------------------
# Manual review overrides (Req 3.4)
# ---------------------------------------------------------------------------

REVIEW_SIGNALS = frozenset({"manual_review", "user_submitted"})


@dataclass(frozen=True)
class Review:
    """One decision from ``data/curation/reviews.yaml``."""

    canonical_id: str
    member_ids: tuple[str, ...]
    status: str
    confidence: str
    by: str
    at: str  # ISO date, YYYY-MM-DD
    note: str | None = None
    signal: str = "manual_review"

    def reviewed_field(self) -> dict:
        out = {"by": self.by, "at": self.at}
        if self.note:
            out["note"] = self.note
        return out

    def to_signal(self) -> Signal:
        detail = f"Reviewed by {self.by} on {self.at}: {self.status}/{self.confidence}"
        if self.note:
            detail += f". {self.note}"
        return Signal(self.signal, detail)


def _iso_date(value: object) -> str:
    """YAML parses ``2026-10-24`` as a date; accept that or an ISO string."""
    if isinstance(value, _dt.datetime):
        return value.date().isoformat()
    if isinstance(value, _dt.date):
        return value.isoformat()
    if isinstance(value, str):
        return _dt.date.fromisoformat(value.strip()).isoformat()
    raise ValueError(f"not a date: {value!r}")


def parse_review(entry: Mapping) -> Review:
    """Validate one reviews.yaml entry. Raises ValueError on a malformed decision."""
    if not isinstance(entry, Mapping):
        raise ValueError(f"review must be a mapping, got {entry!r}")
    cid = entry.get("canonical_id")
    if not isinstance(cid, str) or not cid.startswith(CANONICAL_PREFIX):
        raise ValueError(f"review has invalid canonical_id {cid!r}")
    members = entry.get("member_ids")
    if not isinstance(members, list) or not members or not all(isinstance(m, str) for m in members):
        raise ValueError(f"review {cid}: member_ids must be a non-empty list of IDs")
    status, confidence = entry.get("status"), entry.get("confidence")
    if status not in STATUS_RANK:
        raise ValueError(f"review {cid}: invalid status {status!r}")
    if confidence not in CONFIDENCE_RANK:
        raise ValueError(f"review {cid}: invalid confidence {confidence!r}")
    if status == "merged" and confidence == "low":
        raise ValueError(f"review {cid}: a merged decision cannot be low confidence")
    by = entry.get("by")
    if not isinstance(by, str) or not by.strip():
        raise ValueError(f"review {cid}: missing reviewer `by`")
    try:
        at = _iso_date(entry.get("at"))
    except (TypeError, ValueError) as exc:
        raise ValueError(f"review {cid}: `at` must be a YYYY-MM-DD date") from exc
    signal = entry.get("signal") or "manual_review"
    if signal not in REVIEW_SIGNALS:
        raise ValueError(f"review {cid}: signal must be one of {sorted(REVIEW_SIGNALS)}")
    note = entry.get("note")
    note = " ".join(str(note).split()) if note else None
    return Review(cid, tuple(dict.fromkeys(members)), status, confidence, by.strip(), at, note, signal)


def load_reviews(path: str | Path = REVIEWS_PATH) -> list[Review]:
    """Parse reviews.yaml. A missing or empty file means no reviews."""
    path = Path(path)
    if not path.exists():
        return []
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    if data is None:
        return []
    if not isinstance(data, list):
        raise ValueError(f"{path}: expected a list of review decisions")
    return [parse_review(e) for e in data]


def apply_reviews(
    decisions: list[PairDecision],
    reviews: Iterable[Review],
    canonicals: Mapping[str, PersonRecord],
    sources: Mapping[str, PersonRecord],
) -> tuple[list[PairDecision], list[Review]]:
    """Replace automated results with manual decisions. Returns (decisions, unapplied).

    For each reviewed (canonical_id, member_id) pair the review's status and
    confidence replace the automated ones, ``reviewed`` is filled in, a
    ``manual_review`` signal is appended, and any conflict flag is cleared (the
    reviewer has ruled on it). A reviewed pair with no automated decision is
    created from the review. Reviews naming a canonical person or member absent
    from this run are returned as unapplied rather than invented. Later
    reviews of the same pair win. When a review merges a member, other
    unreviewed merges of that member into a different canonical person are
    demoted to ``candidate``/``low`` so no record merges twice.
    """
    by_pair = {(d.canonical_id, d.member_id): d for d in decisions}
    out = list(decisions)
    unapplied: list[Review] = []
    for review in reviews:
        members = [m for m in review.member_ids if m in sources]
        if review.canonical_id not in canonicals or not members:
            unapplied.append(review)
            continue
        if len(members) < len(review.member_ids):
            unapplied.append(review)  # partially applied; reported for follow-up
        for mid in members:
            d = by_pair.get((review.canonical_id, mid))
            if d is None:
                d = PairDecision(review.canonical_id, mid, review.status, review.confidence, [])
                by_pair[(review.canonical_id, mid)] = d
                out.append(d)
            d.status, d.confidence, d.conflict = review.status, review.confidence, False
            d.signals = [s for s in d.signals if s.signal not in REVIEW_SIGNALS] + [review.to_signal()]
            d.reviewed = review.reviewed_field()

    for d in out:
        if d.reviewed is None or d.status != "merged":
            continue
        for other in out:
            if (
                other.member_id == d.member_id
                and other.canonical_id != d.canonical_id
                and other.reviewed is None
                and other.status == "merged"
            ):
                _mark_conflict(
                    other,
                    Signal(
                        "manual_review",
                        f"{d.member_id} was merged into {d.canonical_id} by manual review; not merged here",
                    ),
                )
    return out, unapplied


# ---------------------------------------------------------------------------
# Aggregation and output
# ---------------------------------------------------------------------------


def aggregate(decisions: Iterable[PairDecision]) -> tuple[list[dict], list[PairDecision]]:
    """One match entry per canonical_id, sorted by it. Returns (matches, deferred).

    The entry takes the highest-precedence status among the canonical person's
    pairs (merged > candidate > rejected) and the lowest confidence among the
    pairs it includes. Pairs with a lower-precedence status are deferred.
    """
    by_canonical: dict[str, list[PairDecision]] = defaultdict(list)
    for d in decisions:
        by_canonical[d.canonical_id].append(d)

    matches: list[dict] = []
    deferred: list[PairDecision] = []
    for cid in sorted(by_canonical):
        group = by_canonical[cid]
        status = max((d.status for d in group), key=STATUS_RANK.__getitem__)
        kept = sorted((d for d in group if d.status == status), key=lambda d: d.member_id)
        deferred.extend(sorted((d for d in group if d.status != status), key=lambda d: d.member_id))
        confidence = min((d.confidence for d in kept), key=CONFIDENCE_RANK.__getitem__)
        signals: list[dict] = []
        for d in kept:
            for s in d.signals:
                js = s.to_json()
                if js not in signals:
                    signals.append(js)
        entry = {
            "canonical_id": cid,
            "status": status,
            "confidence": confidence,
            "member_ids": [d.member_id for d in kept],
            "signals": signals,
        }
        # The schema allows one `reviewed` per entry: use the latest review among kept pairs.
        reviewed = [d.reviewed for d in kept if d.reviewed]
        if reviewed:
            entry["reviewed"] = dict(max(reviewed, key=lambda r: (r["at"], r["by"])))
        matches.append(entry)
    return matches, deferred


@dataclass
class MatchRun:
    decisions: list[PairDecision]
    matches: list[dict]
    deferred: list[PairDecision]
    ambiguous: set[str]
    # Review decisions that could not be applied (unknown canonical or member ID).
    unapplied_reviews: list["Review"] = field(default_factory=list)

    def document(self, generated_at: str | None = None) -> dict:
        return build_document(self, generated_at=generated_at)


def run_matching(
    people_doc: Mapping,
    source_docs: Iterable[Mapping],
    reviews: Iterable["Review"] = (),
) -> MatchRun:
    """Matching end to end, short of writing the file.

    Automated decisions come from ``score_and_decide``; ``reviews`` (from
    ``load_reviews``) then override them pair by pair (Req 3.4), and
    ``enforce_invariants`` runs again so a merged match is never low confidence.
    """
    canonicals = canonical_records(people_doc)
    index = SourceIndex.from_documents(source_docs)
    decisions, ambiguous = score_and_decide(canonicals, index)
    decisions, unapplied = apply_reviews(decisions, reviews, canonicals, index.records)
    decisions = enforce_invariants(decisions)
    matches, deferred = aggregate(decisions)
    return MatchRun(decisions, matches, deferred, ambiguous, unapplied)


def build_document(run: MatchRun, generated_at: str | None = None) -> dict:
    counts: dict[str, int] = defaultdict(int)
    for m in run.matches:
        counts[m["status"]] += 1
    parts = [
        "Automated identity matches: canonical people (people.json) vs source-level persons, "
        "blocked by name and ORCID and scored per design.md. "
        f"{counts['merged']} merged, {counts['candidate']} candidate, {counts['rejected']} rejected."
    ]
    if run.ambiguous:
        parts.append(f"Conflicting evidence (affiliation should be ambiguous): {', '.join(sorted(run.ambiguous))}.")
    if run.deferred:
        listed = "; ".join(
            f"{d.canonical_id} ~ {d.member_id} ({d.status}/{d.confidence}"
            + (f", reviewed by {d.reviewed['by']} {d.reviewed['at']}" if d.reviewed else "")
            + ")"
            for d in run.deferred
        )
        parts.append(f"Pairs not shown because the canonical person has a stronger match: {listed}.")
    reviewed = sum(1 for d in run.decisions if d.reviewed)
    if reviewed:
        parts.append(f"{reviewed} pair(s) overridden by manual review (data/curation/reviews.yaml).")
    if run.unapplied_reviews:
        listed = "; ".join(f"{r.canonical_id} ~ {', '.join(r.member_ids)}" for r in run.unapplied_reviews)
        parts.append(f"Review decisions naming people absent from this run (not or only partly applied): {listed}.")
    return {
        "schema_version": SCHEMA_VERSION,
        "generated_at": generated_at or utc_now_iso(),
        "notes": " ".join(parts),
        "matches": run.matches,
    }


def load_doc(path: str | Path) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def write_matches(path: str | Path, doc: dict) -> Path:
    return write_graph(path, doc)
