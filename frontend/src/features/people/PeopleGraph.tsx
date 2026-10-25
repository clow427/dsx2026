import { useEffect, useRef } from "react";
import cytoscape, { type Core, type ElementDefinition, type StylesheetJson } from "cytoscape";
import type { GraphIndex } from "@/data/graphIndex";
import { linkCounts, linkStrength, statusOf, STATUS_RANK, type PersonLink } from "@/data/people";
import { STATUS_COLOR } from "./shared";

// People-only network. Nodes are people colored by BU status; edges are the shared
// records between them (width = how many). A fresh scene uses rings around the focus
// person: verified alumni closest, then BU researchers, then everyone else.

export type PeopleSelection = { kind: "person"; id: string } | { kind: "link"; id: string } | null;

/** A topic drawn at the center, with a spoke to each person who has papers on it. */
export interface TopicHub {
  id: string;
  label: string;
  spokes: { personId: string; papers: number }[];
}

interface Props {
  index: GraphIndex;
  personIds: string[];
  links: PersonLink[];
  /** The focus person, or the hub topic's ID. */
  focusId: string;
  hub?: TopicHub;
  /** People added by "Expand"; their scenes use a force layout instead of rings. */
  expanded: string[];
  selection: PeopleSelection;
  onSelect: (sel: PeopleSelection) => void;
  /** Double-click: make this person the new center. */
  onFocus: (id: string) => void;
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
  {
    selector: 'node[kind = "hub"]',
    style: {
      shape: "round-rectangle",
      width: "data(w)",
      height: "data(h)",
      "transition-property": "width, height, opacity",
      "transition-duration": 260,
      "background-color": PRIMARY,
      "border-color": "#ffffff",
      "border-width": 4,
      color: "#ffffff",
      "font-family": "Bricolage Grotesque, system-ui, sans-serif",
      "font-size": 14,
      "font-weight": 700,
      "text-valign": "center",
      "text-margin-y": 0,
      "text-wrap": "wrap",
      "text-max-width": "170px",
      "text-background-opacity": 0,
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
  { selector: 'edge[kind = "spoke"]', style: { "line-color": "hsl(340, 75%, 80%)", opacity: 0.7, "curve-style": "straight" } },
  { selector: "edge.focus-edge", style: { "line-color": "hsl(240, 10%, 62%)", opacity: 0.9 } },
  { selector: "edge.faded", style: { opacity: 0.08 } },
  // The side panel describes the selected connection, so the line itself carries no label.
  { selector: "edge.selected-el", style: { "line-color": PRIMARY, "curve-style": "bezier", opacity: 1, "z-index": 25 } },
];

const MOVE_MS = 650;
const FADE_MS = 260;
const MAX_ZOOM = 1.3;
/** Selecting a person zooms to this factor of the scene's starting zoom (one step, never more), up to CLICK_MAX_ZOOM. */
const CLICK_ZOOM = 1.3;
const CLICK_MAX_ZOOM = 1.8;
/** A re-center ends slightly closer than "fit". */
const CENTER_PUSH_IN = 1.1;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

function short(label: string): string {
  return label.length > 32 ? `${label.slice(0, 30)}…` : label;
}

export function PeopleGraph({ index, personIds, links, focusId, hub, expanded, selection, onSelect, onFocus }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const lastFocus = useRef<string | null>(null);
  /** The zoom a scene settled at after its layout; selection zoom is one step from here. */
  const baseZoom = useRef(1);
  const handlers = useRef({ onSelect, onFocus });
  handlers.current = { onSelect, onFocus };

  useEffect(() => {
    if (!containerRef.current) return;
    const cy = cytoscape({ container: containerRef.current, style: STYLE, wheelSensitivity: 0.3, minZoom: 0.15, maxZoom: 2.5 });
    cy.on("tap", "node", (evt) => {
      if (evt.target.data("kind") === "hub") return handlers.current.onSelect(null);
      handlers.current.onSelect({ kind: "person", id: evt.target.id() });
    });
    cy.on("tap", "edge", (evt) => {
      // A spoke stands for the person's papers on the topic, so it selects the person.
      if (evt.target.data("kind") === "spoke") handlers.current.onSelect({ kind: "person", id: evt.target.data("target") });
      else handlers.current.onSelect({ kind: "link", id: evt.target.id() });
    });
    cy.on("dbltap", "node", (evt) => {
      if (evt.target.data("kind") !== "hub") handlers.current.onFocus(evt.target.id());
    });
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
    const sceneChange = lastFocus.current !== focusId;
    const firstScene = lastFocus.current === null || cy.nodes().length === 0;
    lastFocus.current = focusId;
    const animate = !firstScene && !prefersReducedMotion();
    cy.elements().stop(true, true); // finish any animation still running from the previous change

    const spokeId = (personId: string) => `spoke|${personId}`;
    const wanted = new Set(personIds);
    const wantedLinks = new Set(links.map((l) => l.id));
    if (hub) {
      wanted.add(hub.id);
      hub.spokes.forEach((sp) => wantedLinks.add(spokeId(sp.personId)));
    }

    // People and links that leave the scene fade out instead of vanishing.
    let departing = cy.elements().filter((el) => (el.group() === "nodes" ? !wanted.has(el.id()) : !wantedLinks.has(el.id())));
    departing = departing.union(departing.connectedEdges());
    if (animate && departing.nonempty()) {
      const leaving = departing;
      leaving.animate({ style: { opacity: 0 } }, { duration: FADE_MS, complete: () => leaving.remove() });
    } else {
      departing.remove();
    }

    // New people grow out of the new center (or the middle of the view when the center is new too).
    const focusEl = cy.getElementById(focusId);
    const viewCenter = { x: (cy.width() / 2 - cy.pan().x) / cy.zoom(), y: (cy.height() / 2 - cy.pan().y) / cy.zoom() };
    const origin = focusEl.nonempty() && !departing.contains(focusEl) ? { ...focusEl.position() } : viewCenter;

    const strength = new Map<string, number>();
    for (const l of links) {
      strength.set(l.a, (strength.get(l.a) ?? 0) + linkStrength(l));
      strength.set(l.b, (strength.get(l.b) ?? 0) + linkStrength(l));
    }
    const toAdd: ElementDefinition[] = [];
    if (hub && cy.getElementById(hub.id).empty()) {
      // Laid out at person size (the ring layout spaces every ring by the largest node), then enlarged.
      toAdd.push({ group: "nodes", data: { id: hub.id, label: hub.label, kind: "hub", ring: 20, w: 54, h: 54 }, position: { ...origin } });
    }
    for (const id of personIds) {
      const existing = cy.getElementById(id);
      const n = index.nodes.get(id)!;
      const status = statusOf(n);
      const size = id === focusId ? 54 : Math.min(44, 20 + Math.sqrt(strength.get(id) ?? 1) * 5);
      // Rings: focus at the center, then alumni, BU researchers, others.
      const ring = id === focusId ? 10 : 4 - STATUS_RANK[status];
      if (existing.nonempty() && !departing.contains(existing)) {
        existing.data({ size, ring });
        continue;
      }
      if (existing.nonempty()) existing.remove(); // was fading out but is wanted again
      let pos = origin;
      if (!sceneChange) {
        const anchor = links.find((l) => (l.a === id || l.b === id) && cy.getElementById(l.a === id ? l.b : l.a).nonempty());
        if (anchor) pos = cy.getElementById(anchor.a === id ? anchor.b : anchor.a).position();
      }
      toAdd.push({
        group: "nodes",
        data: { id, label: short(n.label), color: STATUS_COLOR[status], size, ring },
        position: { x: pos.x + (Math.random() - 0.5) * 30, y: pos.y + (Math.random() - 0.5) * 30 },
      });
    }
    for (const l of links) {
      const existing = cy.getElementById(l.id);
      if (existing.nonempty() && !departing.contains(existing)) continue;
      if (existing.nonempty()) existing.remove();
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
    for (const sp of hub?.spokes ?? []) {
      if (cy.getElementById(spokeId(sp.personId)).nonempty()) continue;
      toAdd.push({ group: "edges", data: { id: spokeId(sp.personId), source: hub!.id, target: sp.personId, kind: "spoke", width: Math.min(5, 1 + sp.papers * 0.6) } });
    }
    const added = cy.add(toAdd);
    if (added.empty() && departing.empty()) return;
    if (animate) added.style("opacity", 0);
    // The ring layout spaces rings by the largest node, so lay the hub out at person size.
    if (hub) cy.getElementById(hub.id).data({ w: 54, h: 54 });

    const scene = cy.elements().not(departing);
    const finish = () => {
      if (hub) cy.getElementById(hub.id).data({ w: 190, h: 64 });
      if (animate) {
        added.animate({ style: { opacity: 1 } }, { duration: FADE_MS });
        // Finish a re-center with a small push in toward the new center.
        const center = cy.getElementById(focusId);
        const settled = Math.min(cy.zoom() * CENTER_PUSH_IN, MAX_ZOOM);
        baseZoom.current = settled;
        cy.animate({ zoom: settled, center: { eles: center.nonempty() ? center : scene } }, { duration: 380, easing: "ease-out-cubic" });
      } else {
        if (cy.zoom() > MAX_ZOOM) {
          cy.zoom(MAX_ZOOM);
          cy.center(scene);
        }
        baseZoom.current = cy.zoom();
      }
    };
    const motion = animate ? { animate: true, animationDuration: MOVE_MS, animationEasing: "ease-in-out-cubic" } : { animate: false };
    const layout =
      expanded.length === 0
        ? scene.layout({
            name: "concentric",
            concentric: (node: cytoscape.NodeSingular) => node.data("ring"),
            levelWidth: () => 1,
            minNodeSpacing: 34,
            fit: true,
            padding: 48,
            ...motion,
          } as never)
        : scene.layout({ name: "cose", randomize: false, nodeRepulsion: () => 24000, idealEdgeLength: () => 120, nodeOverlap: 24, numIter: 1500, fit: true, padding: 48, ...motion } as never);
    layout.one("layoutstop", finish);
    layout.run();
  }, [index, personIds, links, focusId, hub, expanded]);

  // Selecting a person (on the canvas or in the side panel) glides them to the middle and zooms in a little.
  const lastSelected = useRef<string | null>(null);
  useEffect(() => {
    const cy = cyRef.current;
    const id = selection?.kind === "person" ? selection.id : null;
    if (!cy || id === lastSelected.current) return;
    lastSelected.current = id;
    const el = id ? cy.getElementById(id) : null;
    if (!el || el.empty() || prefersReducedMotion()) return;
    // One zoom step from the scene's starting zoom: later selections only glide. A closer zoom the
    // viewer chose themselves (scroll wheel) is kept.
    const target = Math.max(cy.zoom(), Math.min(baseZoom.current * CLICK_ZOOM, CLICK_MAX_ZOOM));
    cy.animate({ center: { eles: el }, zoom: target }, { duration: 500, easing: "ease-in-out-cubic" });
  }, [selection, personIds]);

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
