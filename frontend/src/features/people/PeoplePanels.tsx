import { useMemo, useState } from "react";
import { ArrowRight, Crosshair, ExternalLink, GraduationCap, Route, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AffiliationBadge, SourceLink } from "@/components/graph/badges";
import type { GraphIndex } from "@/data/graphIndex";
import {
  degreeLine,
  describeLink,
  personRecords,
  rankNeighbors,
  statusOf,
  type LinkKind,
  type PeopleIndex,
} from "@/data/people";
import type { RankedPerson } from "@/data/findMyPeople";
import type { GraphNode } from "@/types/graph";
import { Eyebrow, PersonAvatar, RecordRow, sortRecords, STATUS_SHORT, TopicIcon } from "./shared";

interface PersonPanelProps {
  index: GraphIndex;
  pidx: PeopleIndex;
  personId: string;
  isFocus: boolean;
  kinds?: ReadonlySet<LinkKind>;
  onSelectPerson: (id: string) => void;
  onFocus: (id: string) => void;
  onExpand: (id: string) => void;
  onConnect: (id: string) => void;
  /** When a topic is centered: the topic and this person's papers on it. */
  topicWork?: { topic: GraphNode; records: GraphNode[] };
}

export function PersonPanel({ index, pidx, personId, isFocus, kinds, onSelectPerson, onFocus, onExpand, onConnect, topicWork }: PersonPanelProps) {
  const person = index.nodes.get(personId);
  const neighbors = useMemo(() => rankNeighbors(index, pidx, personId, { kinds }), [index, pidx, personId, kinds]);
  const records = useMemo(() => personRecords(index, personId), [index, personId]);
  const [showAll, setShowAll] = useState(false);
  if (!person) return null;
  const status = statusOf(person);
  const degree = degreeLine(person);
  const orcid = typeof person.attributes?.orcid === "string" ? (person.attributes.orcid as string) : null;
  const papers = records.filter((r) => r.record.type === "publication").length;
  const grants = records.filter((r) => r.record.type === "award").length;
  const alumni = neighbors.filter((n) => n.status === "verified_alumnus").length;
  const shown = showAll ? neighbors : neighbors.slice(0, 8);

  return (
    <div className="space-y-6 p-5">
      <section className="rounded-3xl bg-card p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <PersonAvatar person={person} size="lg" />
          <div className="min-w-0 flex-1">
            <AffiliationBadge status={status} />
            <h2 className="mt-2 font-display text-2xl font-bold leading-tight tracking-[-0.02em] text-foreground">{person.label}</h2>
            {degree && (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-foreground/80">
                <GraduationCap className="h-4 w-4 text-success" aria-hidden="true" /> {degree}
              </p>
            )}
            {orcid && (
              <a href={`https://orcid.org/${orcid}`} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                ORCID {orcid} <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            )}
          </div>
        </div>
        <dl className="mt-5 grid grid-cols-3 gap-2 text-center">
          {[
            [neighbors.length, "Connections"],
            [papers, papers === 1 ? "Paper" : "Papers"],
            [grants, grants === 1 ? "NIH grant" : "NIH grants"],
          ].map(([n, label]) => (
            <div key={label} className="rounded-2xl bg-muted/60 px-2 py-3">
              <dd className="font-display text-xl font-bold text-foreground">{n}</dd>
              <dt className="text-[11px] font-semibold text-muted-foreground">{label}</dt>
            </div>
          ))}
        </dl>
        <div className="mt-5 flex flex-wrap gap-2">
          {!isFocus && (
            <Button size="sm" className="rounded-full" onClick={() => onFocus(personId)}>
              <Crosshair className="mr-1.5 h-4 w-4" aria-hidden="true" /> Center on {person.label.split(" ")[0]}
            </Button>
          )}
          <Button size="sm" variant={isFocus ? "default" : "outline"} className="rounded-full" onClick={() => onExpand(personId)}>
            <UsersRound className="mr-1.5 h-4 w-4" aria-hidden="true" /> Show their network
          </Button>
          <Button size="sm" variant="outline" className="rounded-full" onClick={() => onConnect(personId)}>
            <Route className="mr-1.5 h-4 w-4" aria-hidden="true" /> Find a connection
          </Button>
        </div>
      </section>

      {topicWork && topicWork.records.length > 0 && (
        <section>
          <Eyebrow>On {topicWork.topic.label}</Eyebrow>
          <div className="mt-2 space-y-0.5">
            {topicWork.records.slice(0, 5).map((r) => (
              <RecordRow key={r.id} record={r} />
            ))}
          </div>
          {topicWork.records.length > 5 && <p className="mt-1 px-2.5 text-xs text-muted-foreground">+{topicWork.records.length - 5} more</p>}
        </section>
      )}

      <section>
        <Eyebrow>Connections</Eyebrow>
        <h3 className="mt-1 font-display text-lg font-semibold text-foreground">
          {neighbors.length ? `${alumni} BU alumni among ${neighbors.length}` : "No connections in the graph yet"}
        </h3>
        <p className="text-xs text-muted-foreground">BU alumni first, then BU researchers, then strongest connection.</p>
        <ul className="mt-3 space-y-1">
          {shown.map((n) => (
            <li key={n.person.id}>
              <button
                type="button"
                onClick={() => onSelectPerson(n.person.id)}
                className="group flex w-full items-center gap-3 rounded-2xl p-2 text-left hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <PersonAvatar person={n.person} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground group-hover:text-primary">{n.person.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {STATUS_SHORT[n.status].replace(/s$/, "").replace(/^Other collaborator$/, "Collaborator")} · {n.reason}
                  </span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
        {neighbors.length > 8 && (
          <Button size="sm" variant="ghost" className="mt-1 rounded-full text-primary" onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Show fewer" : `Show all ${neighbors.length}`}
          </Button>
        )}
      </section>

      {records.length > 0 && (
        <section>
          <Eyebrow>Work in the graph</Eyebrow>
          <div className="mt-2 space-y-0.5">
            {records.slice(0, 6).map((r) => (
              <RecordRow key={r.record.id} record={r.record} />
            ))}
          </div>
          {records.length > 6 && <p className="mt-1 px-2.5 text-xs text-muted-foreground">+{records.length - 6} more in the All records view</p>}
        </section>
      )}

      {person.bu_affiliation && person.bu_affiliation.evidence.length > 0 && (
        <section>
          <Eyebrow>Why this BU status</Eyebrow>
          <ul className="mt-2 space-y-2">
            {person.bu_affiliation.evidence.slice(0, 4).map((ref, i) => (
              <li key={`${ref.url}-${i}`}>
                <SourceLink source={ref} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

interface LinkPanelProps {
  index: GraphIndex;
  pidx: PeopleIndex;
  linkId: string;
  kinds?: ReadonlySet<LinkKind>;
  onSelectPerson: (id: string) => void;
}

export function LinkPanel({ index, pidx, linkId, kinds, onSelectPerson }: LinkPanelProps) {
  const link = pidx.links.get(linkId);
  if (!link) return null;
  const a = index.nodes.get(link.a)!;
  const b = index.nodes.get(link.b)!;
  const records = sortRecords(kinds ? link.records.filter((r) => kinds.has(r.kind)) : link.records);
  return (
    <div className="space-y-6 p-5">
      <section className="rounded-3xl bg-card p-6 shadow-sm">
        <Eyebrow>Connection</Eyebrow>
        <div className="mt-4 flex items-center">
          <PersonAvatar person={a} size="lg" className="ring-4 ring-card" />
          <PersonAvatar person={b} size="lg" className="-ml-4 ring-4 ring-card" />
        </div>
        <h2 className="mt-4 font-display text-xl font-bold leading-tight tracking-[-0.02em] text-foreground">
          <button type="button" className="hover:text-primary" onClick={() => onSelectPerson(a.id)}>{a.label}</button>
          <span className="text-muted-foreground"> &amp; </span>
          <button type="button" className="hover:text-primary" onClick={() => onSelectPerson(b.id)}>{b.label}</button>
        </h2>
        <p className="mt-1 text-sm font-semibold text-primary">{describeLink({ ...link, records })}</p>
        <p className="mt-2 text-xs text-muted-foreground">Every connection comes from a public record. Open a source to see it.</p>
      </section>
      <section>
        <Eyebrow>The records behind it</Eyebrow>
        <div className="mt-2 space-y-0.5">
          {records.map((r) => (
            <RecordRow key={`${r.kind}-${r.record.id}`} record={r.record} kind={r.kind} />
          ))}
        </div>
      </section>
    </div>
  );
}

interface TopicPanelProps {
  index: GraphIndex;
  topic: GraphNode;
  ranked: RankedPerson[];
  onSelectPerson: (id: string) => void;
}

/** Summary of the centered topic and its people, BU alumni first. */
export function TopicPanel({ index, topic, ranked, onSelectPerson }: TopicPanelProps) {
  const [showAll, setShowAll] = useState(false);
  const a = topic.attributes ?? {};
  const papers = (index.edgesByNode.get(topic.id) ?? []).filter((e) => e.type === "HAS_TOPIC").length;
  const alumni = ranked.filter((r) => r.status === "verified_alumnus").length;
  const bu = ranked.filter((r) => r.status === "bu_affiliated_researcher").length;
  const shown = showAll ? ranked : ranked.slice(0, 10);
  const path = [a.field, a.subfield].filter((x): x is string => typeof x === "string");
  return (
    <div className="space-y-6 p-5">
      <section className="rounded-3xl bg-card p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <TopicIcon size="lg" />
          <div className="min-w-0 flex-1">
            <Eyebrow>{path.length ? path.join(" · ") : "Topic"}</Eyebrow>
            <h2 className="mt-1.5 font-display text-2xl font-bold leading-tight tracking-[-0.02em] text-foreground">{topic.label}</h2>
          </div>
        </div>
        <dl className="mt-5 grid grid-cols-3 gap-2 text-center">
          {[
            [papers, "Papers"],
            [alumni, "BU alumni"],
            [bu, "BU researchers"],
          ].map(([n, label]) => (
            <div key={label} className="rounded-2xl bg-muted/60 px-2 py-3">
              <dd className="font-display text-xl font-bold text-foreground">{n}</dd>
              <dt className="text-[11px] font-semibold text-muted-foreground">{label}</dt>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-xs text-muted-foreground">Everyone here has at least one paper tagged with this topic. Click a person to see those papers.</p>
      </section>
      <section>
        <Eyebrow>People on this topic</Eyebrow>
        <p className="mt-1 text-xs text-muted-foreground">BU alumni first, then BU researchers, then most papers.</p>
        <ul className="mt-3 space-y-1">
          {shown.map((r) => (
            <li key={r.person.id}>
              <button
                type="button"
                onClick={() => onSelectPerson(r.person.id)}
                className="group flex w-full items-center gap-3 rounded-2xl p-2 text-left hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <PersonAvatar person={r.person} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground group-hover:text-primary">{r.person.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {STATUS_SHORT[r.status].replace(/s$/, "").replace(/^Other collaborator$/, "Collaborator")} · {r.contributions.length} paper
                    {r.contributions.length === 1 ? "" : "s"} on this topic
                  </span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
        {ranked.length > 10 && (
          <Button size="sm" variant="ghost" className="mt-1 rounded-full text-primary" onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Show fewer" : `Show all ${ranked.length}`}
          </Button>
        )}
      </section>
    </div>
  );
}
