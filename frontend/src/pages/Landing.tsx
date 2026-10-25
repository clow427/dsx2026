import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Database, Network, FileSearch, Users } from "lucide-react";
import { AlumniGraph, type HeroLink, type HeroPerson } from "@/components/landing/AlumniGraph";
import { AffiliationBadge, NodeTypeGlyph } from "@/components/graph/badges";
import { DataBanner } from "@/components/graph/DataStatus";
import { useGraph } from "@/data/GraphContext";
import { defaultTopic, type GraphIndex } from "@/data/graphIndex";
import { rankPeople, type RankedPerson } from "@/data/findMyPeople";
import { initials, NODE_STYLE, SOURCE_LABEL } from "@/lib/graphLabels";
import type { BuStatus, GraphNode, SourceName } from "@/types/graph";

// Every person, count, and link on this page is read from the loaded graph.
// No hardcoded people, no photos (data-integrity.md: public professional information only).

const ROTATING_WORDS = ["discovery", "mentorship", "collaboration", "BU"];
const BU_LINKED: ReadonlySet<BuStatus> = new Set(["verified_alumnus", "bu_affiliated_researcher"]);
const HERO_PEOPLE = 14;

const STATUS_CAPTION: Record<BuStatus, string> = {
  verified_alumnus: "BU alumnus",
  bu_affiliated_researcher: "BU researcher",
  unverified: "Unverified",
  ambiguous: "Ambiguous",
};

const SOURCES: { source: SourceName; what: string; link: string; note?: string }[] = [
  { source: "openalex", what: "Institution-linked publications, authorships, affiliations and topics", link: "Authorship, co-authors" },
  { source: "semantic_scholar", what: "Paper metadata and citation counts, matched by DOI", link: "Citations" },
  { source: "bu_repository", what: "OpenBU dissertations and theses", link: "BU degrees" },
  { source: "institutional_bio", what: "Faculty, lab and department pages", link: "BU degrees, roles" },
  { source: "patentsview", what: "USPTO patent inventors and assignees", link: "Inventors, assignees" },
  { source: "nih_reporter", what: "NIH grants and principal investigators", link: "Awards, funding" },
  { source: "nsf_awards", what: "National Science Foundation research grants", link: "Awards, funding" },
  { source: "professional_profile", what: "Public profile URLs, found manually or submitted by the person", link: "Profile links", note: "Never scraped" },
];

const FEATURES = [
  { tag: "Ingest", title: "Pull from public sources", description: "Papers, patents, grants and bios from public APIs. Every record keeps its original ID and link.", icon: Database },
  { tag: "Graph", title: "See the living network", description: "Every shared paper, patent or grant becomes an edge between people, topics and organizations.", icon: Network },
  { tag: "Evidence", title: "Check every connection", description: "Click any edge to see the source records behind it, with a confidence label.", icon: FileSearch },
  { tag: "Find My People", title: "Find people to learn from", description: "Pick a topic and get a ranked list of BU-linked people, with the records that explain each pick.", icon: Users },
];

interface LandingData {
  index: GraphIndex;
  isMock: boolean;
  topic?: GraphNode;
  ranked: RankedPerson[];
  heroPeople: HeroPerson[];
  heroLinks: HeroLink[];
  sourceCounts: Map<SourceName, number>;
}

function buildLandingData(index: GraphIndex, isMock: boolean): LandingData {
  const topic = defaultTopic(index);
  const ranked = topic ? rankPeople(index, [topic], { statuses: BU_LINKED }) : [];
  const top = ranked.slice(0, HERO_PEOPLE);
  const ids = new Set(top.map((r) => r.person.id));
  const heroPeople: HeroPerson[] = top.map((r) => ({
    id: r.person.id,
    name: r.person.label,
    status: r.status,
    caption: STATUS_CAPTION[r.status],
    tooltipTitle: topic!.label,
    tooltip: `${r.contributions.length} linked publication${r.contributions.length === 1 ? "" : "s"} in the graph. Click to see the records.`,
  }));
  const heroLinks: HeroLink[] = [];
  for (const r of top) {
    for (const e of index.edgesByNode.get(r.person.id) ?? []) {
      if (e.type !== "COAUTHORED_WITH" || e.source !== r.person.id || !ids.has(e.target)) continue;
      heroLinks.push({ from: e.source, to: e.target, edgeId: e.id, label: `${e.evidence.length} shared paper${e.evidence.length === 1 ? "" : "s"}` });
    }
  }
  const sourceCounts = new Map<SourceName, number>();
  for (const n of index.doc.nodes) for (const s of new Set(n.sources.map((x) => x.source))) sourceCounts.set(s, (sourceCounts.get(s) ?? 0) + 1);
  return { index, isMock, topic, ranked, heroPeople, heroLinks, sourceCounts };
}

function mostCited(r: RankedPerson): GraphNode | undefined {
  const cites = (n: GraphNode) => (typeof n.attributes?.citation_count === "number" ? (n.attributes.citation_count as number) : -1);
  return [...r.contributions].map((c) => c.record).sort((a, b) => cites(b) - cites(a) || (a.id < b.id ? -1 : 1))[0];
}

const featureBg = [
  "bg-[hsl(340,75%,95%)]",
  "bg-[hsl(170,60%,92%)]",
  "bg-[hsl(45,90%,92%)]",
  "bg-[hsl(250,60%,94%)]",
];

function IllustrationSources({ data }: { data: LandingData }) {
  const chips = [...data.sourceCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  return (
    <div className="relative w-full h-full flex items-center justify-center p-6">
      <div className="grid grid-cols-2 gap-2.5 w-[85%]">
        {chips.map(([s, n], i) => (
          <div key={s} className="bg-white/80 rounded-xl shadow-sm px-3 py-2.5 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ["hsl(340,75%,58%)", "hsl(170,60%,45%)", "hsl(45,85%,50%)", "hsl(250,60%,65%)"][i % 4] }} />
            <span className="text-[11px] font-semibold text-foreground truncate">{SOURCE_LABEL[s]}</span>
            <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">{n.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function IllustrationGraph({ data }: { data: LandingData }) {
  const types = (Object.keys(NODE_STYLE) as (keyof typeof NODE_STYLE)[]).filter((t) => data.index.byType[t].length > 0);
  const pts = [
    { x: 50, y: 50 },
    { x: 20, y: 25 },
    { x: 80, y: 22 },
    { x: 18, y: 76 },
    { x: 82, y: 78 },
    { x: 50, y: 12 },
  ];
  return (
    <div className="relative w-full h-full">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full" aria-hidden="true">
        {pts.slice(1).map((p, i) => (
          <line key={i} x1={50} y1={50} x2={p.x} y2={p.y} stroke="hsl(170,60%,40%)" vectorEffect="non-scaling-stroke" style={{ strokeWidth: 2 }} />
        ))}
      </svg>
      {pts.slice(0, types.length).map((p, i) => (
        <div key={types[i]} className="absolute flex flex-col items-center gap-1" style={{ left: `${p.x}%`, top: `${p.y}%`, transform: "translate(-50%,-50%)" }}>
          <span className="rounded-full bg-white p-2 shadow-md">
            <NodeTypeGlyph type={types[i]} className={i === 0 ? "h-8 w-8" : "h-5 w-5"} />
          </span>
          <span className="rounded bg-white/90 px-1.5 text-[10px] font-semibold tabular-nums text-foreground">
            {data.index.byType[types[i]].length.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}

/** A real edge from the graph, shown with the record that supports it. */
function IllustrationEvidence({ data }: { data: LandingData }) {
  const link = data.heroLinks[0];
  const edge = link ? data.index.edges.get(link.edgeId) : undefined;
  if (!edge) return <div className="w-full h-full" />;
  const a = data.index.nodes.get(edge.source)!;
  const b = data.index.nodes.get(edge.target)!;
  const ev = edge.evidence[0];
  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center p-6 gap-3">
      <div className="flex items-center">
        {[a, b].map((p, i) => (
          <div key={p.id} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div className="w-14 h-14 rounded-full shadow-md border-[3px] border-white bg-primary/10 text-primary font-display font-bold flex items-center justify-center">{initials(p.label)}</div>
              <span className="text-[10px] font-semibold text-foreground max-w-[90px] truncate">{p.label}</span>
            </div>
            {i === 0 && (
              <div className="flex flex-col items-center mx-2 -mt-5">
                <span className="text-[8px] font-bold uppercase tracking-[0.12em] text-[hsl(45,80%,35%)] mb-1 whitespace-nowrap">Co-authored</span>
                <div className="w-14 h-[2px] bg-[hsl(45,80%,45%)]" />
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="bg-white/85 rounded-lg shadow-sm px-3 py-2 text-[10px] text-foreground w-[85%]">
        <p className="font-bold uppercase tracking-[0.12em] text-[9px] text-muted-foreground">Evidence · {edge.confidence} confidence</p>
        <p className="font-mono truncate">{SOURCE_LABEL[ev.source]} {ev.record_id}</p>
      </div>
    </div>
  );
}

function IllustrationPeople({ data }: { data: LandingData }) {
  const top = data.ranked.slice(0, 3);
  return (
    <div className="relative w-full h-full flex items-center justify-center p-6">
      <div className="w-[88%] bg-white/80 rounded-xl shadow-lg p-4 space-y-2.5">
        <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[hsl(250,50%,50%)] truncate">Find My People · {data.topic?.label}</p>
        {top.map((r, i) => (
          <div key={r.person.id} className="flex items-center gap-2.5">
            <span className="text-[10px] font-bold text-muted-foreground w-3">{i + 1}</span>
            <span className="w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-[11px] flex items-center justify-center">{initials(r.person.label)}</span>
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-foreground truncate">{r.person.label}</p>
              <p className="text-[10px] text-muted-foreground">{r.contributions.length} linked publications</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const ILLUSTRATIONS = [IllustrationSources, IllustrationGraph, IllustrationEvidence, IllustrationPeople];

const Landing = () => {
  const { state, retry } = useGraph();
  const data = useMemo(() => (state.status === "ready" ? buildLandingData(state.index, state.isMock) : null), [state]);

  const [wordIndex, setWordIndex] = useState(0);
  const [navVisible, setNavVisible] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => setWordIndex((p) => (p + 1) % ROTATING_WORDS.length), 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleScroll = () => setNavVisible(window.scrollY > 80);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const exploreHref = "/explore";
  const peopleHref = data?.topic ? `/explore?view=people&topic=${encodeURIComponent(data.topic.label)}` : "/explore?view=people";

  const headline = (size: "graph" | "stack") => (
    <motion.div
      className={`text-center mx-auto ${size === "graph" ? "max-w-[460px]" : "max-w-xl"}`}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7 }}
    >
      <div className="flex items-center justify-center mb-4">
        <Logo size={size === "graph" ? "md" : "lg"} />
      </div>
      <div className="inline-flex items-center gap-2 mb-5 bg-primary/10 text-primary px-3.5 py-1.5 rounded-full text-[10px] font-bold tracking-[0.18em] uppercase">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-75 animate-ping" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
        </span>
        Alumni network graph
      </div>
      <h1 className={`font-display font-bold tracking-[-0.035em] leading-[0.95] text-foreground mb-4 ${size === "graph" ? "text-4xl xl:text-5xl 2xl:text-6xl" : "text-5xl sm:text-6xl"}`}>
        Six degrees of{" "}
        <span className="inline-block relative">
          <AnimatePresence mode="wait">
            <motion.span
              key={ROTATING_WORDS[wordIndex]}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.35 }}
              className="text-primary inline-block italic"
            >
              {ROTATING_WORDS[wordIndex]}
            </motion.span>
          </AnimatePresence>
        </span>
      </h1>
      <p className={`text-muted-foreground mx-auto mb-6 leading-relaxed ${size === "graph" ? "text-sm xl:text-base max-w-[340px]" : "text-lg max-w-md"}`}>
        Boston University researchers and alumni, connected through the papers, patents and grants they share.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button size="lg" className={`font-semibold shadow-xl shadow-foreground/10 ${size === "graph" ? "h-12 px-7" : "h-14 px-9 text-base"}`} asChild>
          <Link to={exploreHref}>Explore the network <ArrowRight className="ml-2 w-4 h-4" /></Link>
        </Button>
        <Button size="lg" variant="outline" className={`font-semibold ${size === "graph" ? "h-12 px-5" : "h-14 px-7 text-base"}`} asChild>
          <Link to={peopleHref}>Find My People</Link>
        </Button>
        <Button size="lg" variant="ghost" className={`font-semibold ${size === "graph" ? "h-12 px-5" : "h-14 px-7 text-base"}`} asChild>
          <Link to="/chat">Ask 6degrees</Link>
        </Button>
      </div>
    </motion.div>
  );

  const heroGraph = (center?: React.ReactNode) =>
    data ? (
      <AlumniGraph people={data.heroPeople} links={data.heroLinks} center={center} />
    ) : (
      <div className="flex min-h-[420px] items-center justify-center">{center}</div>
    );

  const heroCaption = data?.topic
    ? `The ${data.heroPeople.length} most connected BU-linked people in “${data.topic.label}”, with links for shared papers. Hover or focus anyone; click to open their records.`
    : "";

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* Navbar — hidden until scroll */}
      <motion.nav
        className="fixed top-0 w-full z-50 bg-background/90 backdrop-blur-md"
        initial={{ y: -100 }}
        animate={{ y: navVisible ? 0 : -100 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between h-[72px] px-6 lg:px-8">
          <Link to="/"><Logo size="md" /></Link>
          <div className="flex items-center gap-3">
            <Button variant="ghost" className="hidden sm:inline-flex text-sm font-medium" asChild>
              <Link to="/chat">Ask 6degrees</Link>
            </Button>
            <Button variant="ghost" className="text-sm font-medium" asChild>
              <Link to={peopleHref}>Find My People</Link>
            </Button>
            <Button className="text-sm font-semibold" asChild>
              <Link to={exploreHref}>Explore</Link>
            </Button>
          </div>
        </div>
      </motion.nav>

      {data && <DataBanner index={data.index} isMock={data.isMock} />}
      {state.status === "error" && (
        <div role="alert" className="bg-destructive/10 border-b border-destructive/30 px-4 py-2 text-sm text-destructive">
          The graph could not be loaded: {state.message}{" "}
          <button type="button" className="underline" onClick={retry}>Try again</button>
        </div>
      )}

      {/* Hero — the network graph */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 -z-0 pointer-events-none" aria-hidden="true">
          <div className="mx-auto h-[720px] w-[120%] -translate-x-[10%] bg-[radial-gradient(ellipse_at_50%_0%,hsl(340_75%_92%/_0.85)_0%,hsl(340_75%_96%/_0.4)_35%,transparent_70%)]" />
        </div>

        {/* Desktop: headline sits in the middle of the graph */}
        <div className="hidden lg:block max-w-7xl mx-auto px-6 lg:px-8 pt-14 pb-16 relative">
          {heroGraph(headline("graph"))}
          <p className="text-center text-xs text-muted-foreground mt-6">{heroCaption}</p>
        </div>

        {/* Mobile / tablet: headline first, graph scrolls sideways */}
        <div className="lg:hidden relative pt-16 pb-12">
          <div className="px-6">{headline("stack")}</div>
          {data && (
            <div className="mt-12 overflow-x-auto scrollbar-none">
              <div className="min-w-[960px] px-6">{heroGraph()}</div>
            </div>
          )}
          <p className="text-center text-xs text-muted-foreground mt-4 px-6">{heroCaption}</p>
        </div>
      </section>

      {/* Featured people: the top of the Find My People ranking for the demo topic */}
      {data && data.ranked.length > 0 && (
        <section className="py-20 lg:py-28 bg-muted/40">
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between mb-12 gap-4">
              <div className="max-w-xl">
                <h2 className="text-3xl sm:text-5xl font-display font-bold text-foreground tracking-[-0.03em] leading-[1.05] mb-3">
                  People to learn from
                </h2>
                <p className="text-muted-foreground text-base lg:text-lg">
                  The top of the Find My People ranking for “{data.topic?.label}”. Each card links to the records behind it.
                </p>
              </div>
              <Link to={peopleHref} className="group inline-flex items-center gap-2 text-primary font-semibold text-sm self-start md:self-end">
                See the full ranking
                <span className="w-9 h-9 rounded-full bg-primary text-primary-foreground inline-flex items-center justify-center group-hover:translate-x-1 transition-transform">
                  <ArrowRight className="w-4 h-4" />
                </span>
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {data.ranked.slice(0, 4).map((r, i) => {
                const paper = mostCited(r);
                return (
                  <motion.div
                    key={r.person.id}
                    initial={{ opacity: 0, y: 24 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.2 }}
                    transition={{ duration: 0.55, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                    whileHover={{ y: -6 }}
                  >
                    <Link to={`/explore?node=${encodeURIComponent(r.person.id)}`} className="group block rounded-3xl bg-card p-6 shadow-sm h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <div className="flex items-center justify-between mb-5">
                        <span className="w-16 h-16 rounded-full bg-primary/10 text-primary font-display font-bold text-xl flex items-center justify-center" aria-hidden="true">
                          {initials(r.person.label)}
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">#{i + 1}</span>
                      </div>
                      <AffiliationBadge status={r.status} />
                      <h3 className="mt-2 font-display font-semibold text-lg text-foreground group-hover:text-primary transition-colors tracking-[-0.01em]">{r.person.label}</h3>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {r.contributions.length} linked publication{r.contributions.length === 1 ? "" : "s"}
                      </p>
                      {paper && <p className="mt-3 text-xs text-foreground/80 line-clamp-3">Most cited: {paper.label}</p>}
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Features */}
      <section id="features" className="py-24 lg:py-32 relative overflow-hidden">
        <div className="absolute inset-0 -z-0 pointer-events-none" aria-hidden="true">
          <div className="absolute top-1/2 left-0 -translate-y-1/2 w-[480px] h-[480px] rounded-full bg-primary/5 blur-[120px]" />
          <div className="absolute top-1/4 right-0 w-[420px] h-[420px] rounded-full bg-primary/5 blur-[120px]" />
        </div>
        <div className="max-w-6xl mx-auto px-6 lg:px-8 relative">
          <motion.div
            className="text-center mb-16 max-w-2xl mx-auto"
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <span className="inline-block text-[11px] font-bold tracking-[0.2em] uppercase text-primary mb-4">How it works</span>
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-display font-bold mb-5 text-foreground tracking-[-0.035em] leading-[1.02]">
              Connect the dots
              <br />
              across BU research
            </h2>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto">
              Public records already describe who worked with whom. 6degrees turns them into a map.
            </p>
          </motion.div>

          {(() => {
            const bodyTones = [
              "bg-foreground text-background",
              "bg-primary/10 text-foreground",
              "bg-muted text-foreground",
              "bg-primary text-primary-foreground",
            ] as const;
            const tagTones = [
              "bg-background/10 text-background/80",
              "bg-primary/15 text-primary",
              "bg-background text-foreground/70",
              "bg-primary-foreground/15 text-primary-foreground",
            ] as const;
            const subTones = [
              "text-background/65",
              "text-foreground/65",
              "text-muted-foreground",
              "text-primary-foreground/80",
            ] as const;
            return (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {FEATURES.slice(0, 2).map((feature, i) => {
                    const Illust = ILLUSTRATIONS[i];
                    return (
                      <motion.div
                        key={feature.title}
                        initial={{ opacity: 0, y: 24 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, amount: 0.2 }}
                        transition={{ duration: 0.55, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                        whileHover={{ y: -6 }}
                      >
                        <div className={`h-full rounded-[2rem] overflow-hidden flex flex-col shadow-sm ${bodyTones[i]}`}>
                          <div className={`${featureBg[i]} aspect-[5/3] flex items-center justify-center`}>
                            {data && <Illust data={data} />}
                          </div>
                          <div className="p-7 lg:p-8">
                            <span className={`inline-block text-[10px] font-bold tracking-[0.18em] uppercase px-2.5 py-1 rounded-full mb-4 ${tagTones[i]}`}>{feature.tag}</span>
                            <h3 className="font-display font-bold text-2xl mb-2 tracking-[-0.02em]">{feature.title}</h3>
                            <p className={`text-sm leading-relaxed ${subTones[i]}`}>{feature.description}</p>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                  {FEATURES.slice(2).map((feature, rawI) => {
                    const i = rawI + 2;
                    const Illust = ILLUSTRATIONS[i];
                    const isWide = rawI === 1;
                    return (
                      <motion.div
                        key={feature.title}
                        className={isWide ? "md:col-span-3" : "md:col-span-2"}
                        initial={{ opacity: 0, y: 24 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, amount: 0.2 }}
                        transition={{ duration: 0.55, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                        whileHover={{ y: -6 }}
                      >
                        <div className={`h-full rounded-[2rem] overflow-hidden flex ${isWide ? "flex-col sm:flex-row" : "flex-col"} shadow-sm ${bodyTones[i]}`}>
                          <div className={`${featureBg[i]} ${isWide ? "sm:w-1/2 aspect-[5/3] sm:aspect-auto" : "aspect-[5/3]"} flex items-center justify-center relative flex-shrink-0`}>
                            {data && <Illust data={data} />}
                          </div>
                          <div className="p-7 lg:p-8 flex flex-col justify-center">
                            <span className={`inline-block self-start text-[10px] font-bold tracking-[0.18em] uppercase px-2.5 py-1 rounded-full mb-4 ${tagTones[i]}`}>{feature.tag}</span>
                            <h3 className="font-display font-bold text-2xl mb-2 tracking-[-0.02em]">{feature.title}</h3>
                            <p className={`text-sm leading-relaxed ${subTones[i]}`}>{feature.description}</p>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      </section>

      {/* Data sources */}
      <section id="sources" className="py-20 lg:py-28 bg-muted/40">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <motion.div
            className="text-center mb-14 max-w-2xl mx-auto"
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <span className="inline-block text-[11px] font-bold tracking-[0.2em] uppercase text-primary mb-4">Data sources</span>
            <h2 className="text-3xl sm:text-5xl font-display font-bold text-foreground tracking-[-0.03em] leading-[1.05] mb-4">
              Public sources,
              <br />
              one graph
            </h2>
            <p className="text-muted-foreground text-base lg:text-lg">
              Each source adds a different kind of connection. Counts show how many records in the loaded graph cite it.
            </p>
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {SOURCES.map((s, i) => {
              const n = data?.sourceCounts.get(s.source) ?? 0;
              return (
                <motion.div
                  key={s.source}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.2 }}
                  transition={{ duration: 0.5, delay: (i % 4) * 0.06, ease: [0.22, 1, 0.36, 1] }}
                  className="bg-card rounded-2xl p-6 shadow-sm flex flex-col"
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <h3 className="font-display font-bold text-lg text-foreground tracking-[-0.01em]">{SOURCE_LABEL[s.source]}</h3>
                    <span className={`shrink-0 text-[10px] font-bold uppercase tracking-[0.14em] px-2.5 py-1 rounded-full ${n ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
                      {n ? `${n.toLocaleString()} records` : "Not loaded yet"}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed flex-1">{s.what}</p>
                  {s.note && <p className="text-xs text-muted-foreground mt-2 italic">{s.note}</p>}
                  <div className="mt-4 pt-4 border-t border-border flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                    <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-foreground/70">Edges: {s.link}</span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Why it matters */}
      <section className="py-24 lg:py-32">
        <div className="max-w-5xl mx-auto px-6 lg:px-8 text-center">
          <motion.p
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-2xl sm:text-4xl lg:text-[44px] font-display font-semibold text-foreground tracking-[-0.025em] leading-[1.15] text-balance"
          >
            Alumni appear in company bios, press releases and research pages.{" "}
            <span className="text-primary">Connecting those public achievements reveals mentorship and collaboration</span>{" "}
            waiting to happen.
          </motion.p>
          <div className="mt-14 grid grid-cols-1 sm:grid-cols-3 gap-6 text-left">
            {[
              { k: "Built for BU", v: "Our sponsors focus on Boston University alumni — so that's where the graph starts." },
              { k: "Works for any college", v: "The same model applies to any institution's public footprint." },
              { k: "Public data only", v: "Every connection traces back to a public record you can cite." },
            ].map((x) => (
              <div key={x.k} className="rounded-2xl bg-muted/60 p-6">
                <p className="font-display font-bold text-lg text-foreground mb-1.5">{x.k}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{x.v}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="pt-10 lg:pt-16 pb-12 lg:pb-16 relative">
        <div className="max-w-4xl mx-auto px-6 lg:px-8">
          <div className="relative pt-16 lg:pt-20">
            <div className="absolute inset-x-0 top-0 z-20 flex justify-center pointer-events-none" aria-hidden="true">
              <motion.div
                initial={{ opacity: 0, y: 16, scale: 0.85 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, type: "spring", stiffness: 220, damping: 18 }}
                className="drop-shadow-[0_18px_40px_hsl(240_30%_14%_/_0.18)]"
              >
                <svg width="140" height="120" viewBox="0 0 140 120" fill="none">
                  {[[70, 20], [118, 48], [104, 102], [36, 102], [22, 48]].map(([x, y], i, arr) => (
                    <g key={i}>
                      <line x1={70} y1={62} x2={x} y2={y} stroke="hsl(var(--primary))" strokeWidth="3" strokeLinecap="round" />
                      <line x1={x} y1={y} x2={arr[(i + 1) % arr.length][0]} y2={arr[(i + 1) % arr.length][1]} stroke="hsl(var(--border))" strokeWidth="2.5" />
                    </g>
                  ))}
                  {[[70, 20], [118, 48], [104, 102], [36, 102], [22, 48]].map(([x, y], i) => (
                    <circle key={i} cx={x} cy={y} r={11} fill="hsl(var(--card))" stroke="hsl(var(--primary))" strokeWidth="4" />
                  ))}
                  <circle cx={70} cy={62} r={16} fill="hsl(var(--primary))" />
                </svg>
              </motion.div>
            </div>

            <div className="bg-foreground rounded-[2.5rem] relative overflow-hidden px-6 pt-24 pb-20 lg:px-10 lg:pt-28 lg:pb-24 max-w-5xl mx-auto">
              <div className="absolute -top-40 -right-32 w-[500px] h-[500px] rounded-full bg-primary/30 blur-[120px] pointer-events-none" aria-hidden="true" />
              <div className="absolute -bottom-40 -left-32 w-[420px] h-[420px] rounded-full bg-primary/20 blur-[100px] pointer-events-none" aria-hidden="true" />
              <div className="text-center relative z-10">
                <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}>
                  <h2 className="text-4xl sm:text-6xl lg:text-7xl font-display font-bold mb-6 text-background tracking-[-0.035em] leading-[0.95]">
                    Find your
                    <br />
                    six degrees
                  </h2>
                  <p className="text-background/70 text-lg lg:text-xl mb-10 max-w-lg mx-auto text-balance">
                    Start with Boston University. See who's closer than you think.
                  </p>
                  <Button size="lg" className="text-base font-semibold px-8 h-12 bg-primary text-primary-foreground hover:bg-primary/90" asChild>
                    <Link to={exploreHref}>Explore the network <ArrowRight className="ml-2 w-4 h-4" /></Link>
                  </Button>
                </motion.div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="py-12 px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <Logo size="md" />
          <p className="text-sm text-muted-foreground">© 2026 6degrees. Every connection links to its public source record.</p>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
