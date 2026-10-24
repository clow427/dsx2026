import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { checkGraphShape, GraphShapeError, loadGraph } from "@/data/loadGraph";
import { buildIndex, defaultTopic, search } from "@/data/graphIndex";
import { ALL_FILTERS, applyPreset, edgesAmong, neighborhood, PRESETS } from "@/data/filters";
import { AFFILIATION_BONUS, CONFIDENCE_WEIGHT, explain, rankPeople, resolveTopics } from "@/data/findMyPeople";
import type { GraphDocument } from "@/types/graph";

const repo = resolve(__dirname, "../../..");
const mock = JSON.parse(readFileSync(resolve(repo, "data/mock/graph.sample.json"), "utf8")) as GraphDocument;
const researchPath = resolve(repo, "data/modules/research.json");

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("loadGraph (Requirement 1)", () => {
  it("accepts the mock and flags it as mock", async () => {
    const fetchImpl = (async (url: string) => (url.endsWith("graph.json") ? new Response("", { status: 404 }) : jsonResponse(mock))) as typeof fetch;
    const loaded = await loadGraph(fetchImpl);
    expect(loaded.isMock).toBe(true);
    expect(loaded.url).toMatch(/graph\.sample\.json$/);
  });

  it("treats an HTML SPA fallback as a missing file", async () => {
    const fetchImpl = (async (url: string) =>
      url.endsWith("graph.json") ? new Response("<!doctype html>", { headers: { "content-type": "text/html" } }) : jsonResponse(mock)) as typeof fetch;
    expect((await loadGraph(fetchImpl)).isMock).toBe(true);
  });

  it("rejects a graph with a dangling edge instead of rendering it", async () => {
    const bad = structuredClone(mock);
    bad.producer = "research";
    bad.edges[0].target = "publication:openalex:W_missing";
    const fetchImpl = (async () => jsonResponse(bad)) as typeof fetch;
    await expect(loadGraph(fetchImpl)).rejects.toBeInstanceOf(GraphShapeError);
  });

  it("rejects bu_affiliated_researcher without evidence and IDs with a trailing newline", () => {
    const bad = structuredClone(mock);
    bad.nodes[1].bu_affiliation!.evidence = [];
    bad.nodes[3].id = `${bad.nodes[3].id}\n`;
    const problems = checkGraphShape(bad);
    expect(problems.some((p) => p.includes("needs affiliation evidence"))).toBe(true);
    expect(problems.some((p) => p.includes("Invalid node id"))).toBe(true);
  });

  it.skipIf(!existsSync(researchPath))("accepts the committed research module output", () => {
    const research = JSON.parse(readFileSync(researchPath, "utf8"));
    expect(checkGraphShape(research)).toEqual([]);
  });
});

describe("search (Requirement 2)", () => {
  const index = buildIndex(mock);
  it("groups results by node type", () => {
    const groups = search(index, "example");
    expect(groups.map((g) => g.type)).toEqual(["person", "publication", "patent", "award", "organization"]);
  });
  it("returns nothing for no match", () => {
    expect(search(index, "zzz-no-match")).toEqual([]);
  });
  it("picks the topic with the most HAS_TOPIC edges as the demo topic", () => {
    expect(defaultTopic(index)?.id).toBe("topic:openalex:T00001");
  });
});

describe("filters (Requirement 6, property F5)", () => {
  const index = buildIndex(mock);
  const everything = new Set(mock.nodes.map((n) => n.id));
  for (const key of Object.keys(PRESETS) as (keyof typeof PRESETS)[]) {
    it(`the ${key} preset never shows an excluded edge type`, () => {
      const f = applyPreset(ALL_FILTERS, key);
      const allowed = new Set<string>(PRESETS[key].edgeTypes);
      const edges = edgesAmong(index, everything, f, new Set());
      expect(edges.every((e) => allowed.has(e.type))).toBe(true);
      for (const n of mock.nodes) {
        expect(neighborhood(index, n.id, f).neighbors.every((nb) => nb.edges.every((e) => allowed.has(e.type)))).toBe(true);
      }
    });
  }
  it("hides people whose status is filtered out", () => {
    const f = { ...ALL_FILTERS, statuses: new Set(["verified_alumnus"] as const) };
    const nb = neighborhood(index, "publication:openalex:W0000000001", f);
    expect(nb.neighbors.map((n) => n.node.id)).not.toContain("person:openalex:A0000000002");
  });
});

describe("Find My People (Requirement 7, properties F1-F3)", () => {
  const index = buildIndex(mock);

  it("resolves 'AI in healthcare' to the matching topic by label words and initials", () => {
    expect(resolveTopics(index, "AI in healthcare").map((t) => t.id)).toEqual(["topic:openalex:T00001"]);
  });

  it("scores are the weighted sum of returned records plus the affiliation bonus (F1)", () => {
    const ranked = rankPeople(index, resolveTopics(index, "AI in healthcare"));
    expect(ranked.length).toBeGreaterThan(0);
    for (const r of ranked) {
      const sum = r.contributions.reduce((s, c) => s + CONFIDENCE_WEIGHT[c.personEdge.confidence] * CONFIDENCE_WEIGHT[c.topicEdge.confidence], 0);
      expect(r.recordScore).toBeCloseTo(sum);
      expect(r.score).toBeCloseTo(sum + AFFILIATION_BONUS[r.status]);
      expect(explain(r)).toContain("Artificial Intelligence in Healthcare");
    }
  });

  it("only returns people linked through HAS_TOPIC + AUTHORED/INVENTED/RECEIVED_AWARD (F2)", () => {
    for (const r of rankPeople(index, resolveTopics(index, "AI in healthcare"))) {
      for (const c of r.contributions) {
        expect(c.topicEdge.type).toBe("HAS_TOPIC");
        expect(["AUTHORED", "INVENTED", "RECEIVED_AWARD"]).toContain(c.personEdge.type);
        expect([c.personEdge.source, c.personEdge.target]).toContain(r.person.id);
      }
    }
  });

  it("is deterministic regardless of input order, with ties broken by node ID (F3)", () => {
    const shuffled = buildIndex({ ...mock, nodes: [...mock.nodes].reverse(), edges: [...mock.edges].reverse() });
    const a = rankPeople(index, resolveTopics(index, "healthcare")).map((r) => [r.person.id, r.score]);
    const b = rankPeople(shuffled, resolveTopics(shuffled, "healthcare")).map((r) => [r.person.id, r.score]);
    expect(b).toEqual(a);
  });

  it("ranks verified alumni above BU-affiliated researchers when records tie", () => {
    const ranked = rankPeople(index, resolveTopics(index, "healthcare"));
    expect(ranked.map((r) => r.status)).toEqual(["verified_alumnus", "bu_affiliated_researcher"]);
  });
});
