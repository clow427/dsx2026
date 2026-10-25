import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Network, Route } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { AffiliationBadge } from "@/components/graph/badges";
import { cn } from "@/lib/utils";
import type { GraphIndex } from "@/data/graphIndex";
import { buildCategories } from "@/data/categories";
import { rankPeople } from "@/data/findMyPeople";
import { degreeLine, STATUS_RANK } from "@/data/people";
import type { BuStatus } from "@/types/graph";
import { Eyebrow, PersonAvatar } from "@/features/people/shared";

const BU: ReadonlySet<BuStatus> = new Set<BuStatus>(["verified_alumnus", "bu_affiliated_researcher"]);
const ALUMNI: ReadonlySet<BuStatus> = new Set<BuStatus>(["verified_alumnus"]);
const TOPICS_SHOWN = 12;

interface Props {
  index: GraphIndex;
  fieldName: string | null;
  topicId: string | null;
  onChange: (field: string | null, topic: string | null) => void;
  onOpenInNetwork: (id: string) => void;
  onConnect: (id: string) => void;
}

export function TopicBrowser({ index, fieldName, topicId, onChange, onOpenInNetwork, onConnect }: Props) {
  const fields = useMemo(() => buildCategories(index), [index]);
  const field = fields.find((f) => f.name === fieldName) ?? null;
  const [subfield, setSubfield] = useState<string | null>(null);
  const [alumniOnly, setAlumniOnly] = useState(false);
  const [allTopics, setAllTopics] = useState(false);
  const peopleRef = useRef<HTMLElement>(null);
  const topic = topicId ? index.nodes.get(topicId) : undefined;
  const people = useMemo(() => {
    if (!topic) return [];
    return rankPeople(index, [topic], { statuses: alumniOnly ? ALUMNI : BU })
      .sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || b.score - a.score)
      .slice(0, 24);
  }, [index, topic, alumniOnly]);
  const max = fields[0]?.records ?? 1;
  const topics = useMemo(
    () =>
      (field?.subfields ?? [])
        .filter((s) => !subfield || s.name === subfield)
        .flatMap((s) => s.topics)
        .sort((a, b) => b.records - a.records || (a.topic.label < b.topic.label ? -1 : 1)),
    [field, subfield],
  );
  const shownTopics = allTopics ? topics : topics.slice(0, TOPICS_SHOWN);

  // Picking a topic brings its people into view (they sit below the topic grid).
  useEffect(() => {
    if (topicId) peopleRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [topicId]);

  return (
    <div className="relative min-h-0 flex-1 overflow-auto" data-lenis-prevent>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[460px] bg-[radial-gradient(ellipse_at_50%_0%,hsl(340_75%_92%/_0.7)_0%,hsl(340_75%_96%/_0.35)_35%,transparent_70%)]" aria-hidden="true" />
      <div className="relative mx-auto max-w-6xl px-6 py-14">
        {!field ? (
          <>
            <div className="max-w-2xl">
              <Eyebrow>Browse by research area</Eyebrow>
              <h1 className="mt-3 font-display text-4xl font-bold leading-[1.02] tracking-[-0.035em] text-foreground sm:text-5xl">What do you want to work on?</h1>
              <p className="mt-4 text-lg text-muted-foreground">Pick a field to see its topics and the BU people working on them. Counts are papers in the graph.</p>
            </div>
            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {fields.map((f, i) => (
                <motion.button
                  key={f.name}
                  type="button"
                  onClick={() => { setSubfield(null); onChange(f.name, null); }}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: i * 0.04, ease: [0.22, 1, 0.36, 1] }}
                  whileHover={{ y: -6 }}
                  className="group rounded-3xl bg-card p-6 text-left shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {f.domain && <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">{f.domain}</span>}
                  <h2 className="mt-1 font-display text-xl font-semibold tracking-[-0.01em] text-foreground group-hover:text-primary">{f.name}</h2>
                  <div className="mt-4 h-1.5 rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(4, (f.records / max) * 100)}%` }} />
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">
                    {f.records} papers · {f.subfields.length} subfield{f.subfields.length === 1 ? "" : "s"}
                  </p>
                  <p className="mt-2 line-clamp-2 text-xs text-foreground/70">{f.subfields.slice(0, 3).map((s) => s.name).join(" · ")}</p>
                </motion.button>
              ))}
            </div>
          </>
        ) : (
          <>
            <Button variant="ghost" size="sm" className="-ml-2 rounded-full" onClick={() => onChange(null, null)}>
              <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden="true" /> All research areas
            </Button>
            <div className="mt-4 max-w-2xl">
              <Eyebrow>{field.domain ?? "Research area"}</Eyebrow>
              <h1 className="mt-2 font-display text-4xl font-bold tracking-[-0.035em] text-foreground">{field.name}</h1>
            </div>
            <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Subfields">
              {[{ name: null as string | null, records: field.records }, ...field.subfields].map((s) => (
                <button
                  key={s.name ?? "all"}
                  type="button"
                  onClick={() => { setSubfield(s.name); setAllTopics(false); }}
                  aria-pressed={subfield === s.name}
                  className={cn(
                    "rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors",
                    subfield === s.name ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:border-primary/50",
                  )}
                >
                  {s.name ?? "All"} <span className={subfield === s.name ? "text-primary-foreground/80" : "text-muted-foreground"}>{s.records}</span>
                </button>
              ))}
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {shownTopics.map((t) => (
                  <button
                    key={t.topic.id}
                    type="button"
                    onClick={() => onChange(field.name, t.topic.id)}
                    aria-pressed={topicId === t.topic.id}
                    className={cn(
                      "rounded-2xl border bg-card p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      topicId === t.topic.id ? "border-primary ring-2 ring-primary/20" : "border-border",
                    )}
                  >
                    <p className="text-sm font-semibold leading-snug text-foreground">{t.topic.label}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{t.records} paper{t.records === 1 ? "" : "s"}</p>
                  </button>
                ))}
            </div>

            {topics.length > TOPICS_SHOWN && (
              <Button variant="ghost" size="sm" className="mt-3 rounded-full text-primary" onClick={() => setAllTopics((v) => !v)}>
                {allTopics ? "Show fewer topics" : `Show all ${topics.length} topics`}
              </Button>
            )}

            {topic && (
              <section ref={peopleRef} className="mt-14 scroll-mt-6" aria-live="polite">
                <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                  <div>
                    <Eyebrow>People in this topic</Eyebrow>
                    <h2 className="mt-2 font-display text-3xl font-bold tracking-[-0.03em] text-foreground">{topic.label}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">BU people with papers on this topic, alumni first.</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button className="rounded-full" onClick={() => onOpenInNetwork(topic.id)}>
                      <Network className="mr-1.5 h-4 w-4" aria-hidden="true" /> See them in the network
                    </Button>
                    <Switch id="topic-alumni" checked={alumniOnly} onCheckedChange={setAlumniOnly} />
                    <Label htmlFor="topic-alumni" className="text-sm">Verified alumni only</Label>
                  </div>
                </div>
                {people.length === 0 ? (
                  <p className="mt-6 rounded-2xl bg-card p-6 text-sm text-muted-foreground shadow-sm">
                    No {alumniOnly ? "verified alumni" : "BU people"} have papers on this topic in the graph yet.
                  </p>
                ) : (
                  <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                    {people.map((r, i) => (
                      <motion.div
                        key={r.person.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.45, delay: Math.min(i, 8) * 0.05, ease: [0.22, 1, 0.36, 1] }}
                        className="flex h-full flex-col rounded-3xl bg-card p-6 shadow-sm"
                      >
                        <PersonAvatar person={r.person} size="lg" />
                        <div className="mt-4"><AffiliationBadge status={r.status} /></div>
                        <h3 className="mt-2 font-display text-lg font-semibold tracking-[-0.01em] text-foreground">{r.person.label}</h3>
                        <p className="text-sm text-muted-foreground">{r.contributions.length} paper{r.contributions.length === 1 ? "" : "s"} on this topic</p>
                        {degreeLine(r.person) && <p className="mt-2 text-xs text-foreground/80">{degreeLine(r.person)}</p>}
                        <div className="mt-auto flex gap-2 pt-4">
                          <Button size="sm" className="flex-1 rounded-full" onClick={() => onOpenInNetwork(r.person.id)}>
                            <Network className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Network
                          </Button>
                          <Button size="sm" variant="outline" className="rounded-full" onClick={() => onConnect(r.person.id)} aria-label={`Find a connection to ${r.person.label}`}>
                            <Route className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
