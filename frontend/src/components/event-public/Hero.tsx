import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";
import { useRef } from "react";
import { CalendarDays, MapPin, Video, Globe, ChevronDown } from "lucide-react";
import type { Event } from "@/hooks/useEvents";

interface Props {
  event: Event;
  brandColor: string;
  formattedDate: string;
  onRegisterClick: () => void;
}

/**
 * Cinematic full-bleed hero. The flyer/cover image becomes the entire stage with a
 * slow Ken-Burns scale, layered scrim, and parallax title. If no image exists, a
 * brand-tinted gradient stage is rendered instead — never an empty box.
 */
export function Hero({ event, brandColor, formattedDate, onRegisterClick }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollY } = useScroll();
  const titleY = useTransform(scrollY, [0, 600], [0, 120]);
  const titleOpacity = useTransform(scrollY, [0, 400], [1, 0]);
  const imageScale = useTransform(scrollY, [0, 600], [1, 1.18]);

  const flyer = event.background_image_url;
  const locationLabel =
    event.location_type === "physical" ? "In-Person" :
    event.location_type === "hybrid" ? "Hybrid" : "Virtual";
  const LocationIcon =
    event.location_type === "physical" ? MapPin :
    event.location_type === "hybrid" ? Globe : Video;

  return (
    <section
      ref={ref}
      className="relative w-full overflow-hidden text-white"
      style={{ height: "100svh", minHeight: 560 }}
    >
      {/* Image stage with Ken-Burns + scroll parallax */}
      <motion.div
        className="absolute inset-0"
        style={reduce ? undefined : { scale: imageScale }}
      >
        {flyer ? (
          <motion.img
            src={flyer}
            alt={event.name}
            className="w-full h-full object-cover"
            initial={{ scale: 1 }}
            animate={reduce ? undefined : { scale: 1.08 }}
            transition={{ duration: 18, ease: "easeOut", repeat: Infinity, repeatType: "reverse" }}
          />
        ) : (
          <div
            className="w-full h-full"
            style={{
              background: `radial-gradient(at 30% 20%, ${brandColor}cc, transparent 55%), radial-gradient(at 80% 80%, hsl(265 90% 55% / 0.7), transparent 55%), linear-gradient(135deg, hsl(240 40% 8%), hsl(260 50% 15%))`,
            }}
          />
        )}
      </motion.div>

      {/* Scrim — top-to-bottom for legibility, plus brand vignette */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.05) 35%, rgba(0,0,0,0.55) 75%, rgba(0,0,0,0.85) 100%), radial-gradient(circle at 75% 25%, ${brandColor}30, transparent 55%)`,
        }}
      />

      {/* Grain */}
      <div
        className="absolute inset-0 opacity-[0.05] mix-blend-overlay pointer-events-none"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.6'/></svg>\")",
        }}
      />

      {/* Foreground content */}
      <motion.div
        className="relative h-full flex flex-col justify-end px-5 sm:px-10 lg:px-16 pb-16 sm:pb-20 lg:pb-24 max-w-[1400px] mx-auto"
        style={reduce ? undefined : { y: titleY, opacity: titleOpacity }}
      >
        <motion.div
          initial={{ opacity: 0, y: 28, filter: "blur(12px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
          className="max-w-4xl"
        >
          {formattedDate && (
            <div className="inline-flex items-center gap-2 text-xs sm:text-sm font-medium text-white/85 mb-5 sm:mb-6 backdrop-blur-md bg-white/10 rounded-full px-4 py-2">
              <CalendarDays className="w-3.5 h-3.5" />
              {formattedDate}
            </div>
          )}
          <h1
            className="font-display font-bold tracking-[-0.035em] leading-[1.0] sm:leading-[0.95] text-white break-words hyphens-auto"
            style={{ fontSize: "clamp(2.25rem, 6.5vw, 7.5rem)" }}
          >
            {event.name}
          </h1>
          {event.description && (
            <p className="mt-5 sm:mt-7 max-w-2xl text-base sm:text-lg lg:text-xl text-white/85 leading-relaxed line-clamp-3">
              {event.description}
            </p>
          )}
          <div className="mt-7 sm:mt-9 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onRegisterClick}
              className="group inline-flex items-center justify-center gap-2 h-12 sm:h-14 px-7 sm:px-9 rounded-full text-base sm:text-lg font-semibold text-white shadow-lg transition-transform hover:scale-[1.02] active:scale-[0.99]"
              style={{
                background: `linear-gradient(135deg, ${brandColor}, hsl(265 90% 62%))`,
                boxShadow: `0 18px 50px -12px ${brandColor}aa`,
              }}
            >
              Register now
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </button>
            <span className="inline-flex items-center gap-2 h-12 sm:h-14 px-5 sm:px-6 rounded-full text-sm font-medium text-white bg-white/10 backdrop-blur-md">
              <LocationIcon className="w-4 h-4" />
              {locationLabel}
            </span>
          </div>
        </motion.div>

        {!reduce && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, y: [0, 8, 0] }}
            transition={{ opacity: { delay: 1.4, duration: 0.8 }, y: { delay: 1.6, duration: 2.2, repeat: Infinity, ease: "easeInOut" } }}
            className="hidden sm:flex absolute bottom-6 left-1/2 -translate-x-1/2 flex-col items-center gap-1 text-white/65 text-[10px] tracking-[0.25em] uppercase"
          >
            Scroll
            <ChevronDown className="w-4 h-4" />
          </motion.div>
        )}
      </motion.div>
    </section>
  );
}
