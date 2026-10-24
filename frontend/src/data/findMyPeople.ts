import type { BuStatus, Confidence, GraphEdge, GraphNode } from "@/types/graph";
import { otherEnd, type GraphIndex } from "./graphIndex";

// Requirement 7: deterministic, evidence-backed ranking. No LLM.
// Algorithm: .kiro/specs/frontend-explorer/design.md "Find My People ranking".

export const CONFIDENCE_WEIGHT: Record<Confidence, number> = { high: 1, medium: 0.6, low: 0.2 };

/** Small tie-breaking bonus. Ordered verified_alumnus > bu_affiliated_researcher. */
export const AFFILIATION_BONUS: Record<BuStatus, number> = {
  verified_alumnus: 0.5,
  bu_affiliated_researcher: 0.25,
  unverified: 0,
  ambiguous: 0,
};

/** Person-to-record edge types, keyed by the record's node type. */
const PERSON_RECORD_EDGES = { publication: "AUTHORED", patent: "INVENTED", award: "RECEIVED_AWARD" } as const;
const RECORD_TYPES = new Set(Object.keys(PERSON_RECORD_EDGES));

const STOPWORDS = new Set(["a", "an", "and", "the", "of", "in", "for", "on", "to", "with"]);

function words(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/** True when `token` is the initials of consecutive words, e.g. "ai" for "artificial intelligence". */
function isAcronymOf(token: string, labelWords: string[]): boolean {
  if (token.length < 2 || token.length > 5) return false;
  for (let i = 0; i + token.length <= labelWords.length; i++) {
    if ([...token].every((ch, j) => labelWords[i + j][0] === ch)) return true;
  }
  return false;
}

/**
 * Step 1: resolve a query to topic nodes by ID or label. Each non-stopword query token must
 * match a label word by prefix or a run of word initials. Pure string matching on labels.
 */
export function resolveTopics(index: GraphIndex, query: string): GraphNode[] {
  const q = query.trim();
  if (!q) return [];
  const exact = index.nodes.get(q);
  if (exact?.type === "topic") return [exact];
  const tokens = words(q).filter((t) => !STOPWORDS.has(t));
  if (!tokens.length) return [];
  return index.byType.topic
    .filter((t) => {
      const lw = words(t.label);
      return tokens.every((tok) => lw.some((w) => w.startsWith(tok)) || isAcronymOf(tok, lw));
    })
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

export interface Contribution {
  record: GraphNode;
  /** The AUTHORED / INVENTED / RECEIVED_AWARD edge linking the person to the record. */
  personEdge: GraphEdge;
  /** The strongest HAS_TOPIC edge linking the record to one of the topics. */
  topicEdge: GraphEdge;
  topic: GraphNode;
  /** CONFIDENCE_WEIGHT[personEdge] x CONFIDENCE_WEIGHT[topicEdge]. */
  weight: number;
}

export interface RankedPerson {
  person: GraphNode;
  status: BuStatus;
  contributions: Contribution[];
  recordScore: number;
  bonus: number;
  score: number;
}

export interface RankOptions {
  /** Only return people whose status is in this set. Defaults to every status. */
  statuses?: ReadonlySet<BuStatus>;
}

export function rankPeople(index: GraphIndex, topics: GraphNode[], opts: RankOptions = {}): RankedPerson[] {
  const topicIds = new Set(topics.map((t) => t.id));

  // Step 2: records linked to the topics through HAS_TOPIC, keeping the strongest topic edge.
  const records = new Map<string, { topicEdge: GraphEdge; weight: number }>();
  for (const topicId of topicIds) {
    for (const e of index.edgesByNode.get(topicId) ?? []) {
      if (e.type !== "HAS_TOPIC") continue;
      const recordId = otherEnd(e, topicId);
      const record = index.nodes.get(recordId);
      if (!record || !RECORD_TYPES.has(record.type)) continue;
      const w = CONFIDENCE_WEIGHT[e.confidence];
      const cur = records.get(recordId);
      if (!cur || w > cur.weight || (w === cur.weight && e.id < cur.topicEdge.id)) records.set(recordId, { topicEdge: e, weight: w });
    }
  }

  // Step 3: people linked to those records, one contribution per distinct record.
  const byPerson = new Map<string, Map<string, Contribution>>();
  for (const [recordId, { topicEdge, weight: topicWeight }] of records) {
    const record = index.nodes.get(recordId)!;
    const wantedType = PERSON_RECORD_EDGES[record.type as keyof typeof PERSON_RECORD_EDGES];
    for (const e of index.edgesByNode.get(recordId) ?? []) {
      if (e.type !== wantedType) continue;
      const person = index.nodes.get(otherEnd(e, recordId));
      if (person?.type !== "person") continue;
      const weight = CONFIDENCE_WEIGHT[e.confidence] * topicWeight;
      let contribs = byPerson.get(person.id);
      if (!contribs) byPerson.set(person.id, (contribs = new Map()));
      const cur = contribs.get(recordId);
      if (!cur || weight > cur.weight || (weight === cur.weight && e.id < cur.personEdge.id)) {
        contribs.set(recordId, { record, personEdge: e, topicEdge, topic: index.nodes.get(otherEnd(topicEdge, recordId))!, weight });
      }
    }
  }

  // Step 4: score. Step 5: return contributions so the UI can explain the score.
  const ranked: RankedPerson[] = [];
  for (const [personId, contribs] of byPerson) {
    const person = index.nodes.get(personId)!;
    const status = person.bu_affiliation?.status ?? "unverified";
    if (opts.statuses && !opts.statuses.has(status)) continue;
    const contributions = [...contribs.values()].sort(
      (a, b) => b.weight - a.weight || recordYear(b.record) - recordYear(a.record) || (a.record.id < b.record.id ? -1 : 1),
    );
    const recordScore = contributions.reduce((s, c) => s + c.weight, 0);
    const bonus = AFFILIATION_BONUS[status];
    ranked.push({ person, status, contributions, recordScore, bonus, score: recordScore + bonus });
  }
  return ranked.sort((a, b) => b.score - a.score || (a.person.id < b.person.id ? -1 : 1));
}

function recordYear(n: GraphNode): number {
  const y = n.attributes?.year;
  return typeof y === "number" ? y : 0;
}

const RECORD_NOUN: Record<string, [string, string]> = {
  publication: ["publication", "publications"],
  patent: ["patent", "patents"],
  award: ["award", "awards"],
};

/** "Why this person", built only from the returned edges. */
export function explain(r: RankedPerson): string {
  const counts = new Map<string, number>();
  for (const c of r.contributions) counts.set(c.record.type, (counts.get(c.record.type) ?? 0) + 1);
  const parts = [...counts.entries()].map(([type, n]) => `${n} ${RECORD_NOUN[type][n === 1 ? 0 : 1]}`);
  const topics = [...new Set(r.contributions.map((c) => c.topic.label))];
  const conf = new Set(r.contributions.flatMap((c) => [c.personEdge.confidence, c.topicEdge.confidence]));
  const confText = conf.size === 1 ? `all ${[...conf][0]} confidence` : `confidence: ${[...conf].join(", ")}`;
  return `Linked to ${parts.join(", ")} tagged ${topics.map((t) => `"${t}"`).join(", ")} (${confText}).`;
}
