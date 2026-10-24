import { useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { EDGE_TYPE_LABEL, SOURCE_LABEL, STATUS_LABEL } from "@/lib/graphLabels";
import { ALL_FILTERS, PRESETS, activePreset, applyPreset, type Filters, type PresetKey } from "@/data/filters";
import type { GraphIndex } from "@/data/graphIndex";
import { BU_STATUSES, EDGE_TYPES, SOURCE_NAMES, type BuStatus, type EdgeType, type SourceName } from "@/types/graph";

// Requirement 6: filters plus one-click Research / Patent presets.

function toggle<T>(set: ReadonlySet<T>, value: T, on: boolean): Set<T> {
  const next = new Set(set);
  if (on) next.add(value);
  else next.delete(value);
  return next;
}

function CheckRow({ id, label, count, checked, onChange }: { id: string; label: string; count?: number; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} />
      <label htmlFor={id} className={cn("flex-1 cursor-pointer text-sm", count === 0 && "text-muted-foreground")}>
        {label}
      </label>
      {count !== undefined && <span className="text-[11px] tabular-nums text-muted-foreground">{count.toLocaleString()}</span>}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="mt-4">
      <legend className="mb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{title}</legend>
      {children}
    </fieldset>
  );
}

export function FilterPanel({ index, filters, onChange }: { index: GraphIndex; filters: Filters; onChange: (f: Filters) => void }) {
  const [topicQuery, setTopicQuery] = useState("");
  const preset = activePreset(filters);

  // Counts come straight from the loaded graph so empty categories are visible as such.
  const counts = useMemo(() => {
    const edgeTypes = new Map<EdgeType, number>();
    for (const e of index.doc.edges) edgeTypes.set(e.type, (edgeTypes.get(e.type) ?? 0) + 1);
    const statuses = new Map<BuStatus, number>();
    for (const p of index.byType.person) statuses.set(p.bu_affiliation!.status, (statuses.get(p.bu_affiliation!.status) ?? 0) + 1);
    const sources = new Map<SourceName, number>();
    // Records (nodes and edges) citing each source at least once.
    for (const n of index.doc.nodes) for (const s of new Set(n.sources.map((x) => x.source))) sources.set(s, (sources.get(s) ?? 0) + 1);
    for (const e of index.doc.edges) for (const s of new Set(e.evidence.map((x) => x.source))) sources.set(s, (sources.get(s) ?? 0) + 1);
    const topics = index.byType.topic
      .map((t) => ({ t, n: index.edgesByNode.get(t.id)!.filter((e) => e.type === "HAS_TOPIC").length }))
      .sort((a, b) => b.n - a.n || a.t.label.localeCompare(b.t.label));
    return { edgeTypes, statuses, sources, topics };
  }, [index]);

  const visibleTopics = counts.topics.filter(({ t }) => filters.topics.has(t.id) || !topicQuery || t.label.toLowerCase().includes(topicQuery.toLowerCase())).slice(0, 12);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold">Filters</h2>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onChange(ALL_FILTERS)}>
          <RotateCcw className="mr-1 h-3 w-3" aria-hidden="true" /> Reset
        </Button>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2" role="group" aria-label="Presets">
        {(Object.keys(PRESETS) as PresetKey[]).map((key) => (
          <Button key={key} size="sm" variant={preset === key ? "default" : "outline"} aria-pressed={preset === key} className="h-auto whitespace-normal py-1.5 text-xs" onClick={() => onChange(applyPreset(filters, key))}>
            {PRESETS[key].label}
          </Button>
        ))}
      </div>
      {preset === "patent" && (counts.edgeTypes.get("INVENTED") ?? 0) + (counts.edgeTypes.get("ASSIGNED_TO") ?? 0) === 0 && (
        <p className="mt-2 text-xs text-muted-foreground">The loaded graph has no patent connections yet.</p>
      )}

      <Group title="Relationship type">
        {EDGE_TYPES.map((t) => (
          <CheckRow key={t} id={`f-edge-${t}`} label={EDGE_TYPE_LABEL[t]} count={counts.edgeTypes.get(t) ?? 0} checked={filters.edgeTypes.has(t)} onChange={(on) => onChange({ ...filters, edgeTypes: toggle(filters.edgeTypes, t, on) })} />
        ))}
      </Group>

      <Group title="BU affiliation">
        {BU_STATUSES.map((s) => (
          <CheckRow key={s} id={`f-status-${s}`} label={STATUS_LABEL[s]} count={counts.statuses.get(s) ?? 0} checked={filters.statuses.has(s)} onChange={(on) => onChange({ ...filters, statuses: toggle(filters.statuses, s, on) })} />
        ))}
      </Group>

      <Group title="Source">
        {SOURCE_NAMES.filter((s) => counts.sources.has(s) || !filters.sources.has(s)).map((s) => (
          <CheckRow key={s} id={`f-src-${s}`} label={SOURCE_LABEL[s]} count={counts.sources.get(s) ?? 0} checked={filters.sources.has(s)} onChange={(on) => onChange({ ...filters, sources: toggle(filters.sources, s, on) })} />
        ))}
      </Group>

      <Group title="Topic">
        <Input value={topicQuery} onChange={(e) => setTopicQuery(e.target.value)} placeholder="Filter topics…" className="h-8 text-sm" aria-label="Filter topic list" />
        <p className="mt-1 text-[11px] text-muted-foreground">{filters.topics.size ? `${filters.topics.size} selected. Works must have one of these topics.` : "None selected: all topics."}</p>
        <div className="mt-1">
          {visibleTopics.map(({ t, n }) => (
            <CheckRow key={t.id} id={`f-topic-${t.id}`} label={t.label} count={n} checked={filters.topics.has(t.id)} onChange={(on) => onChange({ ...filters, topics: toggle(filters.topics, t.id, on) })} />
          ))}
        </div>
      </Group>
    </div>
  );
}
