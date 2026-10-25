import { useMemo, useState } from "react";
import { BookOpen, ExternalLink, Hash, Landmark, X } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/graphLabels";
import { search, type GraphIndex } from "@/data/graphIndex";
import { degreeLine, statusOf, STATUS_RANK, type LinkKind, type LinkRecord, type PeopleIndex } from "@/data/people";
import type { BuStatus, GraphNode } from "@/types/graph";

// Building blocks for the people views, in the landing page's visual language:
// initials avatars tinted by BU status, rounded cards, small uppercase labels.

export const STATUS_TINT: Record<BuStatus, string> = {
  verified_alumnus: "bg-success/15 text-success",
  bu_affiliated_researcher: "bg-primary/10 text-primary",
  unverified: "bg-muted text-muted-foreground",
  ambiguous: "bg-warning/15 text-warning",
};

/** Canvas colors for the same statuses (Cytoscape can't read CSS variables). */
export const STATUS_COLOR: Record<BuStatus, string> = {
  verified_alumnus: "hsl(172, 50%, 40%)",
  bu_affiliated_researcher: "hsl(340, 75%, 58%)",
  unverified: "hsl(240, 8%, 74%)",
  ambiguous: "hsl(38, 80%, 55%)",
};

export const STATUS_SHORT: Record<BuStatus, string> = {
  verified_alumnus: "BU alumni",
  bu_affiliated_researcher: "BU researchers",
  unverified: "Other collaborators",
  ambiguous: "Ambiguous identity",
};

export const KIND_LABEL: Record<LinkKind, string> = {
  paper: "Co-authored",
  grant: "Shared NIH grant",
  funded: "Grant funded their paper",
};

const SIZES = { xs: "h-7 w-7 text-[10px]", sm: "h-9 w-9 text-xs", md: "h-12 w-12 text-sm", lg: "h-16 w-16 text-xl", xl: "h-20 w-20 text-2xl" };

export function PersonAvatar({ person, size = "md", className }: { person: GraphNode; size?: keyof typeof SIZES; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-display font-bold", SIZES[size], STATUS_TINT[statusOf(person)], className)}
    >
      {initials(person.label) || person.label.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("block text-[11px] font-bold uppercase tracking-[0.2em] text-primary", className)}>{children}</span>;
}

function topicPapers(index: GraphIndex, id: string): number {
  return (index.edgesByNode.get(id) ?? []).filter((e) => e.type === "HAS_TOPIC").length;
}

export function TopicIcon({ size = "md" }: { size?: keyof typeof SIZES }) {
  return (
    <span aria-hidden="true" className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground", SIZES[size])}>
      <Hash className="h-[45%] w-[45%]" />
    </span>
  );
}

/** People search (optionally topics too). Shows the pick as a chip with a clear button. */
export function PersonPicker({
  index,
  pidx,
  value,
  onChange,
  placeholder = "Search for a person…",
  label,
  autoFocus,
  includeTopics = false,
}: {
  index: GraphIndex;
  pidx: PeopleIndex;
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
  label: string;
  autoFocus?: boolean;
  /** Also offer topics (picking one shows the people working on it). */
  includeTopics?: boolean;
}) {
  const [query, setQuery] = useState("");
  const { results, topics } = useMemo(() => {
    const groups = search(index, query, 200);
    const people = (groups.find((g) => g.type === "person")?.results ?? [])
      .map((p) => ({ p, links: pidx.adjacency.get(p.id)?.size ?? 0 }))
      .sort((a, b) => STATUS_RANK[statusOf(a.p)] - STATUS_RANK[statusOf(b.p)] || b.links - a.links)
      .slice(0, includeTopics ? 6 : 10);
    const topicHits = includeTopics
      ? (groups.find((g) => g.type === "topic")?.results ?? [])
          .map((t) => ({ t, papers: topicPapers(index, t.id) }))
          .filter((x) => x.papers > 0)
          .sort((a, b) => b.papers - a.papers)
          .slice(0, 6)
      : [];
    return { results: people, topics: topicHits };
  }, [index, pidx, query, includeTopics]);
  const picked = value ? index.nodes.get(value) : undefined;

  if (picked?.type === "topic") {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm">
        <TopicIcon size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{picked.label}</p>
          <p className="truncate text-xs text-muted-foreground">Topic · {topicPapers(index, picked.id)} papers</p>
        </div>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Clear ${label}`}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  if (picked) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm">
        <PersonAvatar person={picked} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{picked.label}</p>
          <p className="truncate text-xs text-muted-foreground">{degreeLine(picked) ?? STATUS_SHORT[statusOf(picked)].replace(/s$/, "")}</p>
        </div>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Clear ${label}`}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <Command shouldFilter={false} className="h-auto overflow-visible rounded-2xl border border-border bg-card shadow-sm" label={label}>
      <CommandInput value={query} onValueChange={setQuery} placeholder={placeholder} autoFocus={autoFocus} aria-label={label} />
      {query.trim() && (
        <CommandList className="max-h-[320px]">
          <CommandEmpty>No {includeTopics ? "people or topics" : "people"} match “{query.trim()}”.</CommandEmpty>
          {topics.length > 0 && (
            <CommandGroup heading="Topics (see the people working on them)">
              {topics.map(({ t, papers }) => (
                <CommandItem
                  key={t.id}
                  value={t.id}
                  onSelect={() => {
                    onChange(t.id);
                    setQuery("");
                  }}
                  className="gap-2.5"
                >
                  <TopicIcon size="xs" />
                  <span className="min-w-0 flex-1 truncate">{t.label}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{papers} papers</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          <CommandGroup heading="People (BU alumni first)">
            {results.map(({ p, links }) => (
              <CommandItem
                key={p.id}
                value={p.id}
                onSelect={() => {
                  onChange(p.id);
                  setQuery("");
                }}
                className="gap-2.5"
              >
                <PersonAvatar person={p} size="xs" />
                <span className="min-w-0 flex-1 truncate">{p.label}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">{links} link{links === 1 ? "" : "s"}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      )}
    </Command>
  );
}

function recordYear(n: GraphNode): number | null {
  const a = n.attributes ?? {};
  if (typeof a.year === "number") return a.year;
  if (typeof a.fiscal_year === "number") return a.fiscal_year;
  return null;
}

/** One record (paper or grant) with its year and a link to the source record. */
export function RecordRow({ record, kind, className }: { record: GraphNode; kind?: LinkKind | "authored" | "award"; className?: string }) {
  const source = record.sources[0];
  const isAward = record.type === "award";
  const Icon = isAward ? Landmark : BookOpen;
  const year = recordYear(record);
  return (
    <div className={cn("flex gap-3 rounded-xl p-2.5 hover:bg-muted/60", className)}>
      <span className={cn("mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full", isAward ? "bg-warning/15 text-warning" : "bg-primary/10 text-primary")}>
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug text-foreground line-clamp-2">{record.label}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          {kind && kind in KIND_LABEL && <span className="font-semibold text-foreground/70">{KIND_LABEL[kind as LinkKind]}</span>}
          {isAward && typeof record.attributes?.award_number === "string" && <span>NIH {record.attributes.award_number as string}</span>}
          {year && <span>{year}</span>}
          {source && (
            <a href={source.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
              Source <ExternalLink className="h-3 w-3" aria-hidden="true" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          )}
        </p>
      </div>
    </div>
  );
}

/** Records behind a link, newest first. */
export function sortRecords(records: LinkRecord[]): LinkRecord[] {
  return [...records].sort((a, b) => (recordYear(b.record) ?? 0) - (recordYear(a.record) ?? 0) || (a.record.label < b.record.label ? -1 : 1));
}
