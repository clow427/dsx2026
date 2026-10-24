import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AffiliationBadge, ConfidenceBadge, NodeTypeGlyph } from "@/components/graph/badges";
import { DERIVATION_LABEL, EDGE_TYPE_LABEL, NODE_TYPE_LABEL } from "@/lib/graphLabels";
import { cn } from "@/lib/utils";
import type { GraphIndex } from "@/data/graphIndex";
import type { GraphEdge, GraphNode } from "@/types/graph";
import type { Selection } from "./GraphCanvas";

// Requirement 3.3: an accessible table view of the same neighborhood shown on the canvas.

const MAX_ROWS = 300;

function NodeCell({ node, onSelect, selected }: { node: GraphNode; onSelect: (s: Selection) => void; selected: boolean }) {
  return (
    <button
      type="button"
      onClick={() => onSelect({ kind: "node", id: node.id })}
      aria-current={selected || undefined}
      className={cn("flex items-center gap-1.5 text-left hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded", selected && "font-semibold text-primary")}
    >
      <NodeTypeGlyph type={node.type} />
      <span className="line-clamp-2">{node.label}</span>
    </button>
  );
}

export function NeighborhoodList({ index, nodeIds, edges, selection, onSelect }: { index: GraphIndex; nodeIds: string[]; edges: GraphEdge[]; selection: Selection; onSelect: (s: Selection) => void }) {
  const nodes = nodeIds.map((id) => index.nodes.get(id)!).sort((a, b) => a.type.localeCompare(b.type) || a.label.localeCompare(b.label));
  const shownEdges = edges.slice(0, MAX_ROWS);
  return (
    <div className="h-full overflow-auto p-4 space-y-8" data-lenis-prevent>
      <Table>
        <TableCaption className="caption-top text-left text-sm font-bold text-foreground">Nodes ({nodes.length})</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>BU affiliation</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {nodes.map((n) => (
            <TableRow key={n.id}>
              <TableCell className="py-1.5"><NodeCell node={n} onSelect={onSelect} selected={selection?.id === n.id} /></TableCell>
              <TableCell className="py-1.5 text-muted-foreground">{NODE_TYPE_LABEL[n.type].one}</TableCell>
              <TableCell className="py-1.5">{n.bu_affiliation ? <AffiliationBadge status={n.bu_affiliation.status} /> : <span className="text-muted-foreground">—</span>}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Table>
        <TableCaption className="caption-top text-left text-sm font-bold text-foreground">
          Connections ({edges.length}{edges.length > MAX_ROWS ? `, first ${MAX_ROWS} shown` : ""})
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>From</TableHead>
            <TableHead>Relationship</TableHead>
            <TableHead>To</TableHead>
            <TableHead>Confidence</TableHead>
            <TableHead>Evidence</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shownEdges.map((e) => (
            <TableRow key={e.id} className={cn(selection?.id === e.id && "bg-primary/5")}>
              <TableCell className="py-1.5"><NodeCell node={index.nodes.get(e.source)!} onSelect={onSelect} selected={false} /></TableCell>
              <TableCell className="py-1.5 whitespace-nowrap">{EDGE_TYPE_LABEL[e.type]}<span className="block text-[11px] text-muted-foreground">{DERIVATION_LABEL[e.derivation]}</span></TableCell>
              <TableCell className="py-1.5"><NodeCell node={index.nodes.get(e.target)!} onSelect={onSelect} selected={false} /></TableCell>
              <TableCell className="py-1.5"><ConfidenceBadge confidence={e.confidence} /></TableCell>
              <TableCell className="py-1.5">
                <button type="button" onClick={() => onSelect({ kind: "edge", id: e.id })} className="text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded text-sm">
                  {e.evidence.length} record{e.evidence.length === 1 ? "" : "s"}
                </button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
