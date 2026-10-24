import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { buildIndex, type GraphIndex } from "./graphIndex";
import { GraphShapeError, loadGraph, type LoadedGraph } from "./loadGraph";

export type GraphState =
  | { status: "loading" }
  | { status: "error"; message: string; problems: string[] }
  | { status: "ready"; index: GraphIndex; isMock: boolean; url: string };

interface GraphContextValue {
  state: GraphState;
  retry: () => void;
}

const GraphContext = createContext<GraphContextValue | null>(null);

/** Loads the graph once per page load and shares the index with every route. */
export function GraphProvider({ children, loader = loadGraph }: { children: ReactNode; loader?: () => Promise<LoadedGraph> }) {
  const [state, setState] = useState<GraphState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    loader()
      .then(({ doc, isMock, url }) => {
        if (!cancelled) setState({ status: "ready", index: buildIndex(doc), isMock, url });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const problems = err instanceof GraphShapeError ? err.problems : [];
        setState({ status: "error", message: err instanceof Error ? err.message : String(err), problems });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, loader]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  const value = useMemo(() => ({ state, retry }), [state, retry]);
  return <GraphContext.Provider value={value}>{children}</GraphContext.Provider>;
}

export function useGraph(): GraphContextValue {
  const ctx = useContext(GraphContext);
  if (!ctx) throw new Error("useGraph must be used inside <GraphProvider>");
  return ctx;
}
