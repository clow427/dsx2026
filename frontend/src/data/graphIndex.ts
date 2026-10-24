import { NODE_TYPES, type GraphDocument, type GraphEdge, type GraphNode, type NodeType } from "@/types/graph";

// Requirement 2: in-memory indexes and label search grouped by node type.

export interface GraphIndex {
  doc: GraphDocument;
  nodes: Map<string, GraphNode>;
  edges: Map<string, GraphEdge>;
  /** Every edge touching a node, in document order. */
  edgesByNode: Map<string, GraphEdge[]>;
  byType: Record<NodeType, GraphNode[]>;
  /** Lowercased labels, aligned with doc.nodes. */
  lowerLabels: string[];
}

export function buildIndex(doc: GraphDocument): GraphIndex {
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();
  const edgesByNode = new Map<string, GraphEdge[]>();
  const byType = Object.fromEntries(NODE_TYPES.map((t) => [t, [] as GraphNode[]])) as Record<NodeType, GraphNode[]>;

  for (const n of doc.nodes) {
    nodes.set(n.id, n);
    byType[n.type].push(n);
    edgesByNode.set(n.id, []);
  }
  for (const e of doc.edges) {
    edges.set(e.id, e);
    edgesByNode.get(e.source)?.push(e);
    if (e.target !== e.source) edgesByNode.get(e.target)?.push(e);
  }
  return { doc, nodes, edges, edgesByNode, byType, lowerLabels: doc.nodes.map((n) => n.label.toLowerCase()) };
}

export function degree(index: GraphIndex, id: string): number {
  return index.edgesByNode.get(id)?.length ?? 0;
}

export function otherEnd(edge: GraphEdge, id: string): string {
  return edge.source === id ? edge.target : edge.source;
}

export interface SearchGroup {
  type: NodeType;
  total: number;
  results: GraphNode[];
}

/** Search result group order: topics first, since the demo journey starts from a topic. */
const SEARCH_GROUP_ORDER: NodeType[] = ["topic", "person", "publication", "patent", "award", "organization"];

/** Rank: exact label > label prefix > word prefix > substring. Ties: more connections, then ID. */
export function search(index: GraphIndex, query: string, perType = 8): SearchGroup[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: { node: GraphNode; rank: number; deg: number }[] = [];
  index.doc.nodes.forEach((node, i) => {
    const label = index.lowerLabels[i];
    let rank = -1;
    if (label === q || node.id.toLowerCase() === q) rank = 0;
    else if (label.startsWith(q)) rank = 1;
    else if (label.includes(` ${q}`) || label.includes(`-${q}`)) rank = 2;
    else if (label.includes(q)) rank = 3;
    if (rank >= 0) hits.push({ node, rank, deg: degree(index, node.id) });
  });
  hits.sort((a, b) => a.rank - b.rank || b.deg - a.deg || (a.node.id < b.node.id ? -1 : 1));

  const groups: SearchGroup[] = [];
  for (const type of SEARCH_GROUP_ORDER) {
    const ofType = hits.filter((h) => h.node.type === type);
    if (ofType.length) groups.push({ type, total: ofType.length, results: ofType.slice(0, perType).map((h) => h.node) });
  }
  return groups;
}

/** The topic with the most HAS_TOPIC edges. Used as the default scene (the demo topic). */
export function defaultTopic(index: GraphIndex): GraphNode | undefined {
  let best: GraphNode | undefined;
  let bestCount = -1;
  for (const t of index.byType.topic) {
    const count = index.edgesByNode.get(t.id)?.filter((e) => e.type === "HAS_TOPIC").length ?? 0;
    if (count > bestCount || (count === bestCount && best && t.id < best.id)) {
      best = t;
      bestCount = count;
    }
  }
  return best;
}
