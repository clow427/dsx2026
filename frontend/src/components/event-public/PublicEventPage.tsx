import { motion } from "framer-motion";
import { useRef } from "react";
import { CalendarDays, MapPin, Video, Globe, Users } from "lucide-react";
import type { Event } from "@/hooks/useEvents";
import type { EventModule } from "@/hooks/useEventModules";
import { Hero } from "./Hero";
import { StickyRegisterBar } from "./StickyRegisterBar";
import { PublicModule } from "./PublicModule";

interface Props {
  event: Event;
  modules: EventModule[];
  brandColor: string;
  isDark: boolean;
  formattedDate: string;
  formSlot: React.ReactNode;
}

/**
 * The single, cinematic public event page. Replaces the old minimal/split/landing/
 * stacked/cards templates. Mobile-first; full-bleed hero; bespoke module sections;
 * sticky register CTA; in-page register section.
 */
export function PublicEventPage({
  event,
  modules,
  brandColor,
  isDark,
  formattedDate,
  formSlot,
}: Props) {
  const registerRef = useRef<HTMLDivElement>(null);

  const scrollToRegister = () => {
    registerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const visibleModules = modules
    .filter((m) => m.enabled)
    .sort((a, b) => a.position - b.position);

  const locationLabel =
    event.location_type === "physical" ? "In-Person" :
    event.location_type === "hybrid" ? "Hybrid" : "Virtual";
  const LocationIcon =
    event.location_type === "physical" ? MapPin :
    event.location_type === "hybrid" ? Globe : Video;

  return (
    <div className={isDark ? "dark" : ""}>
      <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
        <Hero
          event={event}
          brandColor={brandColor}
          formattedDate={formattedDate}
          onRegisterClick={scrollToRegister}
        />

        <StickyRegisterBar
          brandColor={brandColor}
          eventName={event.name}
          onRegisterClick={scrollToRegister}
        />

        {/* Editorial intro — only when description exists */}
        {event.description && (
          <section className="relative px-5 sm:px-8 lg:px-12 py-16 sm:py-24 lg:py-36">
            <div className="max-w-4xl mx-auto">
              <motion.div
                initial={{ opacity: 0, y: 24, filter: "blur(8px)" }}
                whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              >
                <p
                  className="text-[10px] sm:text-xs font-bold tracking-[0.25em] uppercase mb-5 sm:mb-6"
                  style={{ color: brandColor }}
                >
                  About the event
                </p>
                <p
                  className="font-display font-medium tracking-[-0.02em] leading-[1.2] sm:leading-[1.15] text-foreground break-words"
                  style={{ fontSize: "clamp(1.25rem, 4.5vw, 2.5rem)" }}
                >
                  {event.description}
                </p>

                {/* Quick facts */}
                <div className="mt-8 sm:mt-12 lg:mt-14 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                  {formattedDate && (
                    <Fact icon={<CalendarDays className="w-5 h-5" />} label="When" value={formattedDate} brandColor={brandColor} />
                  )}
                  <Fact icon={<LocationIcon className="w-5 h-5" />} label="Where" value={locationLabel} brandColor={brandColor} />
                  {event.capacity && (
                    <Fact icon={<Users className="w-5 h-5" />} label="Capacity" value={`${event.capacity} attendees`} brandColor={brandColor} />
                  )}
                </div>
              </motion.div>
            </div>
          </section>
        )}

        {/* Modules */}
        {visibleModules.map((m, i) => (
          <PublicModule key={m.id} module={m} brandColor={brandColor} index={i} />
        ))}

        {/* Register section */}
        <section
          ref={registerRef}
          id="register"
          className="relative px-4 sm:px-8 lg:px-12 py-16 sm:py-24 lg:py-36 overflow-hidden"
        >
          {/* Brand-tinted bed */}
          <div
            className="absolute inset-0 -z-10"
            style={{
              background: `radial-gradient(circle at 25% 30%, ${brandColor}22, transparent 55%), radial-gradient(circle at 80% 70%, hsl(265 90% 55% / 0.15), transparent 50%)`,
            }}
          />
          <div className="max-w-2xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 28, filter: "blur(8px)" }}
              whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              className="text-center mb-8 sm:mb-12"
            >
              <p
                className="text-[10px] sm:text-xs font-bold tracking-[0.25em] uppercase mb-3 sm:mb-4"
                style={{ color: brandColor }}
              >
                Reserve your spot
              </p>
              <h2
                className="font-display font-bold tracking-[-0.03em] leading-[1.02] sm:leading-[0.95] text-foreground break-words hyphens-auto"
                style={{ fontSize: "clamp(1.875rem, 7vw, 4rem)" }}
              >
                Register for {event.name}
              </h2>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
              className="rounded-3xl bg-card p-5 sm:p-8 lg:p-10 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.25)]"
            >
              {formSlot}
            </motion.div>

            <p className="text-center text-xs text-muted-foreground mt-8">
              Powered by <span className="font-semibold text-foreground">6degrees</span>
            </p>
          </div>
        </section>

        {/* Bottom spacer so sticky bar never overlaps last content */}
        <div className="h-24" aria-hidden />
      </div>
    </div>
  );
}

function Fact({
  icon, label, value, brandColor,
}: { icon: React.ReactNode; label: string; value: string; brandColor: string }) {
  return (
    <div className="rounded-2xl bg-card p-5 sm:p-6">
      <div
        className="inline-flex items-center justify-center w-9 h-9 rounded-full mb-3"
        style={{ background: `${brandColor}18`, color: brandColor }}
      >
        {icon}
      </div>
      <p className="text-[10px] tracking-[0.2em] uppercase font-bold text-muted-foreground mb-1">{label}</p>
      <p className="text-base sm:text-lg font-display font-semibold tracking-[-0.01em] text-foreground leading-tight">
        {value}
      </p>
    </div>
  );
}
