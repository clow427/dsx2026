import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Plus, RotateCcw, Route } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { AffiliationBadge } from "@/components/graph/badges";
import type { GraphIndex } from "@/data/graphIndex";
import { rankPeople, type RankedPerson } from "@/data/findMyPeople";
import { buildCategories } from "@/data/categories";
import {
  degreeLine,
  filterLink,
  rankNeighbors,
  statusOf,
  STATUS_RANK,
  suggestedPeople,
  type LinkKind,
  type PeopleIndex,
  type PersonLink,
} from "@/data/people";
import type { BuStatus } from "@/types/graph";
import { PeopleGraph, type PeopleSelection, type TopicHub } from "./PeopleGraph";
import { LinkPanel, PersonPanel, TopicPanel } from "./PeoplePanels";
import { Eyebrow, PersonAvatar, PersonPicker, STATUS_COLOR, STATUS_SHORT, TopicIcon } from "./shared";

const FOCUS_LIMIT = 24;
const EXPAND_LIMIT = 12;

export type Audience = "everyone" | "bu" | "alumni";

const AUDIENCE_STATUSES: Record<Audience, ReadonlySet<BuStatus> | undefined> = {
  everyone: undefined,
  bu: new Set<BuStatus>(["verified_alumnus", "bu_affiliated_researcher"]),
  alumni: new Set<BuStatus>(["verified_alumnus"]),
};

const ALL_KINDS: ReadonlySet<LinkKind> = new Set<LinkKind>(["paper", "grant", "funded"]);
const PAPER_KINDS: ReadonlySet<LinkKind> = new Set<LinkKind>(["paper"]);

interface Props {
  index: GraphIndex;
  pidx: PeopleIndex;
  focusId: string | null;
  selection: PeopleSelection;
  onFocus: (id: string | null) => void;
  onSelect: (sel: PeopleSelection) => void;
  onConnect: (fromId: string) => void;
}

export function PeopleNetwork({ index, pidx, focusId, selection, onFocus, onSelect, onConnect }: Props) {
  const [audience, setAudience] = useState<Audience>("everyone");
  const [grants, setGrants] = useState(true);
  const [limit, setLimit] = useState(FOCUS_LIMIT);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [pinned, setPinned] = useState<string[]>([]);
  const kinds = grants ? ALL_KINDS : PAPER_KINDS;
  const statuses = AUDIENCE_STATUSES[audience];

  useEffect(() => {
    setExpanded([]);
    setPinned([]);
    setLimit(FOCUS_LIMIT);
  }, [focusId]);

  const focusNode = focusId ? index.nodes.get(focusId) : undefined;
  const isTopic = focusNode?.type === "topic";

  // Topic scenes: people with papers on the topic, BU alumni first, then most papers.
  const topicPeople = useMemo<RankedPerson[]>(() => {
    if (!isTopic || !focusNode) return [];
    return rankPeople(index, [focusNode], { statuses }).sort(
      (a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || b.contributions.length - a.contributions.length || b.score - a.score,
    );
  }, [index, isTopic, focusNode, statuses]);

  const scene = useMemo(() => {
    if (!focusId || !focusNode) return null;
    const visible = new Set<string>();
    let total: number;
    let hub: TopicHub | undefined;
    if (isTopic) {
      const shown = topicPeople.slice(0, limit);
      shown.forEach((r) => visible.add(r.person.id));
      total = topicPeople.length;
      hub = { id: focusId, label: focusNode.label, spokes: shown.map((r) => ({ personId: r.person.id, papers: r.contributions.length })) };
    } else {
      visible.add(focusId);
      const ranked = rankNeighbors(index, pidx, focusId, { statuses, kinds });
      ranked.slice(0, limit).forEach((n) => visible.add(n.person.id));
      total = ranked.length;
    }
    for (const id of expanded) {
      visible.add(id);
      rankNeighbors(index, pidx, id, { statuses, kinds }).slice(0, EXPAND_LIMIT).forEach((n) => visible.add(n.person.id));
    }
    pinned.forEach((id) => visible.add(id));
    const links: PersonLink[] = [];
    for (const id of visible) {
      for (const [other, raw] of pidx.adjacency.get(id) ?? []) {
        if (id < other && visible.has(other)) {
          const l = filterLink(raw, kinds);
          if (l) links.push(l);
        }
      }
    }
    return { personIds: [...visible].sort(), links, hub, total, shown: Math.min(limit, total) };
  }, [index, pidx, focusId, focusNode, isTopic, topicPeople, statuses, kinds, limit, expanded, pinned]);

  const selectPerson = (id: string) => {
    if (scene && !scene.personIds.includes(id)) setPinned((p) => [...p, id]);
    onSelect({ kind: "person", id });
  };
  const expand = (id: string) => setExpanded((x) => (x.includes(id) ? x : [...x, id]));

  if (!focusId || !scene) return <StartScreen index={index} pidx={pidx} onPick={onFocus} />;

  const focus = focusNode!;
  const counts = new Map<BuStatus, number>();
  scene.personIds.forEach((id) => {
    const s = statusOf(index.nodes.get(id));
    counts.set(s, (counts.get(s) ?? 0) + 1);
  });

  const selectedPerson = selection?.kind === "person" ? selection.id : isTopic ? null : focusId;
  const topicEntry = isTopic && selectedPerson ? topicPeople.find((r) => r.person.id === selectedPerson) : undefined;
  const panel =
    selection?.kind === "link" ? (
      <LinkPanel index={index} pidx={pidx} linkId={selection.id} kinds={kinds} onSelectPerson={selectPerson} />
    ) : selectedPerson ? (
      <PersonPanel
        key={selectedPerson}
        index={index}
        pidx={pidx}
        personId={selectedPerson}
        isFocus={selectedPerson === focusId}
        kinds={kinds}
        onSelectPerson={selectPerson}
        onFocus={(id) => onFocus(id)}
        onExpand={expand}
        onConnect={onConnect}
        topicWork={topicEntry ? { topic: focus, records: topicEntry.contributions.map((c) => c.record) } : undefined}
      />
    ) : (
      <TopicPanel index={index} topic={focus} ranked={topicPeople} onSelectPerson={selectPerson} />
    );

  return (
    // Phones: one scrolling column (rail, graph, details). Desktop: three fixed-height columns.
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] grid-rows-[auto_65vh_auto] overflow-y-auto lg:grid-cols-[300px_minmax(0,1fr)_420px] lg:grid-rows-1 lg:overflow-hidden" data-lenis-prevent>
      <aside aria-label="Choose who to show" className="space-y-6 border-b border-border p-5 lg:min-h-0 lg:overflow-auto lg:border-b-0 lg:border-r" data-lenis-prevent>
        <div>
          <Eyebrow>Center on</Eyebrow>
          <div className="mt-2">
            <PersonPicker index={index} pidx={pidx} value={focusId} onChange={(id) => onFocus(id)} label="Center the network on a person or topic" placeholder="Search a person or topic…" includeTopics />
          </div>
        </div>

        <div>
          <Eyebrow>Show</Eyebrow>
          <ToggleGroup
            type="single"
            value={audience}
            onValueChange={(v) => v && setAudience(v as Audience)}
            className="mt-2 grid grid-cols-3 gap-1 rounded-full bg-muted p-1"
            aria-label="Which people to show"
          >
            {(
              [
                ["everyone", "All"],
                ["bu", "BU"],
                ["alumni", "Alumni"],
              ] as const
            ).map(([v, label]) => (
              <ToggleGroupItem key={v} value={v} className="h-8 rounded-full text-xs font-semibold data-[state=on]:bg-card data-[state=on]:text-primary data-[state=on]:shadow-sm">
                {label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <div className="mt-4 flex items-center justify-between gap-3">
            <Label htmlFor="grant-links" className="text-sm">
              Include NIH grant links
              <span className="block text-xs font-normal text-muted-foreground">Shared grants, and grants that funded a paper</span>
            </Label>
            <Switch id="grant-links" checked={grants} onCheckedChange={setGrants} />
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <Eyebrow className="text-muted-foreground">In this view</Eyebrow>
          <ul className="mt-2 space-y-1.5 text-sm">
            {(["verified_alumnus", "bu_affiliated_researcher", "unverified", "ambiguous"] as BuStatus[])
              .filter((s) => counts.get(s))
              .map((s) => (
                <li key={s} className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ background: STATUS_COLOR[s] }} aria-hidden="true" />
                  <span className="flex-1 text-foreground">{STATUS_SHORT[s]}</span>
                  <span className="font-semibold text-muted-foreground">{counts.get(s)}</span>
                </li>
              ))}
          </ul>
          <ul className="mt-3 space-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
            <li className="flex items-center gap-2"><span className="w-6 border-t-2 border-[hsl(240,10%,75%)]" aria-hidden="true" />Shared papers (thicker = more)</li>
            {grants && <li className="flex items-center gap-2"><span className="w-6 border-t-2 border-dashed border-warning" aria-hidden="true" />NIH grant link only</li>}
            <li>Hover a person to highlight their connections. Double-click to show their network.</li>
          </ul>
        </div>
      </aside>

      <main className="flex min-h-0 min-w-0 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
          {isTopic ? <TopicIcon size="xs" /> : <PersonAvatar person={focus} size="xs" />}
          <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground" aria-live="polite">
            <span className="font-semibold text-foreground">{focus.label}</span> · {scene.shown} of {scene.total} {isTopic ? "people" : "connections"}
            {scene.total > scene.shown && " (BU alumni first)"}
          </p>
          {scene.total > scene.shown && (
            <Button size="sm" variant="outline" className="h-8 rounded-full" onClick={() => setLimit((l) => l + FOCUS_LIMIT)}>
              <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Show more
            </Button>
          )}
          {!isTopic && (
            <Button size="sm" variant="outline" className="h-8 rounded-full" onClick={() => onConnect(focusId)}>
              <Route className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Find a connection
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-8 rounded-full" onClick={() => { setExpanded([]); setPinned([]); setLimit(FOCUS_LIMIT); onSelect(null); }}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Reset
          </Button>
        </div>
        <div className="relative min-h-0 flex-1">
          {scene.total === 0 && (
            <div className="absolute inset-x-0 top-6 z-10 mx-auto w-fit rounded-full bg-card px-4 py-2 text-sm text-muted-foreground shadow-sm">
              No {audience === "everyone" ? "" : audience === "bu" ? "BU " : "alumni "}
              {isTopic ? "people on this topic" : "connections"} with these settings.
            </div>
          )}
          <PeopleGraph
            index={index}
            personIds={scene.personIds}
            links={scene.links}
            focusId={focusId}
            hub={scene.hub}
            expanded={expanded}
            selection={selection}
            onSelect={(sel) => (sel?.kind === "person" ? selectPerson(sel.id) : onSelect(sel))}
            onExpand={expand}
          />
        </div>
      </main>

      <aside aria-label="Details" className="border-t border-border bg-muted/30 lg:min-h-0 lg:overflow-auto lg:border-l lg:border-t-0" data-lenis-prevent>
        {panel}
      </aside>
    </div>
  );
}

function StartScreen({ index, pidx, onPick }: { index: GraphIndex; pidx: PeopleIndex; onPick: (id: string) => void }) {
  const alumni = useMemo(() => suggestedPeople(index, pidx, new Set<BuStatus>(["verified_alumnus"]), 4), [index, pidx]);
  const researchers = useMemo(() => suggestedPeople(index, pidx, new Set<BuStatus>(["bu_affiliated_researcher"]), 4), [index, pidx]);
  // The biggest topics across fields, as one-click starting points.
  const popular = useMemo(
    () =>
      buildCategories(index)
        .flatMap((f) => f.subfields.flatMap((s) => s.topics))
        .sort((a, b) => b.records - a.records)
        .slice(0, 8),
    [index],
  );
  return (
    <div className="relative min-h-0 flex-1 overflow-auto" data-lenis-prevent>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(ellipse_at_50%_0%,hsl(340_75%_92%/_0.85)_0%,hsl(340_75%_96%/_0.4)_35%,transparent_70%)]" aria-hidden="true" />
      <div className="relative mx-auto max-w-5xl px-6 py-16 lg:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <Eyebrow>People network</Eyebrow>
          <h1 className="mt-3 font-display text-4xl font-bold leading-[1.02] tracking-[-0.035em] text-foreground sm:text-6xl">Who's working on what?</h1>
          <p className="mt-4 text-lg text-muted-foreground">Search a topic to see the BU people working on it, or a person to see who they work with. Alumni come first, and every connection links to the paper or grant behind it.</p>
          <div className="mx-auto mt-8 max-w-md text-left">
            <PersonPicker index={index} pidx={pidx} value={null} onChange={(id) => id && onPick(id)} label="Search a topic or person" placeholder="Try “dementia”, “imaging”, or a name…" includeTopics autoFocus />
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-2" role="group" aria-label="Popular topics">
            {popular.map((t) => (
              <button
                key={t.topic.id}
                type="button"
                onClick={() => onPick(t.topic.id)}
                className="rounded-full border border-border bg-card px-3.5 py-1.5 text-sm font-semibold text-foreground shadow-sm transition-colors hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {t.topic.label} <span className="text-muted-foreground">{t.records}</span>
              </button>
            ))}
          </div>
        </div>
        {[
          ["Well-connected BU alumni", alumni],
          ["Well-connected BU researchers", researchers],
        ].map(([title, people]) => (
          <section key={title as string} className="mt-14">
            <h2 className="font-display text-2xl font-bold tracking-[-0.02em] text-foreground">{title as string}</h2>
            <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {(people as typeof alumni).map((p, i) => (
                <motion.button
                  key={p.id}
                  type="button"
                  onClick={() => onPick(p.id)}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
                  whileHover={{ y: -6 }}
                  className="group h-full rounded-3xl bg-card p-6 text-left shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <PersonAvatar person={p} size="lg" />
                  <div className="mt-5"><AffiliationBadge status={statusOf(p)} /></div>
                  <h3 className="mt-2 font-display text-lg font-semibold tracking-[-0.01em] text-foreground transition-colors group-hover:text-primary">{p.label}</h3>
                  <p className="mt-0.5 text-sm text-muted-foreground">{pidx.adjacency.get(p.id)?.size ?? 0} connections</p>
                  {degreeLine(p) && <p className="mt-3 text-xs text-foreground/80">{degreeLine(p)}</p>}
                </motion.button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
