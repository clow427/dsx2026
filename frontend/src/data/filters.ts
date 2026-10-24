import { BU_STATUSES, EDGE_TYPES, SOURCE_NAMES, type BuStatus, type EdgeType, type GraphEdge, type GraphNode, type SourceName } from "@/types/graph";
import { degree, otherEnd, type GraphIndex } from "./graphIndex";

// Requirement 6: filter by BU affiliation status, topic, source type, and relationship type.

export interface Filters {
  edgeTypes: ReadonlySet<EdgeType>;
  statuses: ReadonlySet<BuStatus>;
  sources: ReadonlySet<SourceName>;
  /** Topic node IDs. Empty means "any topic". */
  topics: ReadonlySet<string>;
}

export const ALL_FILTERS: Filters = {
  edgeTypes: new Set(EDGE_TYPES),
  statuses: new Set(BU_STATUSES),
  sources: new Set(SOURCE_NAMES),
  topics: new Set(),
};

/** Requirement 6.2 presets. Only the edge types change; the other filters are kept. */
export const PRESETS = {
  research: { label: "Research connections", edgeTypes: ["AUTHORED", "COAUTHORED_WITH", "HAS_TOPIC"] },
  patent: { label: "Patent connections", edgeTypes: ["INVENTED", "ASSIGNED_TO"] },
} as const satisfies Record<string, { label: string; edgeTypes: readonly EdgeType[] }>;

export type PresetKey = keyof typeof PRESETS;

export function applyPreset(filters: Filters, preset: PresetKey): Filters {
  return { ...filters, edgeTypes: new Set(PRESETS[preset].edgeTypes) };
}

export function activePreset(filters: Filters): PresetKey | null {
  for (const key of Object.keys(PRESETS) as PresetKey[]) {
    const types = PRESETS[key].edgeTypes as readonly EdgeType[];
    if (types.length === filters.edgeTypes.size && types.every((t) => filters.edgeTypes.has(t))) return key;
  }
  return null;
}

const TOPIC_FILTERED_TYPES = new Set(["publication", "patent", "award"]);

export function nodePasses(index: GraphIndex, node: GraphNode, f: Filters): boolean {
  if (node.type === "person" && node.bu_affiliation && !f.statuses.has(node.bu_affiliation.status)) return false;
  if (!node.sources.some((s) => f.sources.has(s.source))) return false;
  if (f.topics.size) {
    if (node.type === "topic") return f.topics.has(node.id);
    if (TOPIC_FILTERED_TYPES.has(node.type)) {
      const linked = index.edgesByNode.get(node.id)?.some((e) => e.type === "HAS_TOPIC" && f.topics.has(otherEnd(e, node.id)));
      if (!linked) return false;
    }
  }
  return true;
}

export function edgePasses(index: GraphIndex, edge: GraphEdge, f: Filters): boolean {
  if (!f.edgeTypes.has(edge.type)) return false;
  if (!edge.evidence.some((s) => f.sources.has(s.source))) return false;
  const a = index.nodes.get(edge.source);
  const b = index.nodes.get(edge.target);
  return !!a && !!b && nodePasses(index, a, f) && nodePasses(index, b, f);
}

export interface Neighborhood {
  /** Neighbors kept after filtering, ranked by connection count then ID. */
  neighbors: { node: GraphNode; edges: GraphEdge[] }[];
  /** Total neighbors that pass the filters (before the cap). */
  total: number;
}

/** Filtered 1-hop neighborhood of `id`, ranked deterministically and capped at `limit`. */
export function neighborhood(index: GraphIndex, id: string, f: Filters, limit = Infinity): Neighborhood {
  const byOther = new Map<string, GraphEdge[]>();
  for (const e of index.edgesByNode.get(id) ?? []) {
    if (!edgePassesFromFocus(index, e, id, f)) continue;
    const other = otherEnd(e, id);
    const list = byOther.get(other);
    if (list) list.push(e);
    else byOther.set(other, [e]);
  }
  const neighbors = [...byOther.entries()]
    .map(([otherId, edges]) => ({ node: index.nodes.get(otherId)!, edges, deg: degree(index, otherId) }))
    .sort((a, b) => b.edges.length - a.edges.length || b.deg - a.deg || (a.node.id < b.node.id ? -1 : 1));
  return { neighbors: neighbors.slice(0, limit).map(({ node, edges }) => ({ node, edges })), total: neighbors.length };
}

/**
 * The focused node itself is always shown, even if it fails a node filter, so the user
 * can still see what they selected. Its edges still obey the edge filters.
 */
function edgePassesFromFocus(index: GraphIndex, e: GraphEdge, focusId: string, f: Filters): boolean {
  if (!f.edgeTypes.has(e.type)) return false;
  if (!e.evidence.some((s) => f.sources.has(s.source))) return false;
  const other = index.nodes.get(otherEnd(e, focusId));
  return !!other && nodePasses(index, other, f);
}

/** Edges among `visible` that pass the filters. Edges touching a pinned node skip that node's node filter. */
export function edgesAmong(index: GraphIndex, visible: ReadonlySet<string>, f: Filters, pinned: ReadonlySet<string>): GraphEdge[] {
  const out: GraphEdge[] = [];
  const seen = new Set<string>();
  for (const id of visible) {
    for (const e of index.edgesByNode.get(id) ?? []) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      if (!visible.has(e.source) || !visible.has(e.target)) continue;
      if (!f.edgeTypes.has(e.type) || !e.evidence.some((s) => f.sources.has(s.source))) continue;
      const okA = pinned.has(e.source) || nodePasses(index, index.nodes.get(e.source)!, f);
      const okB = pinned.has(e.target) || nodePasses(index, index.nodes.get(e.target)!, f);
      if (okA && okB) out.push(e);
    }
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : 1));
}
