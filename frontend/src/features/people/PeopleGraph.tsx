import { useEffect, useRef } from "react";
import cytoscape, { type Core, type ElementDefinition, type StylesheetJson } from "cytoscape";
import type { GraphIndex } from "@/data/graphIndex";
import { linkCounts, linkStrength, statusOf, STATUS_RANK, type PersonLink } from "@/data/people";
import { STATUS_COLOR } from "./shared";

// People-only network. Nodes are people colored by BU status; edges are the shared
// records between them (width = how many). A fresh scene uses rings around the focus
// person: verified alumni closest, then BU researchers, then everyone else.

export type PeopleSelection = { kind: "person"; id: string } | { kind: "link"; id: string } | null;

interface Props {
  index: GraphIndex;
  personIds: string[];
  links: PersonLink[];
  focusId: string;
  /** People added by "Expand"; their scenes use a force layout instead of rings. */
  expanded: string[];
  selection: PeopleSelection;
  onSelect: (sel: PeopleSelection) => void;
  onExpand: (id: string) => void;
}

const INK = "hsl(240, 30%, 14%)";
const PRIMARY = "hsl(340, 75%, 58%)";

const STYLE: StylesheetJson = [
  {
    selector: "node",
    style: {
      label: "data(label)",
      "font-family": "DM Sans, system-ui, sans-serif",
      "font-size": 11,
      "font-weight": 600,
      color: INK,
      "text-valign": "bottom",
      "text-margin-y": 5,
      "text-wrap": "ellipsis",
      "text-max-width": "120px",
      "text-background-color": "#ffffff",
      "text-background-opacity": 0.9,
      "text-background-padding": "3px",
      "text-background-shape": "roundrectangle",
      width: "data(size)",
      height: "data(size)",
      "background-color": "data(color)",
      "border-width": 3,
      "border-color": "#ffffff",
      "transition-property": "opacity, border-color, border-width",
      "transition-duration": 150,
    },
  },
  { selector: "node.focus", style: { "border-color": INK, "border-width": 4, "font-size": 13, "font-weight": 700, "z-index": 20 } },
  { selector: "node.selected-el", style: { "border-color": PRIMARY, "border-width": 5, "z-index": 30 } },
  { selector: "node.faded", style: { opacity: 0.18 } },
  {
    selector: "edge",
    style: {
      width: "data(width)",
      "line-color": "hsl(240, 10%, 82%)",
      "curve-style": "haystack",
      "haystack-radius": 0,
      opacity: 0.3,
      "overlay-padding": 6,
    },
  },
  { selector: "edge[grantOnly = 1]", style: { "line-color": "hsl(38, 80%, 55%)", "line-style": "dashed", "curve-style": "bezier", opacity: 0.6 } },
  { selector: "edge.focus-edge", style: { "line-color": "hsl(240, 10%, 62%)", opacity: 0.9 } },
  { selector: "edge.faded", style: { opacity: 0.08 } },
  // The side panel describes the selected connection, so the line itself carries no label.
  { selector: "edge.selected-el", style: { "line-color": PRIMARY, "curve-style": "bezier", opacity: 1, "z-index": 25 } },
];

function short(label: string): string {
  return label.length > 32 ? `${label.slice(0, 30)}…` : label;
}

export function PeopleGraph({ index, personIds, links, focusId, expanded, selection, onSelect, onExpand }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const handlers = useRef({ onSelect, onExpand });
  handlers.current = { onSelect, onExpand };

  useEffect(() => {
    if (!containerRef.current) return;
    const cy = cytoscape({ container: containerRef.current, style: STYLE, wheelSensitivity: 0.3, minZoom: 0.15, maxZoom: 2.5 });
    cy.on("tap", "node", (evt) => handlers.current.onSelect({ kind: "person", id: evt.target.id() }));
    cy.on("tap", "edge", (evt) => handlers.current.onSelect({ kind: "link", id: evt.target.id() }));
    cy.on("dbltap", "node", (evt) => handlers.current.onExpand(evt.target.id()));
    cy.on("tap", (evt) => {
      if (evt.target === cy) handlers.current.onSelect(null);
    });
    // Hovering a person highlights their own connections, like the landing page graph.
    cy.on("mouseover", "node", (evt) => {
      const keep = evt.target.closedNeighborhood();
      cy.batch(() => {
        cy.elements().not(keep).addClass("faded");
      });
    });
    cy.on("mouseout", "node", () => cy.elements().removeClass("faded"));
    cyRef.current = cy;
    const observer = new ResizeObserver(() => cy.resize());
    observer.observe(containerRef.current);
    return () => {
      observer.disconnect();
      cy.destroy();
      cyRef.current = null;
    };
  }, []);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const wanted = new Set(personIds);
    const wantedLinks = new Set(links.map((l) => l.id));
    cy.batch(() => {
      cy.elements().forEach((el) => {
        if (el.group() === "nodes" ? !wanted.has(el.id()) : !wantedLinks.has(el.id())) el.remove();
      });
    });

    const strength = new Map<string, number>();
    for (const l of links) {
      strength.set(l.a, (strength.get(l.a) ?? 0) + linkStrength(l));
      strength.set(l.b, (strength.get(l.b) ?? 0) + linkStrength(l));
    }
    const toAdd: ElementDefinition[] = [];
    for (const id of personIds) {
      const existing = cy.getElementById(id);
      const n = index.nodes.get(id)!;
      const status = statusOf(n);
      const size = id === focusId ? 54 : Math.min(44, 20 + Math.sqrt(strength.get(id) ?? 1) * 5);
      // Rings: focus at the center, then alumni, BU researchers, others.
      const ring = id === focusId ? 10 : 4 - STATUS_RANK[status];
      if (existing.nonempty()) {
        existing.data({ size, ring });
        continue;
      }
      const anchor = links.find((l) => (l.a === id || l.b === id) && cy.getElementById(l.a === id ? l.b : l.a).nonempty());
      const pos = anchor ? cy.getElementById(anchor.a === id ? anchor.b : anchor.a).position() : { x: 0, y: 0 };
      toAdd.push({
        group: "nodes",
        data: { id, label: short(n.label), color: STATUS_COLOR[status], size, ring },
        position: { x: pos.x + (Math.random() - 0.5) * 80, y: pos.y + (Math.random() - 0.5) * 80 },
      });
    }
    for (const l of links) {
      if (cy.getElementById(l.id).nonempty()) continue;
      const c = linkCounts(l);
      toAdd.push({
        group: "edges",
        data: {
          id: l.id,
          source: l.a,
          target: l.b,
          width: Math.min(7, 1.5 + Math.sqrt(linkStrength(l)) * 1.3),
          grantOnly: c.paper === 0 ? 1 : 0,
        },
      });
    }
    const kept = cy.nodes().length;
    const added = cy.add(toAdd);
    if (added.nodes().length || added.edges().length) {
      const fresh = kept < 2;
      if (fresh && expanded.length === 0) {
        cy.layout({
          name: "concentric",
          concentric: (node: cytoscape.NodeSingular) => node.data("ring"),
          levelWidth: () => 1,
          minNodeSpacing: 34,
          animate: false,
          fit: true,
          padding: 48,
        } as never).run();
      } else {
        cy.layout({ name: "cose", animate: false, randomize: fresh, nodeRepulsion: () => 24000, idealEdgeLength: () => 120, nodeOverlap: 24, numIter: 1500, fit: true, padding: 48 } as never).run();
      }
      if (cy.zoom() > 1.3) {
        cy.zoom(1.3);
        cy.center();
      }
    }
  }, [index, personIds, links, focusId, expanded]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      cy.elements().removeClass("focus selected-el focus-edge");
      cy.getElementById(focusId).addClass("focus");
      cy.getElementById(focusId).connectedEdges().addClass("focus-edge");
      if (selection) cy.getElementById(selection.id).addClass("selected-el");
    });
  }, [focusId, selection, personIds, links]);

  return (
    <div
      ref={containerRef}
      data-lenis-prevent
      role="img"
      aria-label={`People network: ${personIds.length} people and ${links.length} connections. Use the collaborator list in the side panel for a keyboard-accessible version.`}
      className="h-full w-full bg-[radial-gradient(ellipse_at_50%_40%,hsl(340_75%_96%)_0%,hsl(var(--background))_70%)]"
    />
  );
}
