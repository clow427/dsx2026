import { useEffect, useRef } from "react";
import cytoscape, { type Core, type ElementDefinition, type StylesheetJson } from "cytoscape";
import { EDGE_TYPE_LABEL, NODE_STYLE, NODE_TYPE_LABEL } from "@/lib/graphLabels";
import type { GraphIndex } from "@/data/graphIndex";
import type { GraphEdge, NodeType } from "@/types/graph";

// Requirement 3: multiple node types (shape + color + label), pan, zoom, select, and expand.

export type Selection = { kind: "node" | "edge"; id: string } | null;

interface Props {
  index: GraphIndex;
  nodeIds: string[];
  edges: GraphEdge[];
  focusId: string | null;
  selection: Selection;
  onSelect: (sel: Selection) => void;
  onExpand: (id: string) => void;
}

const STYLE: StylesheetJson = [
  {
    selector: "node",
    style: {
      label: "data(short)",
      "font-family": "DM Sans, system-ui, sans-serif",
      "font-size": 10,
      color: "#1f2937",
      "text-valign": "bottom",
      "text-margin-y": 4,
      "text-wrap": "ellipsis",
      "text-max-width": "110px",
      "text-background-color": "#ffffff",
      "text-background-opacity": 0.85,
      "text-background-padding": "2px",
      width: 22,
      height: 22,
      "border-width": 2,
      "border-color": "#ffffff",
    },
  },
  ...(Object.keys(NODE_STYLE) as NodeType[]).map((t) => ({
    selector: `node[type = "${t}"]`,
    style: { "background-color": NODE_STYLE[t].color, shape: NODE_STYLE[t].shape as never },
  })),
  { selector: 'node[type = "topic"]', style: { width: 30, height: 22 } },
  { selector: 'node[type = "publication"]', style: { width: 18, height: 18 } },
  { selector: "node.focus", style: { width: 38, height: 38, "font-size": 12, "font-weight": "bold", "border-color": "#111827", "border-width": 3 } },
  { selector: "node.selected-el", style: { "border-color": "#e11d48", "border-width": 4, "z-index": 10 } },
  { selector: "node.dim", style: { opacity: 0.35 } },
  {
    selector: "edge",
    style: {
      width: 1.5,
      "line-color": "#9ca3af",
      "curve-style": "bezier",
      "overlay-padding": 6,
      "target-arrow-shape": "none",
    },
  },
  { selector: 'edge[confidence = "medium"]', style: { "line-style": "dashed" } },
  { selector: 'edge[confidence = "low"]', style: { "line-style": "dotted", "line-color": "#dc2626" } },
  {
    selector: 'edge[type = "SAME_AS_CANDIDATE"]',
    style: { "line-style": "dotted", "line-color": "#d97706", width: 2.5, label: "possible match", "font-size": 9, color: "#92400e", "text-rotation": "autorotate", "text-background-color": "#ffffff", "text-background-opacity": 0.9 },
  },
  { selector: 'edge[type = "COAUTHORED_WITH"]', style: { "line-color": "#93c5fd" } },
  {
    selector: "edge.selected-el",
    style: { width: 4, "line-color": "#e11d48", label: "data(typeLabel)", "font-size": 10, color: "#9f1239", "text-rotation": "autorotate", "text-background-color": "#ffffff", "text-background-opacity": 0.95, "z-index": 10 },
  },
];

function shortLabel(label: string): string {
  return label.length > 40 ? `${label.slice(0, 38)}…` : label;
}

export function GraphCanvas({ index, nodeIds, edges, focusId, selection, onSelect, onExpand }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const handlers = useRef({ onSelect, onExpand });
  handlers.current = { onSelect, onExpand };

  // Create the instance once.
  useEffect(() => {
    if (!containerRef.current) return;
    const cy = cytoscape({ container: containerRef.current, style: STYLE, wheelSensitivity: 0.3, minZoom: 0.15, maxZoom: 3 });
    cy.on("tap", "node", (evt) => handlers.current.onSelect({ kind: "node", id: evt.target.id() }));
    cy.on("tap", "edge", (evt) => handlers.current.onSelect({ kind: "edge", id: evt.target.id() }));
    cy.on("dbltap", "node", (evt) => handlers.current.onExpand(evt.target.id()));
    cy.on("tap", (evt) => {
      if (evt.target === cy) handlers.current.onSelect(null);
    });
    cyRef.current = cy;
    // Hidden tabs and responsive layouts change the container size; keep the canvas in sync.
    const observer = new ResizeObserver(() => cy.resize());
    observer.observe(containerRef.current);
    return () => {
      observer.disconnect();
      cy.destroy();
      cyRef.current = null;
    };
  }, []);

  // Sync elements. Existing nodes keep their position; new nodes start next to a visible neighbor.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const wanted = new Set(nodeIds);
    const wantedEdges = new Set(edges.map((e) => e.id));
    cy.batch(() => {
      cy.elements().forEach((el) => {
        if (el.group() === "nodes" ? !wanted.has(el.id()) : !wantedEdges.has(el.id())) el.remove();
      });
    });
    const toAdd: ElementDefinition[] = [];
    for (const id of nodeIds) {
      if (cy.getElementById(id).nonempty()) continue;
      const n = index.nodes.get(id)!;
      const anchor = edges.find((e) => (e.source === id || e.target === id) && cy.getElementById(e.source === id ? e.target : e.source).nonempty());
      const anchorPos = anchor ? cy.getElementById(anchor.source === id ? anchor.target : anchor.source).position() : { x: 0, y: 0 };
      toAdd.push({
        group: "nodes",
        data: { id, short: shortLabel(n.label), type: n.type },
        position: { x: anchorPos.x + (Math.random() - 0.5) * 80, y: anchorPos.y + (Math.random() - 0.5) * 80 },
      });
    }
    for (const e of edges) {
      if (cy.getElementById(e.id).nonempty()) continue;
      toAdd.push({ group: "edges", data: { id: e.id, source: e.source, target: e.target, type: e.type, confidence: e.confidence, typeLabel: EDGE_TYPE_LABEL[e.type] } });
    }
    const kept = cy.nodes().length;
    const added = cy.add(toAdd);
    if (added.nodes().length || cy.nodes().length <= 1) {
      // A fresh scene (new focus) gets a random start so cose can spread it; expansions keep existing positions.
      const randomize = kept < 2;
      cy.layout({ name: "cose", animate: false, randomize, nodeRepulsion: () => 20000, idealEdgeLength: () => 110, nodeOverlap: 20, numIter: 1500, fit: true, padding: 50 } as never).run();
      if (cy.zoom() > 1.2) {
        cy.zoom(1.2);
        cy.center();
      }
    }
  }, [index, nodeIds, edges]);

  // Focus and selection classes.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      cy.elements().removeClass("focus selected-el");
      if (focusId) cy.getElementById(focusId).addClass("focus");
      if (selection) cy.getElementById(selection.id).addClass("selected-el");
    });
  }, [focusId, selection, nodeIds, edges]);

  const counts = nodeIds.reduce<Record<string, number>>((acc, id) => {
    const t = index.nodes.get(id)?.type;
    if (t) acc[t] = (acc[t] ?? 0) + 1;
    return acc;
  }, {});
  const summary = Object.entries(counts)
    .map(([t, n]) => `${n} ${NODE_TYPE_LABEL[t as NodeType][n === 1 ? "one" : "many"].toLowerCase()}`)
    .join(", ");

  return (
    <div
      ref={containerRef}
      data-lenis-prevent
      role="img"
      aria-label={`Network graph showing ${summary || "no nodes"} and ${edges.length} connections. Use the List view for a keyboard-accessible version.`}
      className="h-full w-full bg-[radial-gradient(circle_at_center,hsl(var(--muted))_0%,hsl(var(--background))_75%)]"
    />
  );
}
