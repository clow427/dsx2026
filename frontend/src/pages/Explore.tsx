import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Expand, List, Network, RotateCcw, Users } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataBanner, GraphGate } from "@/components/graph/DataStatus";
import { NodeTypeGlyph } from "@/components/graph/badges";
import { NODE_TYPE_LABEL } from "@/lib/graphLabels";
import { cn } from "@/lib/utils";
import { ALL_FILTERS, edgesAmong, neighborhood, type Filters } from "@/data/filters";
import { defaultTopic, type GraphIndex } from "@/data/graphIndex";
import { NODE_TYPES } from "@/types/graph";
import { GraphCanvas, type Selection } from "@/features/explorer/GraphCanvas";
import { NeighborhoodList } from "@/features/explorer/NeighborhoodList";
import { EdgePanel, NodePanel } from "@/features/details/DetailPanels";
import { SearchBox } from "@/features/search/SearchBox";
import { FilterPanel } from "@/features/filters/FilterPanel";
import { FindMyPeople } from "@/features/find-my-people/FindMyPeople";

// URL state (design.md): ?node=<focus id>, ?sel=<selected node>, ?edge=<selected edge>,
// ?view=graph|people, ?topic=<Find My People query>. Deep links open straight to a scene.

const FOCUS_LIMIT = 40;
const EXPAND_LIMIT = 25;

export default function Explore() {
  return (
    <div className="flex h-screen flex-col bg-background">
      <GraphGate>{({ index, isMock }) => <ExploreReady index={index} isMock={isMock} />}</GraphGate>
    </div>
  );
}

function ExploreReady({ index, isMock }: { index: GraphIndex; isMock: boolean }) {
  const [params, setParams] = useSearchParams();
  const demo = useMemo(() => defaultTopic(index), [index]);
  const view = params.get("view") === "people" ? "people" : "graph";
  const rawFocus = params.get("node");
  const focusId = rawFocus && index.nodes.has(rawFocus) ? rawFocus : (demo?.id ?? index.doc.nodes[0]?.id ?? null);
  const selection: Selection = params.get("edge") ? { kind: "edge", id: params.get("edge")! } : params.get("sel") ? { kind: "node", id: params.get("sel")! } : focusId ? { kind: "node", id: focusId } : null;

  const [filters, setFilters] = useState<Filters>(ALL_FILTERS);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [pinned, setPinned] = useState<string[]>([]);
  const [canvasTab, setCanvasTab] = useState("graph");

  useEffect(() => {
    setExpanded([]);
    setPinned([]);
  }, [focusId]);

  const update = useCallback(
    (patch: Record<string, string | null>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v === null) next.delete(k);
            else next.set(k, v);
          }
          return next;
        },
        { replace: false },
      );
    },
    [setParams],
  );

  const select = useCallback(
    (sel: Selection) => {
      if (!sel) return update({ sel: null, edge: null });
      if (sel.kind === "node") {
        setPinned((p) => (p.includes(sel.id) ? p : [...p, sel.id]));
        update({ sel: sel.id, edge: null });
      } else {
        const e = index.edges.get(sel.id);
        if (e) setPinned((p) => [...new Set([...p, e.source, e.target])]);
        update({ edge: sel.id });
      }
    },
    [index, update],
  );
  const focus = useCallback((id: string) => update({ node: id, sel: null, edge: null, view: null }), [update]);
  const expand = useCallback((id: string) => setExpanded((x) => (x.includes(id) ? x : [...x, id])), []);

  // The visible subgraph: focus + its top neighbors, plus expanded and pinned nodes.
  const { nodeIds, edges, focusTotal, focusShown } = useMemo(() => {
    const visible = new Set<string>();
    let focusTotal = 0;
    let focusShown = 0;
    if (focusId) {
      visible.add(focusId);
      const nb = neighborhood(index, focusId, filters, FOCUS_LIMIT);
      nb.neighbors.forEach((n) => visible.add(n.node.id));
      focusTotal = nb.total;
      focusShown = nb.neighbors.length;
    }
    for (const id of expanded) {
      visible.add(id);
      neighborhood(index, id, filters, EXPAND_LIMIT).neighbors.forEach((n) => visible.add(n.node.id));
    }
    pinned.forEach((id) => index.nodes.has(id) && visible.add(id));
    const anchored = new Set([...(focusId ? [focusId] : []), ...expanded, ...pinned]);
    const nodeIds = [...visible].sort();
    return { nodeIds, edges: edgesAmong(index, visible, filters, anchored), focusTotal, focusShown };
  }, [index, focusId, filters, expanded, pinned]);

  const focusNode = focusId ? index.nodes.get(focusId) : undefined;
  const presentTypes = NODE_TYPES.filter((t) => index.byType[t].length > 0);

  const detail = selection ? (
    selection.kind === "edge" ? (
      <EdgePanel index={index} edgeId={selection.id} onSelect={select} onFocus={focus} />
    ) : (
      <NodePanel key={selection.id} index={index} nodeId={selection.id} onSelect={select} onFocus={focus} onExpand={(id) => { if (view === "people") focus(id); else expand(id); }} />
    )
  ) : (
    <p className="p-4 text-sm text-muted-foreground">Select a node or a connection to see its records.</p>
  );

  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border px-4">
        <Link to="/" aria-label="6degrees home"><Logo size="sm" /></Link>
        <nav aria-label="Views" className="flex gap-1">
          <Button size="sm" variant={view === "graph" ? "secondary" : "ghost"} aria-current={view === "graph" ? "page" : undefined} onClick={() => update({ view: null })}>
            <Network className="mr-1.5 h-4 w-4" aria-hidden="true" /> Explore graph
          </Button>
          <Button size="sm" variant={view === "people" ? "secondary" : "ghost"} aria-current={view === "people" ? "page" : undefined} onClick={() => update({ view: "people", topic: params.get("topic") ?? demo?.label ?? "" })}>
            <Users className="mr-1.5 h-4 w-4" aria-hidden="true" /> Find My People
          </Button>
        </nav>
      </header>
      <DataBanner index={index} isMock={isMock} />

      {view === "people" ? (
        <div className="grid min-h-0 flex-1 lg:grid-cols-[1fr_400px]">
          <main className="min-h-0 overflow-auto" data-lenis-prevent>
            <FindMyPeople
              index={index}
              query={params.get("topic") ?? demo?.label ?? ""}
              onQueryChange={(q) => update({ topic: q })}
              onSelect={select}
              onOpenInGraph={focus}
            />
          </main>
          <aside aria-label="Details" className="min-h-0 overflow-auto border-l border-border" data-lenis-prevent>{detail}</aside>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-rows-[auto_60vh_auto] lg:grid-rows-1 lg:grid-cols-[300px_1fr_400px]">
          <aside aria-label="Search and filters" className="min-h-0 overflow-auto border-r border-border p-4" data-lenis-prevent>
            <SearchBox index={index} onPick={focus} />
            <div className="mt-5">
              <FilterPanel index={index} filters={filters} onChange={setFilters} />
            </div>
          </aside>

          <main className="flex min-h-0 flex-col">
            <Tabs value={canvasTab} onValueChange={setCanvasTab} className="flex min-h-0 flex-1 flex-col">
              <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
                <TabsList>
                  <TabsTrigger value="graph"><Network className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />Graph</TabsTrigger>
                  <TabsTrigger value="list"><List className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />List</TabsTrigger>
                </TabsList>
                <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground" aria-live="polite">
                  {focusNode && (
                    <>
                      Focus: <span className="font-semibold text-foreground">{focusNode.label}</span> · {focusShown} of {focusTotal} neighbors
                      {focusTotal > focusShown && " (most connected first)"} · {nodeIds.length} nodes, {edges.length} connections
                    </>
                  )}
                </p>
                <Button size="sm" variant="outline" className="h-8" disabled={selection?.kind !== "node"} onClick={() => selection && expand(selection.id)}>
                  <Expand className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Expand selected
                </Button>
                <Button size="sm" variant="ghost" className="h-8" onClick={() => { setExpanded([]); setPinned([]); }}>
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Reset view
                </Button>
              </div>
              <TabsContent value="graph" className="relative mt-0 min-h-0 flex-1 data-[state=inactive]:hidden" forceMount>
                <GraphCanvas index={index} nodeIds={nodeIds} edges={edges} focusId={focusId} selection={selection} onSelect={select} onExpand={expand} />
                <Legend types={presentTypes} />
              </TabsContent>
              <TabsContent value="list" className="mt-0 min-h-0 flex-1">
                <NeighborhoodList index={index} nodeIds={nodeIds} edges={edges} selection={selection} onSelect={select} />
              </TabsContent>
            </Tabs>
          </main>

          <aside aria-label="Details" className="min-h-0 overflow-auto border-l border-border" data-lenis-prevent>{detail}</aside>
        </div>
      )}
    </>
  );
}

function Legend({ types }: { types: readonly (typeof NODE_TYPES)[number][] }) {
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg border border-border bg-background/90 p-2 text-[11px] shadow-sm">
      <ul className="flex flex-wrap gap-x-3 gap-y-1">
        {types.map((t) => (
          <li key={t} className="flex items-center gap-1"><NodeTypeGlyph type={t} />{NODE_TYPE_LABEL[t].one}</li>
        ))}
      </ul>
      <ul className="mt-1 flex flex-wrap gap-x-3 text-muted-foreground">
        <li className="flex items-center gap-1"><span className={cn("inline-block w-5 border-t-2 border-solid border-foreground/50")} />high</li>
        <li className="flex items-center gap-1"><span className="inline-block w-5 border-t-2 border-dashed border-foreground/50" />medium</li>
        <li className="flex items-center gap-1"><span className="inline-block w-5 border-t-2 border-dotted border-destructive" />low</li>
        <li>Double-click a node to expand</li>
      </ul>
    </div>
  );
}
