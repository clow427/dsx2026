// TypeScript mirror of schema/graph.schema.json (schema_version 0.1.0).
// Keep in sync with the schema. Changing the contract requires a schema_version bump.

export const SCHEMA_VERSION = "0.1.0" as const;

export const NODE_TYPES = ["person", "publication", "patent", "award", "organization", "topic"] as const;
export type NodeType = (typeof NODE_TYPES)[number];

export const EDGE_TYPES = [
  "AUTHORED",
  "COAUTHORED_WITH",
  "INVENTED",
  "ASSIGNED_TO",
  "RECEIVED_AWARD",
  "FUNDED_BY",
  "AFFILIATED_WITH",
  "HAS_TOPIC",
  "SAME_AS_CANDIDATE",
] as const;
export type EdgeType = (typeof EDGE_TYPES)[number];

export const CONFIDENCES = ["high", "medium", "low"] as const;
export type Confidence = (typeof CONFIDENCES)[number];

export const DERIVATIONS = ["source_record", "derived", "identity_match"] as const;
export type Derivation = (typeof DERIVATIONS)[number];

export const PRODUCERS = ["research", "identity", "innovation", "merge", "mock"] as const;
export type Producer = (typeof PRODUCERS)[number];

export const SOURCE_NAMES = [
  "openalex",
  "semantic_scholar",
  "patentsview",
  "nih_reporter",
  "nsf_awards",
  "bu_repository",
  "institutional_bio",
  "professional_profile",
  "user_submitted",
  "manual_curation",
] as const;
export type SourceName = (typeof SOURCE_NAMES)[number];

export const BU_STATUSES = ["verified_alumnus", "bu_affiliated_researcher", "unverified", "ambiguous"] as const;
export type BuStatus = (typeof BU_STATUSES)[number];

export interface SourceRef {
  source: SourceName;
  /** Original identifier in the source system. */
  record_id?: string;
  url: string;
  retrieved_at?: string;
  note?: string;
}

export interface BuAffiliation {
  status: BuStatus;
  evidence: SourceRef[];
  /** Only fields stated by a source in `evidence`. */
  details?: {
    degree?: string;
    department?: string;
    graduation_year?: number;
  };
}

export interface GraphNode {
  id: string;
  type: NodeType;
  label: string;
  sources: SourceRef[];
  /** Required for person nodes, forbidden for all others. */
  bu_affiliation?: BuAffiliation;
  attributes?: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  type: EdgeType;
  source: string;
  target: string;
  evidence: SourceRef[];
  confidence: Confidence;
  derivation: Derivation;
  note?: string;
}

export interface GraphDocument {
  schema_version: typeof SCHEMA_VERSION;
  generated_at: string;
  producer: Producer;
  notes?: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}
