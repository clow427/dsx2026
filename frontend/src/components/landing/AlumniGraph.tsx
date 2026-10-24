import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { initials } from "@/lib/graphLabels";
import type { BuStatus } from "@/types/graph";

// Hero graph on the landing page. Everything it draws comes from the loaded graph:
// people from the Find My People ranking and links from their COAUTHORED_WITH edges.

export const GRAPH_W = 1200;
export const GRAPH_H = 830;
const HUB = { x: GRAPH_W / 2, y: GRAPH_H / 2 };
const RING = { rx: 520, ry: 320 };

export interface HeroPerson {
  id: string;
  name: string;
  status: BuStatus;
  /** Short line under the name, e.g. "BU researcher". */
  caption: string;
  /** Tooltip heading and body. Both must be derived from graph records. */
  tooltipTitle: string;
  tooltip: string;
}

export interface HeroLink {
  from: string;
  to: string;
  label: string;
  /** Edge ID, so the link can open its evidence. */
  edgeId: string;
}

const NODE_D = 76; // node diameter in graph units
const NAME_BLOCK = 62; // space taken by the name + caption under each node
const pct = (v: number, total: number) => `${(v / total) * 100}%`;

/** How far along a segment we must travel from an endpoint to clear its node (and name, when heading down). */
function clearance(dx: number, dy: number) {
  const len = Math.hypot(dx, dy) || 1;
  const down = dy / len;
  return NODE_D / 2 + 6 + Math.max(0, down) * NAME_BLOCK;
}

/** Places a label on the visible part of the segment. Steep segments get a horizontal label beside the line. */
function labelProps(x1: number, y1: number, x2: number, y2: number, t = 0.5): { transform: string; textAnchor: "middle" | "start" | "end" } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const a = clearance(dx, dy) / len;
  const b = 1 - clearance(-dx, -dy) / len;
  const tt = a < b ? a + (b - a) * t : t;
  const mx = x1 + dx * tt;
  const my = y1 + dy * tt;
  let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (angle > 90) angle -= 180;
  if (angle < -90) angle += 180;
  if (Math.abs(angle) > 55) {
    const lowerDx = dy >= 0 ? dx : -dx;
    const left = lowerDx === 0 ? mx < GRAPH_W / 2 : lowerDx < 0;
    return { transform: `translate(${mx + (left ? -8 : 8)} ${my + 4})`, textAnchor: left ? "end" : "start" };
  }
  return { transform: `translate(${mx} ${my}) rotate(${angle}) translate(0 -6)`, textAnchor: "middle" };
}

/** Orders people so co-authors sit next to each other on the ring, which keeps link labels readable. */
function ringOrder(people: HeroPerson[], links: HeroLink[]): HeroPerson[] {
  const adj = new Map<string, Set<string>>();
  for (const l of links) {
    if (!adj.has(l.from)) adj.set(l.from, new Set());
    if (!adj.has(l.to)) adj.set(l.to, new Set());
    adj.get(l.from)!.add(l.to);
    adj.get(l.to)!.add(l.from);
  }
  const remaining = [...people];
  const out: HeroPerson[] = [];
  while (remaining.length) {
    const prev = out[out.length - 1];
    const i = prev ? remaining.findIndex((p) => adj.get(prev.id)?.has(p.id)) : -1;
    out.push(remaining.splice(i >= 0 ? i : 0, 1)[0]);
  }
  return out;
}

interface AlumniGraphProps {
  people: HeroPerson[];
  links: HeroLink[];
  /** Content rendered over the center of the graph. */
  center?: ReactNode;
}

export function AlumniGraph({ people, links, center }: AlumniGraphProps) {
  const [active, setActive] = useState<string | null>(null);

  const placed = useMemo(() => {
    const ordered = ringOrder(people, links);
    return ordered.map((p, i) => {
      const theta = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(ordered.length, 1);
      return { ...p, x: HUB.x + RING.rx * Math.cos(theta), y: HUB.y + RING.ry * Math.sin(theta), slot: i };
    });
  }, [people, links]);
  const byId = useMemo(() => Object.fromEntries(placed.map((n) => [n.id, n])), [placed]);

  const related = useMemo(() => {
    if (!active) return null;
    const s = new Set<string>([active]);
    links.forEach((e) => {
      if (e.from === active) s.add(e.to);
      if (e.to === active) s.add(e.from);
    });
    return s;
  }, [active, links]);

  const ringGap = (a: number, b: number) => {
    const d = Math.abs(a - b);
    return Math.min(d, placed.length - d);
  };

  return (
    <div className="relative w-full select-none" style={{ aspectRatio: `${GRAPH_W} / ${GRAPH_H}` }}>
      <svg viewBox={`0 0 ${GRAPH_W} ${GRAPH_H}`} className="absolute inset-0 w-full h-full overflow-visible" aria-hidden="true">
        <defs>
          <radialGradient id="hub-fade" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="hsl(var(--background))" stopOpacity="1" />
            <stop offset="62%" stopColor="hsl(var(--background))" stopOpacity="0.96" />
            <stop offset="100%" stopColor="hsl(var(--background))" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Spokes from the topic at the center to each person */}
        {placed.map((n, i) => (
          <motion.path
            key={`hub-${n.id}`}
            d={`M ${HUB.x} ${HUB.y} L ${n.x} ${n.y}`}
            stroke={active === n.id ? "hsl(var(--primary))" : "hsl(var(--foreground) / 0.12)"}
            strokeWidth={active === n.id ? 2.4 : 1.4}
            fill="none"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.9, delay: 0.3 + i * 0.04, ease: [0.22, 1, 0.36, 1] }}
          />
        ))}

        <ellipse cx={HUB.x} cy={HUB.y} rx={310} ry={255} fill="url(#hub-fade)" />

        {/* Co-author links */}
        {links.map((e, i) => {
          const a = byId[e.from];
          const b = byId[e.to];
          if (!a || !b) return null;
          const on = !!active && (e.from === active || e.to === active);
          const dim = !!active && !on;
          const near = ringGap(a.slot, b.slot) <= 1;
          return (
            <g key={e.edgeId} style={{ opacity: dim ? 0.2 : near || on ? 1 : 0.45, transition: "opacity 200ms" }}>
              <motion.path
                d={`M ${a.x} ${a.y} L ${b.x} ${b.y}`}
                stroke={on ? "hsl(var(--primary))" : "hsl(var(--foreground) / 0.32)"}
                strokeWidth={on ? 2.6 : 1.6}
                fill="none"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.8, delay: 0.5 + i * 0.03, ease: [0.22, 1, 0.36, 1] }}
              />
              {(near || on) && (
                <text
                  {...labelProps(a.x, a.y, b.x, b.y)}
                  className="font-sans"
                  style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", paintOrder: "stroke" }}
                  fill={on ? "hsl(var(--primary))" : "hsl(var(--foreground) / 0.7)"}
                  stroke="hsl(var(--background))"
                  strokeWidth={4}
                >
                  {e.label.toUpperCase()}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {center && (
        <div className="absolute z-10 flex items-center justify-center pointer-events-none" style={{ left: pct(HUB.x - 280, GRAPH_W), width: pct(560, GRAPH_W), top: pct(HUB.y - 230, GRAPH_H), height: pct(460, GRAPH_H) }}>
          <div className="pointer-events-auto">{center}</div>
        </div>
      )}

      {placed.map((n, i) => (
        <GraphNode
          key={n.id}
          node={n}
          index={i}
          dimmed={!!related && !related.has(n.id)}
          highlighted={active === n.id}
          onEnter={() => setActive(n.id)}
          onLeave={() => setActive((cur) => (cur === n.id ? null : cur))}
        />
      ))}
    </div>
  );
}

const STATUS_RING: Record<BuStatus, string> = {
  verified_alumnus: "bg-success/15 text-success",
  bu_affiliated_researcher: "bg-primary/10 text-primary",
  unverified: "bg-muted text-muted-foreground",
  ambiguous: "bg-warning/15 text-warning",
};

function GraphNode({ node, index, dimmed, highlighted, onEnter, onLeave }: {
  node: HeroPerson & { x: number; y: number };
  index: number;
  dimmed: boolean;
  highlighted: boolean;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const tooltipBelow = node.y < GRAPH_H / 2;
  return (
    <Link
      to={`/explore?node=${encodeURIComponent(node.id)}`}
      className="absolute z-20 block rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={{
        left: pct(node.x, GRAPH_W),
        top: pct(node.y, GRAPH_H),
        width: pct(NODE_D, GRAPH_W),
        transform: "translate(-50%, -50%)",
        opacity: dimmed ? 0.35 : 1,
        transition: "opacity 200ms",
      }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
      aria-label={`${node.name}, ${node.caption}. ${node.tooltip}`}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.4 }}
        animate={{ opacity: 1, scale: highlighted ? 1.08 : 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 20, delay: 0.15 + index * 0.035 }}
        className={`aspect-square w-full rounded-full overflow-hidden bg-card shadow-md ring-[3px] ${highlighted ? "ring-primary" : "ring-background"} cursor-pointer`}
      >
        <div className={`w-full h-full flex items-center justify-center font-display font-bold text-lg ${STATUS_RING[node.status]}`}>{initials(node.name)}</div>
      </motion.div>
      <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1.5 text-center w-max max-w-[150px] px-1.5 py-0.5 rounded-md bg-background/90 pointer-events-none">
        <p className="text-[11px] xl:text-xs font-semibold text-foreground leading-tight">{node.name}</p>
        <p className="text-[10px] font-bold tracking-[0.12em] uppercase text-primary mt-0.5">{node.caption}</p>
      </div>
      {highlighted && (
        <motion.div
          initial={{ opacity: 0, y: tooltipBelow ? -4 : 4 }}
          animate={{ opacity: 1, y: 0 }}
          className={`absolute left-1/2 -translate-x-1/2 w-[220px] bg-card text-card-foreground rounded-xl shadow-xl border border-border p-3 z-40 pointer-events-none ${tooltipBelow ? "top-[calc(100%+44px)]" : "bottom-[calc(100%+10px)]"}`}
        >
          <p className="text-[10px] font-bold tracking-[0.15em] uppercase text-primary mb-1">{node.tooltipTitle}</p>
          <p className="text-xs leading-snug text-foreground">{node.tooltip}</p>
        </motion.div>
      )}
    </Link>
  );
}
