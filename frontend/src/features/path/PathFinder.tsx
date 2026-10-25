import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeftRight, Network, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { AffiliationBadge } from "@/components/graph/badges";
import type { GraphIndex } from "@/data/graphIndex";
import { degreeLine, describeLink, shortestPath, statusOf, suggestedPeople, type LinkKind, type PeopleIndex, type PathStep } from "@/data/people";
import type { BuStatus } from "@/types/graph";
import { Eyebrow, PersonAvatar, PersonPicker, RecordRow, sortRecords } from "@/features/people/shared";

const MAX_HOPS = 6;
const ALL_KINDS: ReadonlySet<LinkKind> = new Set<LinkKind>(["paper", "grant", "funded"]);
const PAPER_KINDS: ReadonlySet<LinkKind> = new Set<LinkKind>(["paper"]);
const ALUMNI: ReadonlySet<BuStatus> = new Set<BuStatus>(["verified_alumnus"]);

interface Props {
  index: GraphIndex;
  pidx: PeopleIndex;
  from: string | null;
  to: string | null;
  onChange: (from: string | null, to: string | null) => void;
  onOpenInNetwork: (id: string) => void;
}

export function PathFinder({ index, pidx, from: rawFrom, to: rawTo, onChange, onOpenInNetwork }: Props) {
  // Unknown IDs (stale or mistyped links) count as "not chosen".
  const from = rawFrom && pidx.adjacency.has(rawFrom) ? rawFrom : null;
  const to = rawTo && pidx.adjacency.has(rawTo) ? rawTo : null;
  const [grants, setGrants] = useState(true);
  const kinds = grants ? ALL_KINDS : PAPER_KINDS;
  const path = useMemo(() => (from && to ? shortestPath(index, pidx, from, to, MAX_HOPS, kinds) : undefined), [index, pidx, from, to, kinds]);

  // Example pairs: well-connected alumni that are 2-4 steps apart.
  const examples = useMemo(() => {
    const people = suggestedPeople(index, pidx, ALUMNI, 10);
    const out: [string, string, number][] = [];
    for (let i = 0; i < people.length && out.length < 3; i++) {
      for (let j = people.length - 1; j > i && out.length < 3; j--) {
        const p = shortestPath(index, pidx, people[i].id, people[j].id, 4);
        if (p && p.length >= 3 && !out.some(([a, b]) => a === people[i].id || b === people[j].id)) out.push([people[i].id, people[j].id, p.length - 1]);
      }
    }
    return out;
  }, [index, pidx]);

  return (
    <div className="relative min-h-0 flex-1 overflow-auto" data-lenis-prevent>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(ellipse_at_50%_0%,hsl(340_75%_92%/_0.85)_0%,hsl(340_75%_96%/_0.4)_35%,transparent_70%)]" aria-hidden="true" />
      <div className="relative mx-auto max-w-3xl px-6 py-14 lg:py-16">
        <div className="text-center">
          <Eyebrow>How are we connected?</Eyebrow>
          <h1 className="mt-3 font-display text-4xl font-bold leading-[1.02] tracking-[-0.035em] text-foreground sm:text-5xl">Find the path between two people</h1>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            We look for the shortest chain of real collaborations: shared papers and NIH grants. Every step links to the record behind it.
          </p>
        </div>

        <div className="mt-10 grid items-center gap-3 sm:grid-cols-[1fr_auto_1fr]">
          <PersonPicker index={index} pidx={pidx} value={from} onChange={(id) => onChange(id, to)} label="From person" placeholder="From… (e.g. you, or your advisor)" />
          <Button
            variant="outline"
            size="icon"
            className="mx-auto rounded-full"
            onClick={() => onChange(to, from)}
            disabled={!from && !to}
            aria-label="Swap the two people"
          >
            <ArrowLeftRight className="h-4 w-4" />
          </Button>
          <PersonPicker index={index} pidx={pidx} value={to} onChange={(id) => onChange(from, id)} label="To person" placeholder="To… (someone you'd like to meet)" />
        </div>
        <div className="mt-4 flex items-center justify-center gap-3">
          <Switch id="path-grants" checked={grants} onCheckedChange={setGrants} />
          <Label htmlFor="path-grants" className="text-sm text-muted-foreground">Include NIH grant links</Label>
        </div>

        {!from || !to ? (
          examples.length > 0 && (
            <div className="mt-12">
              <p className="flex items-center justify-center gap-1.5 text-sm font-semibold text-foreground">
                <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" /> Try an example
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {examples.map(([a, b, hops]) => (
                  <button
                    key={`${a}-${b}`}
                    type="button"
                    onClick={() => onChange(a, b)}
                    className="rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition-transform hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex items-center">
                      <PersonAvatar person={index.nodes.get(a)!} size="sm" className="ring-2 ring-card" />
                      <PersonAvatar person={index.nodes.get(b)!} size="sm" className="-ml-2 ring-2 ring-card" />
                      <span className="ml-auto text-[11px] font-bold uppercase tracking-[0.15em] text-primary">{hops} degrees</span>
                    </div>
                    <p className="mt-3 text-sm font-semibold leading-snug text-foreground">
                      {index.nodes.get(a)!.label} <span className="text-muted-foreground">to</span> {index.nodes.get(b)!.label}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )
        ) : path === null ? (
          <div className="mt-12 rounded-3xl bg-card p-8 text-center shadow-sm">
            <h2 className="font-display text-2xl font-bold text-foreground">No connection within {MAX_HOPS} steps</h2>
            <p className="mt-2 text-muted-foreground">
              These two people aren't linked by shared papers{grants ? " or NIH grants" : ""} in our data yet.
              {!grants && " Try including NIH grant links."}
            </p>
          </div>
        ) : path ? (
          <PathResult index={index} path={path} onOpenInNetwork={onOpenInNetwork} />
        ) : null}
      </div>
    </div>
  );
}

function PathResult({ index, path, onOpenInNetwork }: { index: GraphIndex; path: PathStep[]; onOpenInNetwork: (id: string) => void }) {
  const hops = path.length - 1;
  const alumni = path.filter((s) => statusOf(s.person) === "verified_alumnus").length;
  return (
    <div className="mt-12">
      <div className="text-center">
        <p className="font-display text-7xl font-bold leading-none tracking-[-0.04em] text-primary">{hops}</p>
        <p className="mt-2 text-lg font-semibold text-foreground">{hops === 1 ? "degree apart: they've worked together" : "degrees apart"}</p>
        {alumni > 0 && <p className="mt-1 text-sm text-muted-foreground">{alumni} verified BU alum{alumni === 1 ? "" : "ni"} along the way</p>}
      </div>
      <ol className="mt-10">
        {path.map((step, i) => (
          <motion.li
            key={step.person.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: i * 0.12, ease: [0.22, 1, 0.36, 1] }}
          >
            {step.link && <LinkStep step={step} />}
            <div className="flex items-center gap-4 rounded-3xl bg-card p-5 shadow-sm">
              <PersonAvatar person={step.person} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-lg font-semibold text-foreground">{step.person.label}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <AffiliationBadge status={statusOf(step.person)} />
                  {degreeLine(step.person) && <span className="text-xs text-muted-foreground">{degreeLine(step.person)}</span>}
                </div>
              </div>
              <Button size="sm" variant="ghost" className="shrink-0 rounded-full text-primary" onClick={() => onOpenInNetwork(step.person.id)} aria-label={`Open ${step.person.label} in the people network`}>
                <Network className="h-4 w-4" />
              </Button>
            </div>
          </motion.li>
        ))}
      </ol>
      <p className="mt-6 text-center text-xs text-muted-foreground">
        Shortest chain found in our data. There may be other paths of the same length; we prefer the best-documented one.
      </p>
    </div>
  );
}

function LinkStep({ step }: { step: PathStep }) {
  const [open, setOpen] = useState(false);
  const records = sortRecords(step.link!.records);
  const shown = open ? records : records.slice(0, 1);
  return (
    <div className="relative ml-[2.9rem] border-l-2 border-dashed border-primary/40 py-3 pl-6">
      <span className="absolute -left-[5px] top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-primary" aria-hidden="true" />
      <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-primary">{describeLink(step.link!)}</p>
      <div className="mt-1 rounded-2xl bg-card/70">
        {shown.map((r) => (
          <RecordRow key={`${r.kind}-${r.record.id}`} record={r.record} kind={r.kind} />
        ))}
      </div>
      {records.length > 1 && (
        <button type="button" onClick={() => setOpen((v) => !v)} className="mt-1 text-xs font-semibold text-primary hover:underline">
          {open ? "Show less" : `+${records.length - 1} more record${records.length === 2 ? "" : "s"}`}
        </button>
      )}
    </div>
  );
}
