import {
  BU_STATUSES,
  CONFIDENCES,
  DERIVATIONS,
  EDGE_TYPES,
  NODE_TYPES,
  PRODUCERS,
  SCHEMA_VERSION,
  type GraphDocument,
} from "@/types/graph";

// Requirement 1: load graph.json, fall back to the mock, and never show a blank screen.

export const GRAPH_URL = `${import.meta.env.BASE_URL}data/graph.json`;
export const MOCK_URL = `${import.meta.env.BASE_URL}data/graph.sample.json`;

/** Same pattern as schema/graph.schema.json#/definitions/nodeId (full match, see C12). */
const NODE_ID_RE = /^(person|publication|patent|award|organization|topic):[a-z0-9_]+:[A-Za-z0-9._-]+$/;

export interface LoadedGraph {
  doc: GraphDocument;
  /** True when the app fell back to data/mock/graph.sample.json. */
  isMock: boolean;
  url: string;
}

export class GraphShapeError extends Error {
  constructor(
    public readonly url: string,
    public readonly problems: string[],
  ) {
    super(`Graph at ${url} failed shape checks: ${problems.slice(0, 3).join("; ")}`);
    this.name = "GraphShapeError";
  }
}

const MAX_PROBLEMS = 20;

/**
 * Structural checks that mirror the parts of the contract the UI relies on.
 * The Python validator stays the source of truth; this only guards the UI against bad files.
 */
export function checkGraphShape(raw: unknown): string[] {
  const problems: string[] = [];
  const add = (msg: string) => {
    if (problems.length < MAX_PROBLEMS) problems.push(msg);
  };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return ["Document is not a JSON object"];
  const doc = raw as Record<string, unknown>;

  if (doc.schema_version !== SCHEMA_VERSION) add(`schema_version must be ${SCHEMA_VERSION}, got ${String(doc.schema_version)}`);
  if (typeof doc.generated_at !== "string") add("generated_at is missing");
  if (!PRODUCERS.includes(doc.producer as never)) add(`Unknown producer ${String(doc.producer)}`);
  if (!Array.isArray(doc.nodes)) add("nodes must be an array");
  if (!Array.isArray(doc.edges)) add("edges must be an array");
  if (problems.length) return problems;

  const ids = new Set<string>();
  for (const n of doc.nodes as Record<string, unknown>[]) {
    const id = n?.id;
    if (typeof id !== "string" || !NODE_ID_RE.test(id)) {
      add(`Invalid node id ${JSON.stringify(id)}`);
      continue;
    }
    if (ids.has(id)) add(`Duplicate node id ${id}`);
    ids.add(id);
    if (!NODE_TYPES.includes(n.type as never)) add(`${id}: unknown type ${String(n.type)}`);
    else if (!id.startsWith(`${n.type}:`)) add(`${id}: id prefix does not match type ${n.type}`);
    if (typeof n.label !== "string" || !n.label) add(`${id}: missing label`);
    if (!hasRefs(n.sources)) add(`${id}: needs at least one source with a url`);
    const aff = n.bu_affiliation as Record<string, unknown> | undefined;
    if (n.type === "person") {
      if (!aff || !BU_STATUSES.includes(aff.status as never) || !Array.isArray(aff.evidence)) {
        add(`${id}: person needs a valid bu_affiliation`);
      } else if ((aff.status === "verified_alumnus" || aff.status === "bu_affiliated_researcher") && !hasRefs(aff.evidence)) {
        add(`${id}: ${aff.status} needs affiliation evidence`);
      }
    } else if (aff !== undefined) {
      add(`${id}: only person nodes may have bu_affiliation`);
    }
  }

  const edgeIds = new Set<string>();
  for (const e of doc.edges as Record<string, unknown>[]) {
    const id = typeof e?.id === "string" ? e.id : "";
    if (!id.startsWith("edge:")) {
      add(`Invalid edge id ${JSON.stringify(e?.id)}`);
      continue;
    }
    if (edgeIds.has(id)) add(`Duplicate edge id ${id}`);
    edgeIds.add(id);
    if (!EDGE_TYPES.includes(e.type as never)) add(`${id}: unknown edge type ${String(e.type)}`);
    if (!ids.has(e.source as string)) add(`${id}: references missing node ${String(e.source)}`);
    if (!ids.has(e.target as string)) add(`${id}: references missing node ${String(e.target)}`);
    if (!hasRefs(e.evidence)) add(`${id}: needs at least one evidence record with a url`);
    if (!CONFIDENCES.includes(e.confidence as never)) add(`${id}: invalid confidence ${String(e.confidence)}`);
    if (!DERIVATIONS.includes(e.derivation as never)) add(`${id}: invalid derivation ${String(e.derivation)}`);
  }
  return problems;
}

function hasRefs(refs: unknown): boolean {
  return (
    Array.isArray(refs) &&
    refs.length > 0 &&
    refs.every((r) => r && typeof r === "object" && typeof (r as { url?: unknown }).url === "string" && typeof (r as { source?: unknown }).source === "string")
  );
}

/** Returns the parsed JSON, or null when the file is absent (404 or an HTML SPA fallback). */
async function fetchJson(url: string, fetchImpl: typeof fetch): Promise<unknown | null> {
  const res = await fetchImpl(url, { headers: { Accept: "application/json" } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
  const type = res.headers.get("content-type") ?? "";
  if (type.includes("text/html")) return null;
  return res.json();
}

export async function loadGraph(fetchImpl: typeof fetch = fetch): Promise<LoadedGraph> {
  let url = GRAPH_URL;
  let raw = await fetchJson(url, fetchImpl);
  let isMock = false;
  if (raw === null) {
    url = MOCK_URL;
    raw = await fetchJson(url, fetchImpl);
    isMock = true;
    if (raw === null) throw new Error("No graph data found: neither graph.json nor the mock sample is available");
  }
  const problems = checkGraphShape(raw);
  if (problems.length) throw new GraphShapeError(url, problems);
  const doc = raw as GraphDocument;
  return { doc, isMock: isMock || doc.producer === "mock", url };
}
