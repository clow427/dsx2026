import { otherEnd, type GraphIndex } from "@/data/graphIndex";
import type { BuStatus, GraphEdge, GraphNode } from "@/types/graph";

// People-first view of the graph. Two people are linked when records in the graph
// connect them, and every link keeps those records and the edges that state them,
// so the UI can always show why two people are connected. Nothing is inferred.
//
//   paper  - a COAUTHORED_WITH edge (evidence: the shared works)
//   grant  - both people have a RECEIVED_AWARD edge to the same award
//   funded - one person's award FUNDED_BY-links a publication the other AUTHORED

export type LinkKind = "paper" | "grant" | "funded";

export interface LinkRecord {
  kind: LinkKind;
  /** The publication or award that connects the two people. */
  record: GraphNode;
  /** The graph edges that together state the connection. */
  edges: GraphEdge[];
}

export interface PersonLink {
  /** Stable key: the two person IDs, sorted, joined by "|". */
  id: string;
  a: string;
  b: string;
  records: LinkRecord[];
}

export interface PeopleIndex {
  people: GraphNode[];
  links: Map<string, PersonLink>;
  /** person ID -> (other person ID -> link) */
  adjacency: Map<string, Map<string, PersonLink>>;
}

/** Publications with more authors than this don't create "funded" links (mirrors the research coauthor cap). */
const MAX_FUNDED_AUTHORS = 25;

export const STATUS_RANK: Record<BuStatus, number> = {
  verified_alumnus: 0,
  bu_affiliated_researcher: 1,
  ambiguous: 2,
  unverified: 3,
};

export function statusOf(node: GraphNode | undefined): BuStatus {
  return node?.bu_affiliation?.status ?? "unverified";
}

export function isBuPerson(node: GraphNode | undefined): boolean {
  const s = statusOf(node);
  return s === "verified_alumnus" || s === "bu_affiliated_researcher";
}

export function linkKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function buildPeopleIndex(index: GraphIndex): PeopleIndex {
  const links = new Map<string, PersonLink>();
  const adjacency = new Map<string, Map<string, PersonLink>>();
  const people = index.byType.person;
  for (const p of people) adjacency.set(p.id, new Map());

  const add = (a: string, b: string, rec: LinkRecord) => {
    if (a === b || !adjacency.has(a) || !adjacency.has(b)) return;
    const id = linkKey(a, b);
    let link = links.get(id);
    if (!link) {
      const [x, y] = a < b ? [a, b] : [b, a];
      link = { id, a: x, b: y, records: [] };
      links.set(id, link);
      adjacency.get(a)!.set(b, link);
      adjacency.get(b)!.set(a, link);
    }
    if (!link.records.some((r) => r.kind === rec.kind && r.record.id === rec.record.id)) link.records.push(rec);
  };

  for (const e of index.doc.edges) {
    if (e.type === "COAUTHORED_WITH") {
      // One record per shared work the edge cites.
      for (const ev of e.evidence) {
        const pub = ev.record_id ? index.nodes.get(`publication:openalex:${ev.record_id}`) : undefined;
        if (pub) add(e.source, e.target, { kind: "paper", record: pub, edges: [e] });
      }
    }
  }

  for (const award of index.byType.award) {
    const awardEdges = index.edgesByNode.get(award.id) ?? [];
    const pis = awardEdges.filter((e) => e.type === "RECEIVED_AWARD");
    for (let i = 0; i < pis.length; i++) {
      for (let j = i + 1; j < pis.length; j++) {
        add(pis[i].source, pis[j].source, { kind: "grant", record: award, edges: [pis[i], pis[j]] });
      }
    }
    for (const funded of awardEdges.filter((e) => e.type === "FUNDED_BY" && e.target === award.id)) {
      const pub = index.nodes.get(funded.source);
      if (pub?.type !== "publication") continue;
      const authored = (index.edgesByNode.get(pub.id) ?? []).filter((e) => e.type === "AUTHORED");
      if (authored.length > MAX_FUNDED_AUTHORS) continue;
      for (const pi of pis) {
        for (const au of authored) add(pi.source, au.source, { kind: "funded", record: pub, edges: [pi, funded, au] });
      }
    }
  }
  return { people, links, adjacency };
}

export function linkStrength(link: PersonLink): number {
  return link.records.length;
}

export function linkCounts(link: PersonLink): Record<LinkKind, number> {
  const c: Record<LinkKind, number> = { paper: 0, grant: 0, funded: 0 };
  for (const r of link.records) c[r.kind]++;
  return c;
}

/** "3 papers · 1 grant" */
export function describeLink(link: PersonLink): string {
  const c = linkCounts(link);
  const parts: string[] = [];
  if (c.paper) parts.push(`${c.paper} shared paper${c.paper === 1 ? "" : "s"}`);
  if (c.grant) parts.push(`${c.grant} shared grant${c.grant === 1 ? "" : "s"}`);
  if (c.funded) parts.push(`${c.funded} funded paper${c.funded === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

export interface RankedNeighbor {
  person: GraphNode;
  link: PersonLink;
  status: BuStatus;
  /** Plain-language reason this person is shown, built from the link records. */
  reason: string;
}

export interface NeighborOptions {
  /** Only these statuses (default: all). */
  statuses?: ReadonlySet<BuStatus>;
  /** Link kinds to count (default: all). */
  kinds?: ReadonlySet<LinkKind>;
}

/** Keep only the records of the allowed kinds; null when none remain. */
export function filterLink(link: PersonLink, kinds?: ReadonlySet<LinkKind>): PersonLink | null {
  if (!kinds) return link;
  const records = link.records.filter((r) => kinds.has(r.kind));
  return records.length ? { ...link, records } : null;
}

/** Neighbors ordered: verified alumni, then BU researchers, then others; within each, strongest link first. */
export function rankNeighbors(index: GraphIndex, pidx: PeopleIndex, id: string, opts: NeighborOptions = {}): RankedNeighbor[] {
  const out: RankedNeighbor[] = [];
  for (const [otherId, raw] of pidx.adjacency.get(id) ?? []) {
    const link = filterLink(raw, opts.kinds);
    const person = index.nodes.get(otherId);
    if (!link || !person) continue;
    const status = statusOf(person);
    if (opts.statuses && !opts.statuses.has(status)) continue;
    out.push({ person, link, status, reason: describeLink(link) });
  }
  return out.sort(
    (x, y) =>
      STATUS_RANK[x.status] - STATUS_RANK[y.status] ||
      linkStrength(y.link) - linkStrength(x.link) ||
      (x.person.label < y.person.label ? -1 : x.person.label > y.person.label ? 1 : 0),
  );
}

export interface PathStep {
  person: GraphNode;
  /** The link from the previous step's person to this one (absent on the first step). */
  link?: PersonLink;
}

/**
 * Shortest chain of people between two people (breadth-first, at most `maxHops` links).
 * Among equally short chains it prefers stronger links, then BU people, so the result is
 * deterministic and as well-supported as possible. Returns null when no chain exists.
 */
export function shortestPath(
  index: GraphIndex,
  pidx: PeopleIndex,
  from: string,
  to: string,
  maxHops = 6,
  kinds?: ReadonlySet<LinkKind>,
): PathStep[] | null {
  if (!pidx.adjacency.has(from) || !pidx.adjacency.has(to)) return null;
  if (from === to) return [{ person: index.nodes.get(from)! }];
  const prev = new Map<string, { id: string; link: PersonLink }>();
  const seen = new Set([from]);
  let frontier = [from];
  for (let hop = 0; hop < maxHops && frontier.length; hop++) {
    const next: string[] = [];
    for (const id of frontier) {
      const options = [...(pidx.adjacency.get(id) ?? [])]
        .map(([other, raw]) => [other, filterLink(raw, kinds)] as const)
        .filter((x): x is readonly [string, PersonLink] => x[1] !== null)
        .sort(
          ([oa, la], [ob, lb]) =>
            linkStrength(lb) - linkStrength(la) ||
            STATUS_RANK[statusOf(index.nodes.get(oa))] - STATUS_RANK[statusOf(index.nodes.get(ob))] ||
            (oa < ob ? -1 : 1),
        );
      for (const [other, link] of options) {
        if (seen.has(other)) continue;
        seen.add(other);
        prev.set(other, { id, link });
        if (other === to) return unwind(index, prev, from, to);
        next.push(other);
      }
    }
    frontier = next;
  }
  return null;
}

function unwind(index: GraphIndex, prev: Map<string, { id: string; link: PersonLink }>, from: string, to: string): PathStep[] {
  const steps: PathStep[] = [];
  let cur = to;
  while (cur !== from) {
    const p = prev.get(cur)!;
    steps.push({ person: index.nodes.get(cur)!, link: p.link });
    cur = p.id;
  }
  steps.push({ person: index.nodes.get(from)! });
  return steps.reverse();
}

/** Most-connected people with a status in `statuses`, for "start here" suggestions. */
export function suggestedPeople(index: GraphIndex, pidx: PeopleIndex, statuses: ReadonlySet<BuStatus>, n = 6): GraphNode[] {
  return pidx.people
    .filter((p) => statuses.has(statusOf(p)))
    .map((p) => ({ p, deg: pidx.adjacency.get(p.id)?.size ?? 0 }))
    .filter((x) => x.deg > 0)
    .sort((a, b) => b.deg - a.deg || (a.p.id < b.p.id ? -1 : 1))
    .slice(0, n)
    .map((x) => x.p);
}

/** "PhD, Epidemiology, 2020" from bu_affiliation.details, or null. */
export function degreeLine(node: GraphNode): string | null {
  const d = node.bu_affiliation?.details;
  if (!d) return null;
  const parts = [d.degree, d.department, d.graduation_year ? String(d.graduation_year) : undefined].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

/** Records (publications and awards) a person is directly linked to, newest first. */
export function personRecords(index: GraphIndex, id: string): { record: GraphNode; edge: GraphEdge }[] {
  const out: { record: GraphNode; edge: GraphEdge }[] = [];
  for (const e of index.edgesByNode.get(id) ?? []) {
    if (e.type !== "AUTHORED" && e.type !== "RECEIVED_AWARD" && e.type !== "INVENTED") continue;
    const record = index.nodes.get(otherEnd(e, id));
    if (record) out.push({ record, edge: e });
  }
  const year = (n: GraphNode) => {
    const a = n.attributes ?? {};
    return typeof a.year === "number" ? a.year : typeof a.fiscal_year === "number" ? a.fiscal_year : 0;
  };
  return out.sort((x, y) => year(y.record) - year(x.record) || (x.record.label < y.record.label ? -1 : 1));
}
