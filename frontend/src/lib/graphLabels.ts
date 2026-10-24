import type { BuStatus, Confidence, Derivation, EdgeType, NodeType, SourceName } from "@/types/graph";

// Display text and visual encoding (frontend-explorer design.md "Visual encoding").
// Color is always paired with a shape and a text label (Requirement 8.1).

export const NODE_TYPE_LABEL: Record<NodeType, { one: string; many: string }> = {
  person: { one: "Person", many: "People" },
  publication: { one: "Publication", many: "Publications" },
  patent: { one: "Patent", many: "Patents" },
  award: { one: "Award", many: "Awards" },
  organization: { one: "Organization", many: "Organizations" },
  topic: { one: "Topic", many: "Topics" },
};

export const NODE_STYLE: Record<NodeType, { color: string; shape: string; shapeName: string }> = {
  person: { color: "#2563eb", shape: "ellipse", shapeName: "circle" },
  publication: { color: "#16a34a", shape: "rectangle", shapeName: "square" },
  patent: { color: "#ea580c", shape: "diamond", shapeName: "diamond" },
  award: { color: "#7c3aed", shape: "hexagon", shapeName: "hexagon" },
  organization: { color: "#6b7280", shape: "round-rectangle", shapeName: "rounded square" },
  topic: { color: "#0d9488", shape: "tag", shapeName: "tag" },
};

export const EDGE_TYPE_LABEL: Record<EdgeType, string> = {
  AUTHORED: "Authored",
  COAUTHORED_WITH: "Co-authored with",
  INVENTED: "Invented",
  ASSIGNED_TO: "Assigned to",
  RECEIVED_AWARD: "Received award",
  FUNDED_BY: "Funded by",
  AFFILIATED_WITH: "Affiliated with",
  HAS_TOPIC: "Has topic",
  SAME_AS_CANDIDATE: "Possible match",
};

export const STATUS_LABEL: Record<BuStatus, string> = {
  verified_alumnus: "Verified BU alumnus",
  bu_affiliated_researcher: "BU-affiliated researcher",
  unverified: "BU affiliation unverified",
  ambiguous: "Ambiguous identity",
};

export const STATUS_HELP: Record<BuStatus, string> = {
  verified_alumnus: "A source explicitly states a BU degree.",
  bu_affiliated_researcher: "Worked or published at BU. Alumni status is not confirmed.",
  unverified: "Linked to BU-related work, but no BU affiliation evidence yet.",
  ambiguous: "Conflicting or insufficient evidence. Possible identity confusion.",
};

export const CONFIDENCE_LABEL: Record<Confidence, string> = { high: "High confidence", medium: "Medium confidence", low: "Low confidence" };

export const DERIVATION_LABEL: Record<Derivation, string> = {
  source_record: "Documented",
  derived: "Derived",
  identity_match: "Identity match",
};

export const DERIVATION_HELP: Record<Derivation, string> = {
  source_record: "Stated directly by a source record.",
  derived: "Computed from documented records (for example, two authors on the same paper).",
  identity_match: "Depends on matching records to the same person.",
};

export const SOURCE_LABEL: Record<SourceName, string> = {
  openalex: "OpenAlex",
  semantic_scholar: "Semantic Scholar",
  patentsview: "USPTO PatentsView",
  nih_reporter: "NIH RePORTER",
  nsf_awards: "NSF Awards",
  bu_repository: "BU repository",
  institutional_bio: "Institutional bio",
  professional_profile: "Professional profile",
  user_submitted: "User submitted",
  manual_curation: "Manual curation",
};

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .map((w) => w[0].toUpperCase())
    .filter((_, i, a) => i === 0 || i === a.length - 1)
    .join("");
}
