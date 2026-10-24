import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Database, Network, Route, Handshake } from "lucide-react";
import { AlumniGraph } from "@/components/landing/AlumniGraph";

import weissmanFeat from "@/assets/alumni/featured/weissman.jpg.asset.json";
import hinesFeat from "@/assets/alumni/featured/hines.jpg.asset.json";
import fullerFeat from "@/assets/alumni/featured/fuller.jpg.asset.json";
import bachelderFeat from "@/assets/alumni/featured/bachelder.jpg.asset.json";
import bachelder from "@/assets/alumni/bachelder.jpg.asset.json";
import hall from "@/assets/alumni/hall.jpg.asset.json";
import hines from "@/assets/alumni/hines.jpg.asset.json";
import tracey from "@/assets/alumni/tracey.jpg.asset.json";
import nowinski from "@/assets/alumni/nowinski.jpg.asset.json";
import weissman from "@/assets/alumni/weissman.jpg.asset.json";
import daly from "@/assets/alumni/daly.jpg.asset.json";
import ciardi from "@/assets/alumni/ciardi.jpg.asset.json";
import fuller from "@/assets/alumni/fuller.jpg.asset.json";
import delmundo from "@/assets/alumni/delmundo.jpg.asset.json";

const ROTATING_WORDS = ["discovery", "mentorship", "collaboration", "BU"];

const FEATURED = [
  { img: weissmanFeat.url, name: "Drew Weissman", degree: "MED '87", tag: "Nobel Prize 2023", line: "mRNA vaccine technology" },
  { img: hinesFeat.url, name: "Bob Hines", degree: "ENG '97", tag: "NASA astronaut", line: "SpaceX Crew-4 pilot · Artemis III backup" },
  { img: fullerFeat.url, name: "Solomon Carter Fuller", degree: "MED 1897", tag: "Neuroscience", line: "Pioneering Alzheimer's research" },
  { img: bachelderFeat.url, name: "Myrtle Bachelder", degree: "WED '39", tag: "Chemistry", line: "Manhattan Project · Apollo moon rocks" },
];

const SOURCES = [
  { name: "LinkedIn", what: "Career history, titles and employers", link: "Colleagues", status: "Limited", note: "Scraping is restricted — partner or manual access only" },
  { name: "OpenAlex", what: "Institution-linked publications, co-authorship graphs, citations", link: "Co-authors", status: "Open API" },
  { name: "Semantic Scholar", what: "Computer science and biomedicine paper and author networks", link: "Co-authors", status: "Open API" },
  { name: "OpenBU", what: "BU Libraries repository: dissertations, theses, department advisors", link: "Advisors", status: "Open repository" },
  { name: "ProQuest Dissertations", what: "Structured historical graduation and thesis metadata", link: "Advisors", status: "Subscription" },
  { name: "USPTO PatentsView", what: "Patent inventors, assignees and technology-transfer disclosures", link: "Co-inventors", status: "Open API" },
  { name: "Google Patents", what: "Public datasets of patent citations and co-inventorship records", link: "Co-inventors", status: "Public dataset" },
  { name: "NIH RePORTER", what: "NIH grant recipients, principal investigators and fellowship alumni", link: "Grant teams", status: "Open API" },
  { name: "NSF Award Search", what: "National Science Foundation research grants and awardee institutions", link: "Grant teams", status: "Open API" },
];

const FEATURES = [
  { tag: "Ingest", title: "Pull from public sources", description: "Papers, patents, grants, theses and bios — matched to BU alumni and merged into one profile.", icon: Database },
  { tag: "Graph", title: "See the living network", description: "Every shared paper, advisor, patent or grant becomes an edge. Watch the BU network take shape.", icon: Network },
  { tag: "Pathfinding", title: "Find the shortest path", description: "Pick any two alumni and see how many degrees separate them — and through whom.", icon: Route },
  { tag: "Opportunities", title: "Spot mentors & collaborators", description: "Surface alumni who share your field, lab lineage or funding agency, ready for an intro.", icon: Handshake },
];

const featureBg = [
  "bg-[hsl(340,75%,95%)]",
  "bg-[hsl(170,60%,92%)]",
  "bg-[hsl(45,90%,92%)]",
  "bg-[hsl(250,60%,94%)]",
];

function IllustrationSources() {
  const chips = ["OpenAlex", "NIH RePORTER", "PatentsView", "OpenBU", "NSF Awards", "Semantic Scholar"];
  return (
    <div className="relative w-full h-full flex items-center justify-center p-6">
      <div className="grid grid-cols-2 gap-2.5 w-[85%]">
        {chips.map((c, i) => (
          <div key={c} className="bg-white/80 rounded-xl shadow-sm px-3 py-2.5 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ["hsl(340,75%,58%)", "hsl(170,60%,45%)", "hsl(45,85%,50%)", "hsl(250,60%,65%)"][i % 4] }} />
            <span className="text-[11px] font-semibold text-foreground truncate">{c}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function IllustrationGraph() {
  const pts = [
    { x: 50, y: 50, img: weissman.url, r: 30 },
    { x: 20, y: 25, img: tracey.url, r: 20 },
    { x: 80, y: 22, img: daly.url, r: 20 },
    { x: 18, y: 76, img: fuller.url, r: 20 },
    { x: 82, y: 78, img: ciardi.url, r: 20 },
    { x: 50, y: 12, img: delmundo.url, r: 16 },
  ];
  return (
    <div className="relative w-full h-full">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full" aria-hidden="true">
        {pts.slice(1).map((p, i) => (
          <line key={i} x1={50} y1={50} x2={p.x} y2={p.y} stroke="hsl(170,60%,40%)" strokeWidth="0.6" vectorEffect="non-scaling-stroke" style={{ strokeWidth: 2 }} />
        ))}
        <line x1={20} y1={25} x2={50} y2={12} stroke="hsl(170,60%,40%)" style={{ strokeWidth: 2 }} vectorEffect="non-scaling-stroke" />
        <line x1={80} y1={22} x2={82} y2={78} stroke="hsl(170,60%,40%)" style={{ strokeWidth: 2 }} vectorEffect="non-scaling-stroke" />
      </svg>
      {pts.map((p, i) => (
        <div key={i} className="absolute rounded-full overflow-hidden shadow-md border-[3px] border-white" style={{ left: `${p.x}%`, top: `${p.y}%`, width: p.r * 2, height: p.r * 2, transform: "translate(-50%,-50%)" }}>
          <img src={p.img} alt="" className="w-full h-full object-cover" />
        </div>
      ))}
    </div>
  );
}

function IllustrationPath() {
  const chain = [
    { img: bachelder.url, name: "Bachelder" },
    { img: hall.url, name: "Hall" },
    { img: hines.url, name: "Hines" },
  ];
  const links = ["Apollo program", "Apollo → Artemis"];
  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center p-6 gap-4">
      <div className="flex items-center">
        {chain.map((c, i) => (
          <div key={c.name} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div className="w-16 h-16 rounded-full overflow-hidden shadow-md border-[3px] border-white">
                <img src={c.img} alt={c.name} className="w-full h-full object-cover" />
              </div>
              <span className="text-[10px] font-semibold text-foreground">{c.name}</span>
            </div>
            {i < chain.length - 1 && (
              <div className="flex flex-col items-center mx-1 -mt-5">
                <span className="text-[8px] font-bold uppercase tracking-[0.12em] text-[hsl(45,80%,35%)] mb-1 whitespace-nowrap">{links[i]}</span>
                <div className="w-14 h-[2px] bg-[hsl(45,80%,45%)]" />
              </div>
            )}
          </div>
        ))}
      </div>
      <span className="bg-white/80 rounded-full px-3 py-1 text-[11px] font-bold text-foreground shadow-sm">2 degrees apart</span>
    </div>
  );
}

function IllustrationOpportunities() {
  return (
    <div className="relative w-full h-full flex items-center justify-center p-6">
      <div className="w-[88%] bg-white/80 rounded-xl shadow-lg p-4 space-y-3">
        <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[hsl(250,50%,50%)]">Suggested intro</p>
        <div className="flex items-center gap-3">
          <div className="flex -space-x-3">
            <img src={tracey.url} alt="" className="w-11 h-11 rounded-full object-cover border-[3px] border-white" />
            <img src={nowinski.url} alt="" className="w-11 h-11 rounded-full object-cover border-[3px] border-white" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-foreground truncate">Kevin Tracey ↔ Chris Nowinski</p>
            <p className="text-[10px] text-muted-foreground">Shared field: neuroscience</p>
          </div>
        </div>
        <div className="h-7 rounded-full flex items-center justify-center bg-[hsl(250,60%,65%)]">
          <span className="text-[10px] text-white font-semibold">Request introduction</span>
        </div>
      </div>
    </div>
  );
}

const ILLUSTRATIONS = [IllustrationSources, IllustrationGraph, IllustrationPath, IllustrationOpportunities];

const Landing = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { role, loading: roleLoading } = useUserRole();

  // Authenticated users skip the marketing page and land on their role-based home.
  useEffect(() => {
    if (authLoading || !user) return;
    if (roleLoading || !role) return;
    navigate(role === "organizer" ? "/dashboard/events" : "/dashboard/home", { replace: true });
  }, [user, authLoading, role, roleLoading, navigate]);

  const redirectingAuthenticatedUser = !authLoading && !!user && (roleLoading || !!role);

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

  if (redirectingAuthenticatedUser) return null;

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
        Boston University alumni, connected through the papers, patents, grants and theses they share.
      </p>
      <Button size="lg" className={`font-semibold shadow-xl shadow-foreground/10 ${size === "graph" ? "h-12 px-7" : "h-14 px-9 text-base"}`} asChild>
        <Link to="/chat">Explore the network <ArrowRight className="ml-2 w-4 h-4" /></Link>
      </Button>
    </motion.div>
  );

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
            <Button variant="ghost" className="text-sm font-medium" asChild>
              <Link to="/chat">Ask 6degrees</Link>
            </Button>
            <Button className="hidden sm:inline-flex text-sm font-semibold" asChild>
              <Link to="/chat">Find alumni</Link>
            </Button>
          </div>
        </div>
      </motion.nav>

      {/* Hero — the network graph */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 -z-0 pointer-events-none" aria-hidden="true">
          <div className="mx-auto h-[720px] w-[120%] -translate-x-[10%] bg-[radial-gradient(ellipse_at_50%_0%,hsl(340_75%_92%/_0.85)_0%,hsl(340_75%_96%/_0.4)_35%,transparent_70%)]" />
        </div>

        {/* Desktop: headline sits in the middle of the graph */}
        <div className="hidden lg:block max-w-7xl mx-auto px-6 lg:px-8 pt-14 pb-16 relative">
          <AlumniGraph center={headline("graph")} />
          <p className="text-center text-xs text-muted-foreground mt-6">
            Hover anyone to see their connections. All people shown are real BU alumni, from public sources.
          </p>
        </div>

        {/* Mobile / tablet: headline first, graph scrolls sideways */}
        <div className="lg:hidden relative pt-16 pb-12">
          <div className="px-6">{headline("stack")}</div>
          <div className="mt-12 overflow-x-auto scrollbar-none">
            <div className="min-w-[960px] px-6">
              <AlumniGraph />
            </div>
          </div>
          <p className="text-center text-xs text-muted-foreground mt-4 px-6">Swipe to explore · real BU alumni from public sources</p>
        </div>
      </section>

      {/* Featured alumni */}
      <section className="py-20 lg:py-28 bg-muted/40">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between mb-12 gap-4">
            <div className="max-w-xl">
              <h2 className="text-3xl sm:text-5xl font-display font-bold text-foreground tracking-[-0.03em] leading-[1.05] mb-3">
                Achievements hiding
                <br />
                in plain sight
              </h2>
              <p className="text-muted-foreground text-base lg:text-lg">
                Nobel laureates, astronauts and pioneers — each one a node in the BU graph.
              </p>
            </div>
            <Link to="/chat" className="group inline-flex items-center gap-2 text-primary font-semibold text-sm self-start md:self-end">
              Browse alumni
              <span className="w-9 h-9 rounded-full bg-primary text-primary-foreground inline-flex items-center justify-center group-hover:translate-x-1 transition-transform">
                <ArrowRight className="w-4 h-4" />
              </span>
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {FEATURED.map((a, i) => (
              <motion.div
                key={a.name}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.55, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                whileHover={{ y: -6 }}
              >
                <div className="group cursor-pointer">
                  <div className="relative rounded-3xl overflow-hidden mb-4 aspect-[4/5]">
                    <img src={a.img} alt={a.name} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                    <div className="absolute inset-0 bg-gradient-to-t from-foreground/40 via-transparent to-transparent" />
                    <span className="absolute top-4 left-4 bg-background/95 backdrop-blur text-foreground text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-[0.15em] shadow-sm">
                      {a.tag}
                    </span>
                  </div>
                  <p className="text-[11px] text-primary font-bold uppercase tracking-[0.18em] mb-1.5">{a.degree}</p>
                  <h3 className="font-display font-semibold text-lg text-foreground group-hover:text-primary transition-colors tracking-[-0.01em]">{a.name}</h3>
                  <p className="text-sm text-muted-foreground mt-0.5">{a.line}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

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
              between alumni
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
                            <Illust />
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
                            <Illust />
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
              Nine public sources,
              <br />
              one graph
            </h2>
            <p className="text-muted-foreground text-base lg:text-lg">
              Each source adds a different kind of connection between alumni.
            </p>
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {SOURCES.map((s, i) => {
              const limited = s.status === "Limited";
              return (
                <motion.div
                  key={s.name}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.2 }}
                  transition={{ duration: 0.5, delay: (i % 3) * 0.06, ease: [0.22, 1, 0.36, 1] }}
                  className="bg-card rounded-2xl p-6 shadow-sm flex flex-col"
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <h3 className="font-display font-bold text-lg text-foreground tracking-[-0.01em]">{s.name}</h3>
                    <span className={`shrink-0 text-[10px] font-bold uppercase tracking-[0.14em] px-2.5 py-1 rounded-full ${limited ? "bg-warning/15 text-warning" : s.status === "Subscription" ? "bg-muted text-muted-foreground" : "bg-success/10 text-success"}`}>
                      {s.status}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed flex-1">{s.what}</p>
                  {s.note && <p className="text-xs text-warning mt-2">{s.note}</p>}
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
                    <Link to="/chat">Explore the network <ArrowRight className="ml-2 w-4 h-4" /></Link>
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
          <p className="text-sm text-muted-foreground">© 2026 6degrees. Portraits via Wikimedia Commons.</p>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
