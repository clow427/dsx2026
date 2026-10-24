import { useMemo, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { ALUMNI, EDGES, HUB, HUB_EDGES, GRAPH_W, GRAPH_H, initials, type AlumNode } from "@/lib/alumniGraph";

const NODE_D = 76; // node diameter in graph units
const NAME_BLOCK = 62; // space taken by the name + degree under each node
const pct = (v: number, total: number) => `${(v / total) * 100}%`;

/** How far along a segment we must travel from an endpoint to clear its photo (and name, when heading down). */
function clearance(dx: number, dy: number) {
  const len = Math.hypot(dx, dy) || 1;
  const down = dy / len; // >0 means the segment leaves the node downward, through its name
  return NODE_D / 2 + 6 + Math.max(0, down) * NAME_BLOCK;
}

/**
 * Places a label on the visible part of the segment, between the two nodes' photo + name blocks.
 * Steep segments get a horizontal label beside the line (on the side away from the center).
 */
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
    // Put the label on the side the line heads toward as it goes down, so sibling edges fan apart.
    const lowerDx = dy >= 0 ? dx : -dx;
    const left = lowerDx === 0 ? mx < GRAPH_W / 2 : lowerDx < 0;
    return { transform: `translate(${mx + (left ? -8 : 8)} ${my + 4})`, textAnchor: left ? "end" : "start" };
  }
  return { transform: `translate(${mx} ${my}) rotate(${angle}) translate(0 -6)`, textAnchor: "middle" };
}

interface AlumniGraphProps {
  /** Content rendered over the center of the graph. When omitted, a small BU hub is drawn. */
  center?: ReactNode;
}

export function AlumniGraph({ center }: AlumniGraphProps) {
  const [active, setActive] = useState<string | null>(null);
  const byId = useMemo(() => Object.fromEntries(ALUMNI.map((n) => [n.id, n])), []);

  const related = useMemo(() => {
    if (!active) return null;
    const s = new Set<string>([active]);
    EDGES.forEach((e) => {
      if (e.from === active) s.add(e.to);
      if (e.to === active) s.add(e.from);
    });
    return s;
  }, [active]);

  const edgeOn = (a: string, b: string) => !!active && (a === active || b === active);

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

        {/* Hub spokes */}
        {HUB_EDGES.map((h, i) => {
          const n = byId[h.to];
          const on = active === h.to;
          return (
            <g key={`hub-${h.to}`}>
              <motion.path
                d={`M ${HUB.x} ${HUB.y} L ${n.x} ${n.y}`}
                stroke={on ? "hsl(var(--primary))" : "hsl(var(--foreground) / 0.18)"}
                strokeWidth={on ? 2.4 : 1.6}
                fill="none"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.9, delay: 0.3 + i * 0.06, ease: [0.22, 1, 0.36, 1] }}
              />
              <text
                {...labelProps(HUB.x, HUB.y, n.x, n.y, 0.8)}
                className="font-sans"
                style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", paintOrder: "stroke" }}
                fill={on ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))"}
                stroke="hsl(var(--background))"
                strokeWidth={4}
              >
                {h.label.toUpperCase()}
              </text>
            </g>
          );
        })}

        {/* Center fade so spokes dissolve under the headline */}
        <ellipse cx={HUB.x} cy={HUB.y} rx={310} ry={255} fill="url(#hub-fade)" />

        {/* Alumni-to-alumni edges */}
        {EDGES.map((e, i) => {
          const a = byId[e.from];
          const b = byId[e.to];
          const on = edgeOn(e.from, e.to);
          const dim = !!active && !on;
          return (
            <g key={`${e.from}-${e.to}`} style={{ opacity: dim ? 0.25 : 1, transition: "opacity 200ms" }}>
              <motion.path
                d={`M ${a.x} ${a.y} L ${b.x} ${b.y}`}
                stroke={on ? "hsl(var(--primary))" : "hsl(var(--foreground) / 0.32)"}
                strokeWidth={on ? 2.6 : 1.6}
                fill="none"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.8, delay: 0.5 + i * 0.04, ease: [0.22, 1, 0.36, 1] }}
              />
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
            </g>
          );
        })}

        {!center && (
          <g>
            <circle cx={HUB.x} cy={HUB.y} r={46} fill="hsl(var(--foreground))" />
            <text x={HUB.x} y={HUB.y + 8} textAnchor="middle" style={{ fontSize: 24, fontWeight: 800 }} fill="hsl(var(--background))" className="font-display">
              BU
            </text>
          </g>
        )}
      </svg>

      {/* Center overlay */}
      {center && (
        <div className="absolute z-10 flex items-center justify-center pointer-events-none" style={{ left: pct(HUB.x - 280, GRAPH_W), width: pct(560, GRAPH_W), top: pct(HUB.y - 230, GRAPH_H), height: pct(460, GRAPH_H) }}>
          <div className="pointer-events-auto">{center}</div>
        </div>
      )}

      {/* Nodes */}
      {ALUMNI.map((n, i) => (
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

function GraphNode({ node, index, dimmed, highlighted, onEnter, onLeave }: {
  node: AlumNode;
  index: number;
  dimmed: boolean;
  highlighted: boolean;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const tooltipBelow = node.y < GRAPH_H / 2;
  return (
    <div
      className="absolute z-20"
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
      tabIndex={0}
      aria-label={`${node.name}, ${node.degree}, ${node.field}`}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.4 }}
        animate={{ opacity: 1, scale: highlighted ? 1.08 : 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 20, delay: 0.15 + index * 0.035 }}
        className={`aspect-square w-full rounded-full overflow-hidden bg-card shadow-md ring-[3px] ${highlighted ? "ring-primary" : "ring-background"} cursor-pointer`}
      >
        {node.photo ? (
          <img src={node.photo} alt={node.name} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-primary/10 text-primary font-display font-bold text-lg">
            {initials(node.name)}
          </div>
        )}
      </motion.div>
      <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1.5 text-center w-max max-w-[150px] px-1.5 py-0.5 rounded-md bg-background/90 pointer-events-none">
        <p className="text-[11px] xl:text-xs font-semibold text-foreground leading-tight">{node.name}</p>
        <p className="text-[10px] font-bold tracking-[0.12em] uppercase text-primary mt-0.5">{node.degree}</p>
      </div>
      {highlighted && (
        <motion.div
          initial={{ opacity: 0, y: tooltipBelow ? -4 : 4 }}
          animate={{ opacity: 1, y: 0 }}
          className={`absolute left-1/2 -translate-x-1/2 w-[220px] bg-card text-card-foreground rounded-xl shadow-xl border border-border p-3 z-40 pointer-events-none ${tooltipBelow ? "top-[calc(100%+44px)]" : "bottom-[calc(100%+10px)]"}`}
        >
          <p className="text-[10px] font-bold tracking-[0.15em] uppercase text-primary mb-1">{node.field}</p>
          <p className="text-xs leading-snug text-foreground">{node.note}</p>
        </motion.div>
      )}
    </div>
  );
}
