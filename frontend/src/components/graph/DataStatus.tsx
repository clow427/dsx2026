import type { ReactNode } from "react";
import { AlertTriangle, Loader2, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGraph } from "@/data/GraphContext";
import type { GraphIndex } from "@/data/graphIndex";

/**
 * Requirement 1.1: a visible "Mock data" badge whenever the mock is in use.
 * Also labels partial data (a single module's output rather than the merged graph),
 * so nobody mistakes an interim build for the full network.
 */
export function DataBanner({ index, isMock }: { index: GraphIndex; isMock: boolean }) {
  const { producer, generated_at } = index.doc;
  if (isMock) {
    return (
      <div role="status" className="flex items-center gap-2 bg-warning/15 border-b border-warning/40 px-4 py-1.5 text-xs font-semibold text-[hsl(38,80%,28%)]">
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="rounded bg-warning px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-white">Mock data</span>
        Fictional people and records with example.org links. Real data has not been loaded.
      </div>
    );
  }
  if (producer !== "merge") {
    return (
      <div role="status" className="flex items-center gap-2 bg-muted border-b border-border px-4 py-1.5 text-xs text-muted-foreground">
        <span className="rounded bg-foreground/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-background">Partial data</span>
        Showing the <strong className="font-semibold text-foreground">{producer}</strong> module only (generated {generated_at.slice(0, 10)}). Identities are not yet merged, and patent and funding records are not included yet.
      </div>
    );
  }
  return null;
}

/** Requirement 1.2 / 8.1: loading and error states instead of a blank screen. */
export function GraphGate({ children }: { children: (ready: { index: GraphIndex; isMock: boolean }) => ReactNode }) {
  const { state, retry } = useGraph();
  if (state.status === "loading") {
    return (
      <div role="status" aria-live="polite" className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
        Loading the network…
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div role="alert" className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
        <AlertTriangle className="h-8 w-8 text-destructive" aria-hidden="true" />
        <h2 className="font-display text-2xl font-bold">The graph could not be loaded</h2>
        <p className="text-sm text-muted-foreground">{state.message}</p>
        {state.problems.length > 0 && (
          <ul className="max-h-48 w-full overflow-auto rounded-lg bg-muted p-3 text-left font-mono text-xs">
            {state.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        <Button onClick={retry} variant="outline">
          <RotateCw className="mr-2 h-4 w-4" aria-hidden="true" /> Try again
        </Button>
      </div>
    );
  }
  return <>{children({ index: state.index, isMock: state.isMock })}</>;
}
