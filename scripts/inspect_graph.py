#!/usr/bin/env python3
"""Print human-readable views of a graph file, with the evidence behind every fact.

Usage:
    python scripts/inspect_graph.py summary
    python scripts/inspect_graph.py examples
    python scripts/inspect_graph.py person "kolachalama"
    python scripts/inspect_graph.py paper "glomeruli"
    python scripts/inspect_graph.py topic "cancer detection"
    python scripts/inspect_graph.py edge "edge:coauthored_with:person:openalex:A1|person:openalex:A2"
    python scripts/inspect_graph.py --file data/mock/graph.sample.json summary

`person`, `paper`, and `topic` take a node ID or a case-insensitive label search.
Read-only: never modifies the graph file.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_FILE = REPO_ROOT / "data" / "modules" / "research.json"

BU_MARK = {
    "verified_alumnus": "[BU alum]",
    "bu_affiliated_researcher": "[BU]",
    "ambiguous": "[ambiguous]",
    "unverified": "",
}


class Graph:
    def __init__(self, doc: dict) -> None:
        self.doc = doc
        self.nodes = {n["id"]: n for n in doc["nodes"]}
        self.edges = {e["id"]: e for e in doc["edges"]}
        self.out: dict[str, list[dict]] = defaultdict(list)
        self.inc: dict[str, list[dict]] = defaultdict(list)
        for e in doc["edges"]:
            self.out[e["source"]].append(e)
            self.inc[e["target"]].append(e)
        # (source, record_id) -> node ID, to show which record an evidence ref points at.
        self.by_record: dict[tuple, str] = {}
        for n in doc["nodes"]:
            for ref in n["sources"]:
                if ref.get("record_id"):
                    self.by_record.setdefault((ref["source"], ref["record_id"]), n["id"])

    def label(self, node_id: str) -> str:
        node = self.nodes.get(node_id)
        if not node:
            return node_id
        mark = BU_MARK.get(node.get("bu_affiliation", {}).get("status"), "")
        return f"{node['label']} {mark}".strip()

    def edges_of(self, node_id: str, edge_type: str) -> list[dict]:
        return [e for e in self.out[node_id] + self.inc[node_id] if e["type"] == edge_type]

    def other(self, edge: dict, node_id: str) -> str:
        return edge["target"] if edge["source"] == node_id else edge["source"]

    def find(self, query: str, node_type: str) -> list[dict]:
        if query in self.nodes and self.nodes[query]["type"] == node_type:
            return [self.nodes[query]]
        q = query.casefold()
        candidates = [n for n in self.doc["nodes"] if n["type"] == node_type]
        exact = [n for n in candidates if n["label"].casefold() == q]
        return exact or [n for n in candidates if q in n["label"].casefold()]


def _refs(refs: list[dict], indent: str = "    ") -> None:
    for ref in refs:
        rid = f" {ref['record_id']}" if ref.get("record_id") else ""
        note = f"  ({ref['note']})" if ref.get("note") else ""
        print(f"{indent}{ref['source']}{rid}: {ref['url']}{note}")


def _header(text: str) -> None:
    print(f"\n=== {text} ===")


def show_summary(g: Graph) -> None:
    doc = g.doc
    _header("Summary")
    print(f"producer={doc['producer']} schema={doc['schema_version']} generated_at={doc['generated_at']}")
    if doc.get("notes"):
        print(f"notes: {doc['notes']}")
    print(f"nodes: {len(g.nodes)}  {dict(Counter(n['type'] for n in doc['nodes']).most_common())}")
    print(f"edges: {len(g.edges)}  {dict(Counter(e['type'] for e in doc['edges']).most_common())}")

    people = [n for n in doc["nodes"] if n["type"] == "person"]
    print(f"people by BU status: {dict(Counter(p['bu_affiliation']['status'] for p in people).most_common())}")
    if people:
        orcid = sum(1 for p in people if "orcid" in p.get("attributes", {}))
        print(f"people with ORCID: {orcid}/{len(people)}")
    pubs = [n for n in doc["nodes"] if n["type"] == "publication"]
    if pubs:
        s2 = sum(1 for p in pubs if any(s["source"] == "semantic_scholar" for s in p["sources"]))
        print(f"publications with a Semantic Scholar source: {s2}/{len(pubs)}")
    print(f"edges by derivation: {dict(Counter(e['derivation'] for e in doc['edges']))}")
    print(f"edges by confidence: {dict(Counter(e['confidence'] for e in doc['edges']))}")

    topic_counts = Counter(e["target"] for e in doc["edges"] if e["type"] == "HAS_TOPIC")
    if topic_counts:
        print("top topics (by publications):")
        for tid, count in topic_counts.most_common(5):
            print(f"  {count:4d}  {g.label(tid)}")
    org_counts = Counter(e["target"] for e in doc["edges"] if e["type"] == "AFFILIATED_WITH")
    if org_counts:
        print("top organizations (by affiliated people):")
        for oid, count in org_counts.most_common(5):
            print(f"  {count:4d}  {g.label(oid)}")


def show_person(g: Graph, node: dict) -> None:
    pid = node["id"]
    _header(f"Person: {g.label(pid)}")
    print(f"id: {pid}")
    if node.get("attributes"):
        print(f"attributes: {json.dumps(node['attributes'])}")
    print("sources:")
    _refs(node["sources"])
    aff = node["bu_affiliation"]
    print(f"BU affiliation: {aff['status']}" + (f"  details={aff['details']}" if aff.get("details") else ""))
    _refs(aff["evidence"]) if aff["evidence"] else print("    (no affiliation evidence)")

    orgs = g.edges_of(pid, "AFFILIATED_WITH")
    if orgs:
        print(f"affiliations ({len(orgs)}):")
        for e in sorted(orgs, key=lambda e: -len(e["evidence"])):
            print(f"  {g.label(e['target'])}  [{len(e['evidence'])} supporting record(s)]")

    papers = g.edges_of(pid, "AUTHORED")
    if papers:
        print(f"publications ({len(papers)}):")
        for e in sorted(papers, key=lambda e: -g.nodes[e["target"]].get("attributes", {}).get("year", 0)):
            pub = g.nodes[e["target"]]
            year = pub.get("attributes", {}).get("year", "----")
            print(f"  {year}  {pub['label'][:90]}")
            print(f"        {e['evidence'][0]['url']}" + (f"  ({e['note']})" if e.get("note") else ""))

    coauthors = g.edges_of(pid, "COAUTHORED_WITH")
    if coauthors:
        print(f"coauthors ({len(coauthors)}; top 10 by shared publications):")
        for e in sorted(coauthors, key=lambda e: (-len(e["evidence"]), g.label(g.other(e, pid))))[:10]:
            print(f"  {len(e['evidence']):2d} shared  {g.label(g.other(e, pid))}")

    topics = Counter()
    for e in papers:
        for t in g.edges_of(e["target"], "HAS_TOPIC"):
            topics[t["target"]] += 1
    if topics:
        print("topics (derived from their publications' HAS_TOPIC edges):")
        for tid, count in topics.most_common(5):
            print(f"  {count:2d}  {g.label(tid)}")


def show_paper(g: Graph, node: dict) -> None:
    wid = node["id"]
    _header(f"Publication: {node['label']}")
    print(f"id: {wid}")
    if node.get("attributes"):
        print(f"attributes: {json.dumps(node['attributes'], ensure_ascii=False)}")
    print("sources:")
    _refs(node["sources"])
    authors = g.edges_of(wid, "AUTHORED")
    print(f"authors ({len(authors)}):")
    for e in authors:
        orgs = [
            g.label(a["target"])
            for a in g.edges_of(e["source"], "AFFILIATED_WITH")
            if any(r.get("record_id") == wid.split(":", 2)[2] for r in a["evidence"])
        ]
        note = f"  ({e['note']})" if e.get("note") else ""
        print(f"  {g.label(e['source'])}{note}")
        if orgs:
            print(f"      at: {'; '.join(orgs)}")
    topics = g.edges_of(wid, "HAS_TOPIC")
    if topics:
        print("topics:")
        for e in topics:
            print(f"  {g.label(e['target'])}" + (f"  ({e['note']})" if e.get("note") else ""))


def show_topic(g: Graph, node: dict) -> None:
    tid = node["id"]
    _header(f"Topic: {node['label']}")
    print(f"id: {tid}")
    if node.get("attributes"):
        print(f"attributes: {json.dumps(node['attributes'])}")
    print("sources:")
    _refs(node["sources"])
    pubs = [e["source"] for e in g.edges_of(tid, "HAS_TOPIC")]
    print(f"publications with this topic: {len(pubs)}")

    # Rank BU-linked people by how many of their publications carry the topic.
    # Every count traces to AUTHORED + HAS_TOPIC edges, listed below each person.
    people: dict[str, list[str]] = defaultdict(list)
    for pub in pubs:
        for e in g.edges_of(pub, "AUTHORED"):
            people[e["source"]].append(pub)
    bu = {
        p: works
        for p, works in people.items()
        if g.nodes[p]["bu_affiliation"]["status"] in ("verified_alumnus", "bu_affiliated_researcher")
    }
    print(f"BU-linked people on this topic (top 5 of {len(bu)}, by publications with the topic):")
    for pid, works in sorted(bu.items(), key=lambda kv: (-len(kv[1]), g.label(kv[0])))[:5]:
        print(f"  {len(works):2d}  {g.label(pid)}  ({pid})")
        for w in works[:3]:
            print(f"        {g.nodes[w]['label'][:70]}  {g.nodes[w]['sources'][0]['url']}")


def show_edge(g: Graph, edge: dict) -> None:
    _header(f"Edge: {edge['type']}")
    print(f"id: {edge['id']}")
    print(f"{g.label(edge['source'])}  --{edge['type']}-->  {g.label(edge['target'])}")
    print(f"confidence={edge['confidence']} derivation={edge['derivation']}" + (f" note={edge['note']}" if edge.get("note") else ""))
    print(f"evidence ({len(edge['evidence'])}):")
    for ref in edge["evidence"]:
        rid = ref.get("record_id")
        node_id = g.by_record.get((ref["source"], rid))
        title = f" - {g.nodes[node_id]['label'][:70]}" if node_id else ""
        print(f"    {ref['source']} {rid or ''}: {ref['url']}{title}")


def show_examples(g: Graph) -> None:
    """One of each view, chosen deterministically to show the richest records."""
    show_summary(g)
    people = [n for n in g.doc["nodes"] if n["type"] == "person"]
    bu = [p for p in people if p["bu_affiliation"]["status"] != "unverified"]
    if bu:
        best = max(bu, key=lambda p: (len(g.edges_of(p["id"], "AUTHORED")), p["id"]))
        show_person(g, best)
    pubs = [n for n in g.doc["nodes"] if n["type"] == "publication"]
    if pubs:
        multi = [p for p in pubs if len(p["sources"]) > 1] or pubs
        show_paper(g, min(multi, key=lambda p: (len(g.edges_of(p["id"], "AUTHORED")), p["id"])))
    coauthor = [e for e in g.doc["edges"] if e["type"] == "COAUTHORED_WITH"]
    if coauthor:
        show_edge(g, max(coauthor, key=lambda e: (len(e["evidence"]), e["id"])))
    topics = Counter(e["target"] for e in g.doc["edges"] if e["type"] == "HAS_TOPIC")
    if topics:
        show_topic(g, g.nodes[topics.most_common(1)[0][0]])


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--file", type=Path, default=DEFAULT_FILE, help=f"graph file (default {DEFAULT_FILE.relative_to(REPO_ROOT)})")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("summary")
    sub.add_parser("examples")
    for name in ("person", "paper", "topic"):
        sub.add_parser(name).add_argument("query", help="node ID or label search")
    sub.add_parser("edge").add_argument("edge_id")
    args = parser.parse_args(argv)

    if not args.file.exists():
        print(f"{args.file} not found. Run: python -m pipelines.research.run", file=sys.stderr)
        return 1
    g = Graph(json.loads(args.file.read_text(encoding="utf-8")))

    if args.command == "summary":
        show_summary(g)
    elif args.command == "examples":
        show_examples(g)
    elif args.command == "edge":
        if args.edge_id not in g.edges:
            print(f"no edge with id {args.edge_id!r}", file=sys.stderr)
            return 1
        show_edge(g, g.edges[args.edge_id])
    else:
        node_type = {"person": "person", "paper": "publication", "topic": "topic"}[args.command]
        matches = g.find(args.query, node_type)
        if not matches:
            print(f"no {node_type} matching {args.query!r}", file=sys.stderr)
            return 1
        if len(matches) > 1:
            print(f"{len(matches)} matches for {args.query!r}; showing the first. Others:")
            for n in matches[1:11]:
                print(f"  {n['id']}  {g.label(n['id'])}")
        {"person": show_person, "publication": show_paper, "topic": show_topic}[node_type](g, matches[0])
    return 0


if __name__ == "__main__":
    sys.exit(main())
