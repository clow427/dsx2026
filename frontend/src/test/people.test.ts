import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildIndex } from "@/data/graphIndex";
import { buildCategories } from "@/data/categories";
import {
  buildPeopleIndex,
  describeLink,
  linkKey,
  rankNeighbors,
  shortestPath,
  STATUS_RANK,
  statusOf,
  suggestedPeople,
} from "@/data/people";
import type { GraphDocument, GraphEdge, GraphNode } from "@/types/graph";

const repo = resolve(__dirname, "../../..");
const graphPath = resolve(repo, "data/graph.json");

const ref = (id: string) => [{ source: "openalex" as const, record_id: id, url: `https://example.org/${id}` }];
function person(id: string, status: GraphNode["bu_affiliation"] extends infer A ? A extends { status: infer S } ? S : never : never): GraphNode {
  return { id, type: "person", label: `Example ${id.split(":")[2]}`, sources: ref(id), bu_affiliation: { status, evidence: status === "unverified" ? [] : ref(id) } };
}
function edge(type: GraphEdge["type"], source: string, target: string, evidence = ref(`${source}|${target}`)): GraphEdge {
  return { id: `edge:${type.toLowerCase()}:${source}|${target}`, type, source, target, evidence, confidence: "high", derivation: "source_record" };
}

// MOCK: A-B co-authored W1 and W2; B-C co-authored W3; C and D share an NIH grant;
// D's grant funded W4, which E authored. F is isolated.
const P = (x: string) => `person:openalex:${x}`;
const doc: GraphDocument = {
  schema_version: "0.1.0",
  generated_at: "2026-10-25T00:00:00Z",
  producer: "mock",
  nodes: [
    person(P("A"), "verified_alumnus"),
    person(P("B"), "bu_affiliated_researcher"),
    person(P("C"), "unverified"),
    person(P("D"), "bu_affiliated_researcher"),
    person(P("E"), "verified_alumnus"),
    person(P("F"), "verified_alumnus"),
    ...["W1", "W2", "W3", "W4"].map((w) => ({ id: `publication:openalex:${w}`, type: "publication" as const, label: `MOCK paper ${w}`, sources: ref(w), attributes: { year: 2020 } })),
    { id: "award:nih:R01EX000001", type: "award", label: "MOCK grant", sources: ref("R01EX000001"), attributes: { fiscal_year: 2022 } },
  ],
  edges: [
    edge("COAUTHORED_WITH", P("A"), P("B"), [...ref("W1"), ...ref("W2")]),
    edge("COAUTHORED_WITH", P("B"), P("C"), ref("W3")),
    edge("RECEIVED_AWARD", P("C"), "award:nih:R01EX000001"),
    edge("RECEIVED_AWARD", P("D"), "award:nih:R01EX000001"),
    edge("FUNDED_BY", "publication:openalex:W4", "award:nih:R01EX000001"),
    edge("AUTHORED", P("E"), "publication:openalex:W4"),
  ],
};

describe("people index", () => {
  const index = buildIndex(doc);
  const pidx = buildPeopleIndex(index);

  it("links people only through records, keeping the records and edges", () => {
    const ab = pidx.links.get(linkKey(P("A"), P("B")))!;
    expect(ab.records.map((r) => [r.kind, r.record.id])).toEqual([
      ["paper", "publication:openalex:W1"],
      ["paper", "publication:openalex:W2"],
    ]);
    expect(describeLink(ab)).toBe("2 shared papers");
    const cd = pidx.links.get(linkKey(P("C"), P("D")))!;
    expect(cd.records[0].kind).toBe("grant");
    expect(cd.records[0].edges.map((e) => e.type)).toEqual(["RECEIVED_AWARD", "RECEIVED_AWARD"]);
    const funded = pidx.links.get(linkKey(P("C"), P("E")))!;
    expect(funded.records[0]).toMatchObject({ kind: "funded", record: { id: "publication:openalex:W4" } });
    expect(funded.records[0].edges.map((e) => e.type)).toEqual(["RECEIVED_AWARD", "FUNDED_BY", "AUTHORED"]);
    expect(pidx.adjacency.get(P("F"))!.size).toBe(0);
  });

  it("ranks neighbors alumni first, then BU researchers, then by link strength", () => {
    expect(rankNeighbors(index, pidx, P("B")).map((n) => n.person.id)).toEqual([P("A"), P("C")]);
    expect(rankNeighbors(index, pidx, P("B"), { statuses: new Set(["verified_alumnus"]) }).map((n) => n.person.id)).toEqual([P("A")]);
    expect(rankNeighbors(index, pidx, P("C"), { kinds: new Set(["paper"]) }).map((n) => n.person.id)).toEqual([P("B")]);
  });

  it("finds the shortest chain and respects link kinds", () => {
    const path = shortestPath(index, pidx, P("A"), P("E"))!;
    expect(path.map((s) => s.person.id)).toEqual([P("A"), P("B"), P("C"), P("E")]);
    expect(path[0].link).toBeUndefined();
    expect(path[3].link!.records[0].kind).toBe("funded");
    expect(shortestPath(index, pidx, P("A"), P("E"), 6, new Set(["paper"]))).toBeNull();
    expect(shortestPath(index, pidx, P("A"), P("E"), 2)).toBeNull();
    expect(shortestPath(index, pidx, P("A"), P("F"))).toBeNull();
    expect(shortestPath(index, pidx, P("A"), P("A"))!.length).toBe(1);
  });

  it("suggests only connected people with the requested status", () => {
    // E links to both grant PIs (C, D); A links only to B. F has no links and is never suggested.
    expect(suggestedPeople(index, pidx, new Set(["verified_alumnus"])).map((p) => p.id)).toEqual([P("E"), P("A")]);
  });
});

describe.skipIf(!existsSync(graphPath))("people index on the real graph", () => {
  const index = buildIndex(JSON.parse(readFileSync(graphPath, "utf8")) as GraphDocument);
  const pidx = buildPeopleIndex(index);

  it("every link record is backed by edges that exist in the graph", () => {
    for (const link of pidx.links.values()) {
      for (const r of link.records) {
        expect(index.nodes.has(r.record.id)).toBe(true);
        for (const e of r.edges) expect(index.edges.get(e.id)).toBe(e);
      }
    }
  });

  it("paths between connected alumni are short and every step is a real link", () => {
    const alumni = suggestedPeople(index, pidx, new Set(["verified_alumnus"]), 6);
    const path = shortestPath(index, pidx, alumni[0].id, alumni[alumni.length - 1].id);
    expect(path).not.toBeNull();
    for (let i = 1; i < path!.length; i++) {
      expect(pidx.links.get(linkKey(path![i - 1].person.id, path![i].person.id))).toBe(path![i].link);
    }
  });

  it("neighbor ranking never puts a lower status before a higher one", () => {
    const n = rankNeighbors(index, pidx, suggestedPeople(index, pidx, new Set(["verified_alumnus"]), 1)[0].id);
    for (let i = 1; i < n.length; i++) expect(STATUS_RANK[statusOf(n[i - 1].person)]).toBeLessThanOrEqual(STATUS_RANK[statusOf(n[i].person)]);
  });

  it("categories cover every tagged topic", () => {
    const fields = buildCategories(index);
    const topics = fields.flatMap((f) => f.subfields.flatMap((s) => s.topics));
    expect(topics.length).toBe(index.byType.topic.filter((t) => index.edgesByNode.get(t.id)!.some((e) => e.type === "HAS_TOPIC")).length);
    expect(fields[0].records).toBeGreaterThanOrEqual(fields[fields.length - 1].records);
  });
});
