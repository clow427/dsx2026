#!/usr/bin/env node
// Copies the best available graph file into frontend/public/data/ so Vite serves it.
//
// Preference order (frontend-explorer Requirement 1.1):
//   1. data/graph.json               merged graph (P2 merge step)
//   2. data/modules/research.json    INTERIM: research module only, until the merge exists
// The mock file is always copied too, so loadGraph can fall back to it.
//
// The JSON is re-serialized without indentation to cut transfer size. Content is not changed.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const outDir = resolve(here, "..", "public", "data");

const candidates = [
  join(repoRoot, "data", "graph.json"),
  join(repoRoot, "data", "modules", "research.json"),
];
const mock = join(repoRoot, "data", "mock", "graph.sample.json");

function copyMinified(src, dest) {
  const doc = JSON.parse(readFileSync(src, "utf8"));
  writeFileSync(dest, JSON.stringify(doc));
  return doc;
}

mkdirSync(outDir, { recursive: true });

if (existsSync(mock)) {
  copyMinified(mock, join(outDir, "graph.sample.json"));
} else {
  console.warn(`[sync-graph] mock file not found: ${relative(repoRoot, mock)}`);
}

const graphOut = join(outDir, "graph.json");
const src = candidates.find((p) => existsSync(p));
if (src) {
  const doc = copyMinified(src, graphOut);
  console.log(
    `[sync-graph] ${relative(repoRoot, src)} -> public/data/graph.json ` +
      `(producer=${doc.producer}, ${doc.nodes?.length ?? 0} nodes, ${doc.edges?.length ?? 0} edges)`,
  );
} else {
  // No real data: remove any stale copy so the app falls back to the mock and shows the banner.
  rmSync(graphOut, { force: true });
  console.warn("[sync-graph] no real graph found; the app will use the mock data");
}
