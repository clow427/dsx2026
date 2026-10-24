import { useMemo, useState } from "react";
import { ExternalLink, Network, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { AffiliationBadge, ConfidenceBadge, NodeTypeGlyph } from "@/components/graph/badges";
import { initials, NODE_TYPE_LABEL, SOURCE_LABEL } from "@/lib/graphLabels";
import { AFFILIATION_BONUS, explain, rankPeople, resolveTopics, type RankedPerson } from "@/data/findMyPeople";
import { defaultTopic, type GraphIndex } from "@/data/graphIndex";
import type { BuStatus } from "@/types/graph";
import type { Selection } from "@/features/explorer/GraphCanvas";

// Requirement 7: ranked, evidence-backed list of people for a topic. Deterministic, no LLM.

const BU_LINKED: ReadonlySet<BuStatus> = new Set(["verified_alumnus", "bu_affiliated_researcher"]);
const PAGE = 20;

interface Props {
  index: GraphIndex;
  query: string;
  onQueryChange: (q: string) => void;
  onSelect: (sel: Selection) => void;
  onOpenInGraph: (id: string) => void;
}

export function FindMyPeople({ index, query, onQueryChange, onSelect, onOpenInGraph }: Props) {
  const demo = useMemo(() => defaultTopic(index), [index]);
  const [draft, setDraft] = useState(query);
  const [buOnly, setBuOnly] = useState(true);
  const [limit, setLimit] = useState(PAGE);

  const topics = useMemo(() => resolveTopics(index, query), [index, query]);
  const ranked = useMemo(() => rankPeople(index, topics, { statuses: buOnly ? BU_LINKED : undefined }), [index, topics, buOnly]);

  const submit = (q: string) => {
    setDraft(q);
    setLimit(PAGE);
    onQueryChange(q);
  };

  return (
    <div className="mx-auto max-w-4xl p-4 lg:p-6">
      <h1 className="font-display text-3xl font-bold tracking-tight">Find My People</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Enter a topic. People are ranked by the publications, patents, and awards that link them to it. Every result shows the records behind it.
      </p>

      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit(draft);
        }}
        role="search"
      >
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={demo ? `e.g. ${demo.label}` : "Topic"} aria-label="Topic" className="h-10" />
        <Button type="submit" className="h-10">
          <Search className="mr-1.5 h-4 w-4" aria-hidden="true" /> Rank people
        </Button>
      </form>
      <div className="mt-3 flex items-center gap-2">
        <Switch id="bu-only" checked={buOnly} onCheckedChange={(v) => { setBuOnly(v); setLimit(PAGE); }} />
        <Label htmlFor="bu-only" className="text-sm">
          Only BU-linked people (verified BU alumni or BU-affiliated researchers)
        </Label>
      </div>

      {query.trim() && (
        <div className="mt-4 text-sm" aria-live="polite">
          {topics.length ? (
            <p>
              <span className="text-muted-foreground">Matched {topics.length} topic{topics.length === 1 ? "" : "s"}: </span>
              {topics.map((t, i) => (
                <span key={t.id}>
                  {i > 0 && ", "}
                  <button type="button" className="font-semibold text-primary hover:underline" onClick={() => onSelect({ kind: "node", id: t.id })}>
                    {t.label}
                  </button>
                </span>
              ))}
              <span className="text-muted-foreground"> · {ranked.length.toLocaleString()} people</span>
            </p>
          ) : (
            <p className="text-muted-foreground">
              No topic matches “{query.trim()}”.{" "}
              {demo && (
                <button type="button" className="text-primary hover:underline" onClick={() => submit(demo.label)}>
                  Try {demo.label}
                </button>
              )}
            </p>
          )}
        </div>
      )}

      {topics.length > 0 && ranked.length === 0 && (
        <p className="mt-6 rounded-lg bg-muted p-4 text-sm text-muted-foreground">No people are linked to these topics{buOnly ? " with BU affiliation evidence" : ""}. {buOnly && "Turn off the BU-linked filter to see everyone."}</p>
      )}

      <ol className="mt-6 space-y-4">
        {ranked.slice(0, limit).map((r, i) => (
          <PersonResult key={r.person.id} rank={i + 1} result={r} onSelect={onSelect} onOpenInGraph={onOpenInGraph} />
        ))}
      </ol>
      {ranked.length > limit && (
        <Button variant="outline" className="mt-4 w-full" onClick={() => setLimit((l) => l + PAGE)}>
          Show {Math.min(PAGE, ranked.length - limit)} more
        </Button>
      )}

      <details className="mt-8 text-xs text-muted-foreground">
        <summary className="cursor-pointer font-semibold">How the score works</summary>
        <p className="mt-2">
          Each distinct record linked to the topic adds its edge weights multiplied together (high = 1, medium = 0.6, low = 0.2), using the person's
          authorship, inventorship, or award edge and the record's topic edge. Verified BU alumni get +{AFFILIATION_BONUS.verified_alumnus} and
          BU-affiliated researchers +{AFFILIATION_BONUS.bu_affiliated_researcher}. Ties are broken by node ID.
        </p>
      </details>
    </div>
  );
}

function PersonResult({ rank, result, onSelect, onOpenInGraph }: { rank: number; result: RankedPerson; onSelect: Props["onSelect"]; onOpenInGraph: Props["onOpenInGraph"] }) {
  const [open, setOpen] = useState(false);
  const { person, status, contributions, recordScore, bonus, score } = result;
  const shown = open ? contributions : contributions.slice(0, 3);
  const affSource = person.bu_affiliation?.evidence[0];
  return (
    <li className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="mt-1 w-6 text-right text-sm font-bold tabular-nums text-muted-foreground" aria-label={`Rank ${rank}`}>{rank}</span>
        <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 font-display text-sm font-bold text-primary">
          {initials(person.label)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="font-display text-lg font-semibold hover:text-primary hover:underline" onClick={() => onSelect({ kind: "node", id: person.id })}>
              {person.label}
            </button>
            <AffiliationBadge status={status} />
          </div>
          <p className="mt-1 text-sm">
            <span className="font-semibold">Why this person: </span>
            {explain(result)}
            {affSource && (
              <>
                {" "}BU affiliation per {SOURCE_LABEL[affSource.source]} record{" "}
                <a href={affSource.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  {affSource.record_id ?? "source"}
                </a>
                .
              </>
            )}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
            Score {score.toFixed(2)} = {recordScore.toFixed(2)} from {contributions.length} record{contributions.length === 1 ? "" : "s"}
            {bonus > 0 && ` + ${bonus} affiliation bonus`}
          </p>
          <ul className="mt-2 space-y-1">
            {shown.map((c) => {
              const link = c.record.sources[0];
              const y = c.record.attributes?.year;
              return (
                <li key={c.record.id} className="flex items-start gap-2 text-sm">
                  <NodeTypeGlyph type={c.record.type} className="mt-1" />
                  <span className="min-w-0 flex-1">
                    <a href={link.url} target="_blank" rel="noopener noreferrer" className="hover:text-primary hover:underline">
                      {c.record.label}
                      <ExternalLink className="ml-1 inline h-3 w-3" aria-hidden="true" />
                      <span className="sr-only"> ({NODE_TYPE_LABEL[c.record.type].one}, opens in a new tab)</span>
                    </a>
                    {typeof y === "number" && <span className="text-xs text-muted-foreground"> · {y}</span>}
                  </span>
                  <button type="button" className="shrink-0 text-[11px] font-semibold text-muted-foreground hover:text-foreground" onClick={() => onSelect({ kind: "edge", id: c.personEdge.id })}>
                    Evidence
                  </button>
                  {c.personEdge.confidence !== "high" && <ConfidenceBadge confidence={c.personEdge.confidence} />}
                </li>
              );
            })}
          </ul>
          <div className="mt-2 flex flex-wrap gap-2">
            {contributions.length > 3 && (
              <Button variant="link" size="sm" className="h-auto px-0 text-xs" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
                {open ? "Show fewer records" : `Show all ${contributions.length} records`}
              </Button>
            )}
            <Button variant="link" size="sm" className="h-auto px-0 text-xs" onClick={() => onOpenInGraph(person.id)}>
              <Network className="mr-1 h-3 w-3" aria-hidden="true" /> Open in graph
            </Button>
          </div>
        </div>
      </div>
    </li>
  );
}
