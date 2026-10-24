import { useMemo, useState } from "react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { NodeTypeGlyph } from "@/components/graph/badges";
import { NODE_TYPE_LABEL } from "@/lib/graphLabels";
import { defaultTopic, search, type GraphIndex } from "@/data/graphIndex";

// Requirement 2: match labels across every node type, group by type, empty state suggests the demo topic.

export function SearchBox({ index, onPick, autoFocus = false }: { index: GraphIndex; onPick: (id: string) => void; autoFocus?: boolean }) {
  const [query, setQuery] = useState("");
  const groups = useMemo(() => search(index, query), [index, query]);
  const demo = useMemo(() => defaultTopic(index), [index]);

  const pick = (id: string) => {
    onPick(id);
    setQuery("");
  };

  return (
    <Command shouldFilter={false} className="h-auto rounded-lg border border-border bg-card overflow-visible" label="Search the network">
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder="Search people, topics, papers, organizations…"
        autoFocus={autoFocus}
        aria-label="Search people, topics, papers, organizations"
      />
      {query.trim() && (
        <CommandList className="max-h-[360px]">
          <CommandEmpty>
            <p>No matches for “{query.trim()}”.</p>
            {demo && (
              <button type="button" className="mt-2 text-primary underline-offset-2 hover:underline" onClick={() => pick(demo.id)}>
                Try the demo topic: {demo.label}
              </button>
            )}
          </CommandEmpty>
          {groups.map((g) => (
            <CommandGroup key={g.type} heading={`${NODE_TYPE_LABEL[g.type].many} (${g.total}${g.total > g.results.length ? `, top ${g.results.length}` : ""})`}>
              {g.results.map((n) => (
                <CommandItem key={n.id} value={n.id} onSelect={() => pick(n.id)} className="gap-2">
                  <NodeTypeGlyph type={n.type} />
                  <span className="truncate">{n.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      )}
    </Command>
  );
}
