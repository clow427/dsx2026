import type { GraphIndex } from "@/data/graphIndex";
import type { GraphNode } from "@/types/graph";

// Field -> subfield -> topic tree, read from the OpenAlex hierarchy that topic nodes carry
// in `attributes` (field, subfield, domain). Counts are records tagged with each topic.

export interface TopicEntry {
  topic: GraphNode;
  records: number;
}

export interface SubfieldEntry {
  name: string;
  records: number;
  topics: TopicEntry[];
}

export interface FieldEntry {
  name: string;
  domain?: string;
  records: number;
  subfields: SubfieldEntry[];
}

const OTHER = "Other";

export function buildCategories(index: GraphIndex): FieldEntry[] {
  const fields = new Map<string, { domain?: string; subs: Map<string, TopicEntry[]> }>();
  for (const topic of index.byType.topic) {
    const records = (index.edgesByNode.get(topic.id) ?? []).filter((e) => e.type === "HAS_TOPIC").length;
    if (!records) continue;
    const a = topic.attributes ?? {};
    const field = typeof a.field === "string" ? a.field : OTHER;
    const sub = typeof a.subfield === "string" ? a.subfield : OTHER;
    let f = fields.get(field);
    if (!f) fields.set(field, (f = { domain: typeof a.domain === "string" ? a.domain : undefined, subs: new Map() }));
    if (!f.subs.has(sub)) f.subs.set(sub, []);
    f.subs.get(sub)!.push({ topic, records });
  }
  const byCount = <T extends { records: number }>(x: T, y: T) => y.records - x.records;
  return [...fields.entries()]
    .map(([name, f]) => {
      const subfields = [...f.subs.entries()]
        .map(([sname, topics]) => ({
          name: sname,
          topics: topics.sort((x, y) => y.records - x.records || (x.topic.label < y.topic.label ? -1 : 1)),
          records: topics.reduce((s, t) => s + t.records, 0),
        }))
        .sort(byCount);
      return { name, domain: f.domain, subfields, records: subfields.reduce((s, x) => s + x.records, 0) };
    })
    .sort(byCount);
}
