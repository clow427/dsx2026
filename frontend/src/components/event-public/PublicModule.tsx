import { motion } from "framer-motion";
import { useState } from "react";
import { MapPin, Plus, Quote } from "lucide-react";
import type { EventModule } from "@/hooks/useEventModules";
import SectionIcon from "@/components/event-detail/SectionIcon";

interface ModuleProps {
  module: EventModule;
  brandColor: string;
  index: number;
}

const fadeUp = {
  initial: { opacity: 0, y: 28, filter: "blur(8px)" },
  whileInView: { opacity: 1, y: 0, filter: "blur(0px)" },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] as const },
};

const stagger = {
  initial: "hidden",
  whileInView: "visible",
  viewport: { once: true, margin: "-60px" },
  variants: { visible: { transition: { staggerChildren: 0.08 } } },
};

const staggerItem = {
  hidden: { opacity: 0, y: 22, filter: "blur(8px)" },
  visible: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const } },
};

/* ─────────────────────── Shared section frame ─────────────────────── */

function SectionShell({
  eyebrow,
  heading,
  children,
  brandColor,
  variant = "contained",
}: {
  eyebrow?: string;
  heading?: string;
  children: React.ReactNode;
  brandColor: string;
  variant?: "contained" | "wide";
}) {
  return (
    <section className={`relative w-full px-5 sm:px-8 lg:px-12 py-16 sm:py-24 lg:py-36`}>
      <div className={variant === "wide" ? "max-w-[1400px] mx-auto" : "max-w-5xl mx-auto"}>
        {(eyebrow || heading) && (
          <motion.div {...fadeUp} className="mb-10 sm:mb-14 lg:mb-20 max-w-3xl">
            {eyebrow && (
              <p
                className="text-[10px] sm:text-xs font-bold tracking-[0.25em] uppercase mb-3 sm:mb-4"
                style={{ color: brandColor }}
              >
                {eyebrow}
              </p>
            )}
            {heading && (
              <h2
                className="font-display font-bold tracking-[-0.03em] leading-[1.02] sm:leading-[0.95] text-foreground break-words hyphens-auto"
                style={{ fontSize: "clamp(2rem, 8vw, 4.5rem)" }}
              >
                {heading}
              </h2>
            )}
          </motion.div>
        )}
        {children}
      </div>
    </section>
  );
}

/* ─────────────────────── why_attend — bento grid ─────────────────────── */

function WhyAttend({ module: m, brandColor }: ModuleProps) {
  const c = m.content || {};
  const bullets: string[] = Array.isArray(c.bullets) ? c.bullets : [];
  const imageUrl: string | undefined = c.image_url;
  const heading = c.heading || "Why attend";
  const [hero, ...rest] = bullets;

  return (
    <SectionShell eyebrow="Why attend" heading={heading} brandColor={brandColor} variant="wide">
      <motion.div {...stagger} className="grid grid-cols-1 lg:grid-cols-6 lg:auto-rows-[minmax(180px,auto)] gap-3 sm:gap-4">
        {/* Hero bullet — large, image-backed if available */}
        {hero && (
          <motion.div
            variants={staggerItem}
            className="relative lg:col-span-4 lg:row-span-2 rounded-3xl overflow-hidden p-6 sm:p-8 lg:p-10 flex flex-col justify-end min-h-[280px] sm:min-h-[360px] lg:min-h-[420px]"
            style={{
              background: imageUrl ? "transparent" : `linear-gradient(135deg, ${brandColor}, hsl(265 90% 55%))`,
            }}
          >
            {imageUrl && (
              <>
                <img src={imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute inset-0" style={{ background: `linear-gradient(0deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.25) 50%, rgba(0,0,0,0.0) 100%), radial-gradient(circle at 70% 30%, ${brandColor}40, transparent 60%)` }} />
              </>
            )}
            <div className="relative">
              <span className="inline-block text-[10px] tracking-[0.25em] uppercase text-white/70 font-bold mb-3">01</span>
              <p className="font-display font-semibold tracking-[-0.02em] text-white leading-[1.1] break-words" style={{ fontSize: "clamp(1.5rem, 5vw, 2.5rem)" }}>
                {hero}
              </p>
            </div>
          </motion.div>
        )}

        {/* Smaller bullets */}
        {rest.slice(0, 3).map((b, i) => (
          <motion.div
            key={i}
            variants={staggerItem}
            className="lg:col-span-2 rounded-3xl p-5 sm:p-6 lg:p-7 bg-card flex flex-col justify-between min-h-[140px] sm:min-h-[180px]"
          >
            <span
              className="text-[10px] tracking-[0.25em] uppercase font-bold"
              style={{ color: brandColor }}
            >
              {String(i + 2).padStart(2, "0")}
            </span>
            <p className="font-display font-semibold tracking-[-0.015em] text-foreground leading-[1.2] mt-3 sm:mt-4 break-words" style={{ fontSize: "clamp(1rem, 2.4vw, 1.25rem)" }}>
              {b}
            </p>
          </motion.div>
        ))}

        {/* Overflow bullets — clean list under the bento */}
        {rest.slice(3).map((b, i) => (
          <motion.div
            key={`extra-${i}`}
            variants={staggerItem}
            className="lg:col-span-3 rounded-3xl p-5 sm:p-6 bg-card flex items-start gap-4"
          >
            <span
              className="shrink-0 mt-1 text-[10px] tracking-[0.25em] uppercase font-bold"
              style={{ color: brandColor }}
            >
              {String(i + 5).padStart(2, "0")}
            </span>
            <p className="text-base sm:text-lg text-foreground/90 leading-relaxed break-words">{b}</p>
          </motion.div>
        ))}
      </motion.div>
    </SectionShell>
  );
}

/* ─────────────────────── schedule — vertical timeline ─────────────────────── */

function Schedule({ module: m, brandColor }: ModuleProps) {
  const c = m.content || {};
  const items: { time: string; title: string }[] = Array.isArray(c.items) ? c.items : [];

  return (
    <SectionShell eyebrow="Schedule" heading={c.heading || "What to expect"} brandColor={brandColor}>
      <motion.ol {...stagger} className="relative space-y-1">
        <div
          className="absolute left-[4.5rem] sm:left-[5.5rem] top-2 bottom-2 w-px"
          style={{ background: `linear-gradient(180deg, ${brandColor}66, transparent)` }}
        />
        {items.map((it, i) => (
          <motion.li
            key={i}
            variants={staggerItem}
            className="relative grid grid-cols-[4.5rem_1rem_1fr] sm:grid-cols-[5.5rem_1rem_1fr] items-start gap-3 sm:gap-6 py-5 sm:py-7 border-b border-border/40 last:border-b-0"
          >
            <span
              className="font-display font-bold tabular-nums tracking-[-0.02em] text-xl sm:text-3xl lg:text-4xl pt-1 sm:pt-0"
              style={{ color: brandColor }}
            >
              {it.time}
            </span>
            <span className="block w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full mt-3 sm:mt-4 -ml-[3px]" style={{ background: brandColor }} />
            <span className="font-display font-semibold tracking-[-0.015em] text-foreground leading-snug break-words" style={{ fontSize: "clamp(1.05rem, 3.6vw, 1.5rem)" }}>
              {it.title}
            </span>
          </motion.li>
        ))}
      </motion.ol>
    </SectionShell>
  );
}

/* ─────────────────────── speakers — large square portraits ─────────────────────── */

function Speakers({ module: m, brandColor }: ModuleProps) {
  const c = m.content || {};
  const people: { name: string; role: string; avatar?: string }[] = Array.isArray(c.people) ? c.people : [];

  return (
    <SectionShell eyebrow="Featuring" heading={c.heading || "Speakers"} brandColor={brandColor} variant="wide">
      <motion.div {...stagger} className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
        {people.map((p, i) => (
          <motion.div key={i} variants={staggerItem} className="group">
            <div className="relative aspect-square rounded-2xl overflow-hidden bg-muted">
              {p.avatar ? (
                <img
                  src={p.avatar}
                  alt={p.name}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center font-display font-bold text-5xl sm:text-7xl text-white"
                  style={{ background: `linear-gradient(135deg, ${brandColor}, hsl(265 90% 55%))` }}
                >
                  {(p.name || "?").charAt(0)}
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5 bg-gradient-to-t from-black/80 via-black/30 to-transparent">
                <p className="font-display font-semibold text-base sm:text-lg text-white leading-tight">{p.name}</p>
                {p.role && <p className="text-xs sm:text-sm text-white/75 mt-0.5 leading-snug">{p.role}</p>}
              </div>
            </div>
          </motion.div>
        ))}
      </motion.div>
    </SectionShell>
  );
}

/* ─────────────────────── location — full-bleed with floating card ─────────────────────── */

function Location({ module: m, brandColor }: ModuleProps) {
  const c = m.content || {};
  const imageUrl: string | undefined = c.image_url;

  return (
    <section className="relative w-full px-5 sm:px-8 lg:px-12 py-20 sm:py-28 lg:py-36">
      <div className="max-w-[1400px] mx-auto">
        <motion.div {...fadeUp} className="mb-8 sm:mb-10">
          <p className="text-[10px] sm:text-xs font-bold tracking-[0.25em] uppercase mb-3 sm:mb-4" style={{ color: brandColor }}>
            Location
          </p>
          <h2 className="font-display font-bold tracking-[-0.03em] leading-[1.02] sm:leading-[0.95] text-foreground break-words hyphens-auto" style={{ fontSize: "clamp(2rem, 8vw, 4.5rem)" }}>
            {c.heading || "Where to find us"}
          </h2>
        </motion.div>

        <motion.div
          {...fadeUp}
          className="relative rounded-3xl overflow-hidden min-h-[380px] sm:min-h-[520px] flex items-end"
        >
          {imageUrl ? (
            <img src={imageUrl} alt={c.venue || "Location"} className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div
              className="absolute inset-0"
              style={{ background: `linear-gradient(135deg, ${brandColor}55, hsl(265 90% 55% / 0.4)), linear-gradient(180deg, hsl(220 30% 25%), hsl(220 35% 15%))` }}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

          <div className="relative w-full p-5 sm:p-10">
            <div className="inline-flex flex-col gap-3 max-w-md p-6 sm:p-8 rounded-2xl backdrop-blur-2xl bg-white/15 border border-white/20">
              <div className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-white/95">
                <MapPin className="w-5 h-5" style={{ color: brandColor }} />
              </div>
              {c.venue && <p className="font-display font-semibold text-2xl sm:text-3xl tracking-[-0.02em] text-white leading-tight">{c.venue}</p>}
              {c.address && <p className="text-sm sm:text-base text-white/85 leading-relaxed">{c.address}</p>}
              {c.mapUrl && (
                <a
                  href={c.mapUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 mt-2 px-5 h-11 rounded-full bg-white text-foreground text-sm font-semibold w-fit hover:scale-[1.02] transition-transform"
                >
                  Open in maps <span>→</span>
                </a>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/* ─────────────────────── faq — two-column accordion ─────────────────────── */

function Faq({ module: m, brandColor }: ModuleProps) {
  const c = m.content || {};
  const items: { q: string; a: string }[] = Array.isArray(c.items) ? c.items : [];
  const [open, setOpen] = useState<number | null>(0);

  return (
    <SectionShell eyebrow="FAQ" heading={c.heading || "Questions, answered"} brandColor={brandColor}>
      <motion.div {...stagger} className="space-y-2">
        {items.map((f, i) => {
          const isOpen = open === i;
          return (
            <motion.div
              key={i}
              variants={staggerItem}
              className="rounded-3xl bg-card overflow-hidden"
            >
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : i)}
                className="w-full flex items-start justify-between gap-6 p-6 sm:p-8 text-left"
              >
                <span className="font-display font-semibold text-lg sm:text-2xl tracking-[-0.015em] text-foreground leading-tight">
                  {f.q}
                </span>
                <span
                  className="shrink-0 mt-1 inline-flex items-center justify-center w-9 h-9 rounded-full transition-transform duration-300"
                  style={{
                    background: isOpen ? brandColor : `${brandColor}18`,
                    color: isOpen ? "#fff" : brandColor,
                    transform: isOpen ? "rotate(45deg)" : "rotate(0deg)",
                  }}
                >
                  <Plus className="w-4 h-4" />
                </span>
              </button>
              <motion.div
                initial={false}
                animate={{ height: isOpen ? "auto" : 0, opacity: isOpen ? 1 : 0 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden"
              >
                <p className="px-6 sm:px-8 pb-6 sm:pb-8 text-base sm:text-lg text-muted-foreground leading-relaxed max-w-3xl">
                  {f.a}
                </p>
              </motion.div>
            </motion.div>
          );
        })}
      </motion.div>
    </SectionShell>
  );
}

/* ─────────────────────── sponsors — marquee ─────────────────────── */

function Sponsors({ module: m, brandColor }: ModuleProps) {
  const c = m.content || {};
  const logos: string[] = Array.isArray(c.logos) ? c.logos : [];
  if (logos.length === 0) return null;

  // Duplicate for seamless marquee
  const loop = [...logos, ...logos, ...logos];

  return (
    <SectionShell eyebrow="Brought to you by" heading={c.heading || "Our partners"} brandColor={brandColor} variant="wide">
      <div className="relative overflow-hidden -mx-5 sm:-mx-8 lg:-mx-12">
        <div className="flex gap-12 sm:gap-20 animate-[marquee_40s_linear_infinite] py-4">
          {loop.map((url, i) => (
            <img
              key={i}
              src={url}
              alt="Sponsor"
              className="h-12 sm:h-16 object-contain shrink-0 opacity-70 hover:opacity-100 transition-opacity grayscale hover:grayscale-0"
            />
          ))}
        </div>
        <div className="absolute inset-y-0 left-0 w-16 sm:w-24 bg-gradient-to-r from-background to-transparent pointer-events-none" />
        <div className="absolute inset-y-0 right-0 w-16 sm:w-24 bg-gradient-to-l from-background to-transparent pointer-events-none" />
      </div>
    </SectionShell>
  );
}

/* ─────────────────────── custom — editorial ─────────────────────── */

function Custom({ module: m, brandColor }: ModuleProps) {
  const c = m.content || {};
  const body: string = c.body || "";
  const imageUrl: string | undefined = c.image_url;

  return (
    <SectionShell eyebrow="Notes" heading={c.heading} brandColor={brandColor}>
      {imageUrl && (
        <motion.div {...fadeUp} className="mb-10 rounded-3xl overflow-hidden">
          <img src={imageUrl} alt={c.heading || ""} className="w-full h-auto max-h-[60vh] object-cover" />
        </motion.div>
      )}
      <motion.div {...fadeUp} className="relative max-w-2xl">
        <Quote className="absolute -top-2 -left-1 w-10 h-10 opacity-15" style={{ color: brandColor }} />
        <div className="pl-12 text-lg sm:text-xl text-foreground/90 leading-[1.7] whitespace-pre-wrap">
          {body}
        </div>
      </motion.div>
    </SectionShell>
  );
}

/* ─────────────────────── dispatcher ─────────────────────── */

export function PublicModule(props: ModuleProps) {
  switch (props.module.type) {
    case "why_attend": return <WhyAttend {...props} />;
    case "schedule":   return <Schedule {...props} />;
    case "speakers":   return <Speakers {...props} />;
    case "location":   return <Location {...props} />;
    case "faq":        return <Faq {...props} />;
    case "sponsors":   return <Sponsors {...props} />;
    case "custom":     return <Custom {...props} />;
    default: {
      const c = props.module.content || {};
      return (
        <SectionShell heading={c.heading} brandColor={props.brandColor}>
          <div className="flex items-center gap-3 text-muted-foreground">
            <SectionIcon type={props.module.type} color={props.brandColor} size={24} />
            <span className="text-sm">Section</span>
          </div>
        </SectionShell>
      );
    }
  }
}
