import { useState } from "react";
import { AlertTriangle, ArrowRight, Crosshair, Expand, FileSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AffiliationBadge, ConfidenceBadge, DerivationBadge, NodeTypeGlyph, SourceLink } from "@/components/graph/badges";
import { DERIVATION_HELP, EDGE_TYPE_LABEL, NODE_TYPE_LABEL, SOURCE_LABEL, STATUS_HELP } from "@/lib/graphLabels";
import { otherEnd, type GraphIndex } from "@/data/graphIndex";
import type { EdgeType, GraphEdge, GraphNode, SourceRef } from "@/types/graph";
import type { Selection } from "@/features/explorer/GraphCanvas";

// Requirements 4 (node detail) and 5 (edge evidence).

interface PanelProps {
  index: GraphIndex;
  onSelect: (sel: Selection) => void;
  onFocus: (id: string) => void;
}

function Section({ title, children, count }: { title: string; children: React.ReactNode; count?: number }) {
  return (
    <section className="border-t border-border pt-3 mt-3">
      <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
        {title}
        {count !== undefined && <span className="ml-1 font-normal normal-case tracking-normal">({count})</span>}
      </h3>
      {children}
    </section>
  );
}

function NodeButton({ node, onSelect }: { node: GraphNode; onSelect: PanelProps["onSelect"] }) {
  return (
    <button
      type="button"
      onClick={() => onSelect({ kind: "node", id: node.id })}
      className="flex min-w-0 items-center gap-1.5 text-left text-sm hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
    >
      <NodeTypeGlyph type={node.type} />
      <span className="truncate">{node.label}</span>
    </button>
  );
}

function EvidenceButton({ edge, onSelect }: { edge: GraphEdge; onSelect: PanelProps["onSelect"] }) {
  return (
    <button
      type="button"
      onClick={() => onSelect({ kind: "edge", id: edge.id })}
      className="shrink-0 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`Evidence for ${EDGE_TYPE_LABEL[edge.type]} connection`}
    >
      <FileSearch className="h-3 w-3" aria-hidden="true" />
      Evidence{edge.evidence.length > 1 ? ` (${edge.evidence.length})` : ""}
    </button>
  );
}

const PERSON_GROUPS: { title: string; types: EdgeType[] }[] = [
  { title: "Research", types: ["AUTHORED"] },
  { title: "Patents", types: ["INVENTED"] },
  { title: "Awards", types: ["RECEIVED_AWARD"] },
  { title: "Documented collaborators", types: ["COAUTHORED_WITH"] },
  { title: "Affiliations", types: ["AFFILIATED_WITH"] },
];

function year(n: GraphNode): number {
  return typeof n.attributes?.year === "number" ? (n.attributes.year as number) : 0;
}

function ConnectionList({ index, nodeId, edges, onSelect }: { index: GraphIndex; nodeId: string; edges: GraphEdge[]; onSelect: PanelProps["onSelect"] }) {
  const [showAll, setShowAll] = useState(false);
  const items = edges
    .map((e) => ({ edge: e, node: index.nodes.get(otherEnd(e, nodeId))! }))
    .sort((a, b) => b.edge.evidence.length - a.edge.evidence.length || year(b.node) - year(a.node) || a.node.label.localeCompare(b.node.label));
  const shown = showAll ? items : items.slice(0, 8);
  return (
    <>
      <ul className="space-y-1">
        {shown.map(({ edge, node }) => (
          <li key={edge.id} className="flex items-center justify-between gap-2">
            <NodeButton node={node} onSelect={onSelect} />
            <span className="flex items-center gap-1">
              {year(node) > 0 && <span className="text-[11px] text-muted-foreground">{year(node)}</span>}
              {edge.confidence !== "high" && <ConfidenceBadge confidence={edge.confidence} />}
              <EvidenceButton edge={edge} onSelect={onSelect} />
            </span>
          </li>
        ))}
      </ul>
      {items.length > shown.length && (
        <Button variant="link" size="sm" className="h-auto px-0 text-xs" onClick={() => setShowAll(true)}>
          Show all {items.length}
        </Button>
      )}
    </>
  );
}

function EvidenceList({ refs }: { refs: SourceRef[] }) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? refs : refs.slice(0, 5);
  return (
    <>
      <ul className="mt-2 space-y-1.5">
        {shown.map((s, i) => (
          <li key={`${s.url}-${i}`}><SourceLink source={s} /></li>
        ))}
      </ul>
      {refs.length > shown.length && (
        <Button variant="link" size="sm" className="h-auto px-0 text-xs" onClick={() => setShowAll(true)}>
          Show all {refs.length} records
        </Button>
      )}
    </>
  );
}

function AttributeTable({ attributes, omit = [] }: { attributes?: Record<string, unknown>; omit?: string[] }) {
  const entries = Object.entries(attributes ?? {}).filter(([k, v]) => !omit.includes(k) && v !== null && v !== undefined && v !== "");
  if (!entries.length) return null;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
      {entries.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{k.replace(/_/g, " ")}</dt>
          <dd className="min-w-0 break-words">
            {k === "doi" ? (
              <a className="text-primary hover:underline" href={`https://doi.org/${String(v)}`} target="_blank" rel="noopener noreferrer">
                {String(v)}
              </a>
            ) : (
              String(v)
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function NodePanel({ index, nodeId, onSelect, onFocus, onExpand }: PanelProps & { nodeId: string; onExpand: (id: string) => void }) {
  const node = index.nodes.get(nodeId);
  if (!node) return <p className="p-4 text-sm text-muted-foreground">This node is not in the loaded graph.</p>;
  const edges = index.edgesByNode.get(node.id) ?? [];
  const sameAs = edges.filter((e) => e.type === "SAME_AS_CANDIDATE");
  const aff = node.bu_affiliation;
  const orcid = typeof node.attributes?.orcid === "string" ? (node.attributes.orcid as string) : null;
  const profiles = node.sources.filter((s) => s.source === "professional_profile");

  const groups =
    node.type === "person"
      ? PERSON_GROUPS
      : [...new Set(edges.filter((e) => e.type !== "SAME_AS_CANDIDATE").map((e) => e.type))].map((t) => ({ title: EDGE_TYPE_LABEL[t], types: [t] }));
  const grouped = new Set(groups.flatMap((g) => g.types));
  const other = edges.filter((e) => !grouped.has(e.type) && e.type !== "SAME_AS_CANDIDATE");

  return (
    <div className="p-4">
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
        <NodeTypeGlyph type={node.type} /> {NODE_TYPE_LABEL[node.type].one}
      </p>
      <h2 className="mt-1 font-display text-xl font-bold leading-tight">{node.label}</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => onFocus(node.id)}>
          <Crosshair className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Focus graph here
        </Button>
        <Button size="sm" variant="outline" onClick={() => onExpand(node.id)}>
          <Expand className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Expand neighbors
        </Button>
      </div>

      {(aff?.status === "ambiguous" || sameAs.length > 0) && (
        <div role="note" className="mt-4 rounded-lg border border-warning/50 bg-warning/10 p-3 text-sm">
          <p className="flex items-center gap-1.5 font-semibold text-[hsl(38,80%,28%)]">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" /> Unconfirmed identity match
          </p>
          <p className="mt-1 text-xs text-muted-foreground">These records may describe the same person. They have not been merged.</p>
          {sameAs.length > 0 && (
            <ul className="mt-2 space-y-1">
              {sameAs.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-2">
                  <NodeButton node={index.nodes.get(otherEnd(e, node.id))!} onSelect={onSelect} />
                  <span className="flex items-center gap-1">
                    <ConfidenceBadge confidence={e.confidence} />
                    <EvidenceButton edge={e} onSelect={onSelect} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {aff && (
        <Section title="BU affiliation">
          <AffiliationBadge status={aff.status} />
          <p className="mt-1.5 text-xs text-muted-foreground">{STATUS_HELP[aff.status]}</p>
          {aff.details && (
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 text-sm">
              {aff.details.degree && (<><dt className="text-muted-foreground">Degree</dt><dd>{aff.details.degree}</dd></>)}
              {aff.details.department && (<><dt className="text-muted-foreground">Department</dt><dd>{aff.details.department}</dd></>)}
              {aff.details.graduation_year && (<><dt className="text-muted-foreground">Graduated</dt><dd>{aff.details.graduation_year}</dd></>)}
            </dl>
          )}
          {aff.evidence.length > 0 ? (
            <EvidenceList refs={aff.evidence} />
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">No affiliation evidence recorded yet.</p>
          )}
        </Section>
      )}

      <Section title="Source records" count={node.sources.length}>
        <EvidenceList refs={node.sources} />
      </Section>

      {node.type === "person" && (orcid || profiles.length > 0) && (
        <Section title="Professional profiles">
          <ul className="space-y-1.5">
            {orcid && (
              <li>
                <a className="text-sm text-primary hover:underline" href={`https://orcid.org/${orcid}`} target="_blank" rel="noopener noreferrer">
                  ORCID {orcid}
                </a>
                <span className="text-xs text-muted-foreground"> · as listed in the source record</span>
              </li>
            )}
            {profiles.map((s, i) => (
              <li key={`${s.url}-${i}`}><SourceLink source={s} /></li>
            ))}
          </ul>
        </Section>
      )}

      {node.type !== "person" && node.attributes && (
        <Section title="Attributes">
          <AttributeTable attributes={node.attributes} />
        </Section>
      )}

      {groups.map((g) => {
        const list = edges.filter((e) => g.types.includes(e.type));
        if (!list.length) return null;
        return (
          <Section key={g.title} title={g.title} count={list.length}>
            <ConnectionList index={index} nodeId={node.id} edges={list} onSelect={onSelect} />
          </Section>
        );
      })}
      {other.length > 0 && (
        <Section title="Other connections" count={other.length}>
          <ConnectionList index={index} nodeId={node.id} edges={other} onSelect={onSelect} />
        </Section>
      )}
    </div>
  );
}

export function EdgePanel({ index, edgeId, onSelect, onFocus }: PanelProps & { edgeId: string }) {
  const edge = index.edges.get(edgeId);
  if (!edge) return <p className="p-4 text-sm text-muted-foreground">This connection is not in the loaded graph.</p>;
  const a = index.nodes.get(edge.source)!;
  const b = index.nodes.get(edge.target)!;
  return (
    <div className="p-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Connection evidence</p>
      <h2 className="mt-1 font-display text-xl font-bold">{EDGE_TYPE_LABEL[edge.type]}</h2>
      <div className="mt-2 flex flex-col gap-1">
        <NodeButton node={a} onSelect={onSelect} />
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" aria-label={EDGE_TYPE_LABEL[edge.type]} />
        <NodeButton node={b} onSelect={onSelect} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <ConfidenceBadge confidence={edge.confidence} />
        <DerivationBadge derivation={edge.derivation} />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{DERIVATION_HELP[edge.derivation]}</p>
      {edge.type === "SAME_AS_CANDIDATE" && (
        <p role="note" className="mt-3 rounded-lg border border-warning/50 bg-warning/10 p-2 text-xs">
          Possible match only. These records have not been merged into one person.
        </p>
      )}
      {edge.note && <p className="mt-3 text-sm"><span className="text-muted-foreground">Note: </span>{edge.note}</p>}

      <Section title="Evidence records" count={edge.evidence.length}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="h-8 px-2">Source</TableHead>
              <TableHead className="h-8 px-2">Record</TableHead>
              <TableHead className="h-8 px-2">Retrieved</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {edge.evidence.map((s, i) => (
              <TableRow key={`${s.url}-${i}`}>
                <TableCell className="p-2 align-top">{SOURCE_LABEL[s.source] ?? s.source}</TableCell>
                <TableCell className="p-2 align-top">
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="font-mono text-xs text-primary hover:underline break-all">
                    {s.record_id ?? s.url}
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                  {s.note && <p className="text-xs text-muted-foreground">{s.note}</p>}
                </TableCell>
                <TableCell className="p-2 align-top text-xs text-muted-foreground">{s.retrieved_at ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>
      <div className="mt-4 flex gap-2">
        <Button size="sm" variant="outline" onClick={() => onFocus(a.id)}>Focus on {NODE_TYPE_LABEL[a.type].one.toLowerCase()}</Button>
        <Button size="sm" variant="outline" onClick={() => onFocus(b.id)}>Focus on {NODE_TYPE_LABEL[b.type].one.toLowerCase()}</Button>
      </div>
    </div>
  );
}
