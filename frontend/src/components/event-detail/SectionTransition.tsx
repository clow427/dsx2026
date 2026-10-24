import { useRef } from "react";
import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";
import { Shuffle } from "lucide-react";

export type TransitionKind = "gradient" | "wave" | "curve" | "diagonal" | "blob" | "parallax" | "none";

export interface SectionTransitionConfig {
  kind: TransitionKind;
  /** 0..1 hash that lets variants stay deterministic per break */
  seed?: number;
}

interface Props {
  config: SectionTransitionConfig;
  brandColor: string;
  /** Color hint of the section ABOVE this divider. Defaults to transparent (page bg). */
  fromColor?: string;
  /** Color hint of the section BELOW this divider. */
  toColor?: string;
  compact?: boolean;
  editable?: boolean;
  onRegenerate?: () => void;
}

/**
 * Pick a deterministic transition based on a hash of (eventId + moduleId).
 * Spreads variants evenly so consecutive breaks feel different but stable.
 */
export function pickTransition(seedKey: string, index: number): SectionTransitionConfig {
  let hash = 2166136261;
  const k = `${seedKey}::${index}`;
  for (let i = 0; i < k.length; i++) {
    hash ^= k.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const norm = (hash >>> 0) / 0xffffffff;

  const kinds: TransitionKind[] = ["gradient", "wave", "curve", "diagonal", "blob", "parallax"];
  // Bias against repeating the same kind two breaks in a row by mixing in index
  const bucket = Math.floor(((norm * 1000 + index * 137) % 1000) / (1000 / kinds.length));
  return { kind: kinds[bucket], seed: norm };
}

export function SectionTransition({
  config,
  brandColor,
  fromColor = "transparent",
  toColor = "transparent",
  compact = false,
  editable = false,
  onRegenerate,
}: Props) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  // Reduced motion = render a static gradient line, no SVG flourish, no parallax.
  const safeKind: TransitionKind = reduce ? "gradient" : config.kind;
  const seed = config.seed ?? 0.5;
  const heightCls = compact
    ? "h-12 sm:h-16"
    : safeKind === "parallax"
    ? "h-32 sm:h-44 md:h-56"
    : safeKind === "gradient"
    ? "h-16 sm:h-24"
    : "h-20 sm:h-28 md:h-36";

  const yA = useTransform(scrollYProgress, [0, 1], ["-12%", "12%"]);
  const yB = useTransform(scrollYProgress, [0, 1], ["10%", "-10%"]);
  const rotateBlob = useTransform(scrollYProgress, [0, 1], [-8, 8]);

  return (
    <div ref={ref} className={`relative w-full ${heightCls} -my-2 sm:-my-4 pointer-events-none select-none`}>
      {/* Visual */}
      {safeKind === "gradient" && (
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(180deg, ${fromColor} 0%, ${brandColor}1f 45%, ${brandColor}33 50%, ${brandColor}1f 55%, ${toColor} 100%)`,
          }}
        />
      )}

      {safeKind === "wave" && <Wave brandColor={brandColor} flip={seed > 0.5} />}
      {safeKind === "curve" && <Curve brandColor={brandColor} flip={seed > 0.5} />}
      {safeKind === "diagonal" && <Diagonal brandColor={brandColor} flip={seed > 0.5} />}
      {safeKind === "blob" && <Blob brandColor={brandColor} seed={seed} />}

      {safeKind === "parallax" && (
        <>
          <motion.div
            style={{ y: yA, background: `radial-gradient(60% 80% at 30% 50%, ${brandColor}55, transparent 70%)` }}
            className="absolute inset-0"
          />
          <motion.div
            style={{ y: yB, background: `radial-gradient(50% 70% at 75% 50%, hsl(var(--primary) / 0.35), transparent 70%)` }}
            className="absolute inset-0"
          />
          <motion.svg
            viewBox="0 0 1200 200"
            preserveAspectRatio="none"
            className="absolute inset-0 w-full h-full opacity-70 mix-blend-soft-light"
            style={{ rotate: rotateBlob }}
          >
            <defs>
              <linearGradient id={`pl-${seed}`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor={brandColor} stopOpacity="0.35" />
                <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity="0.15" />
              </linearGradient>
            </defs>
            <path d="M0 120 C 200 60 400 180 600 110 S 1000 60 1200 130 L 1200 200 L 0 200 Z" fill={`url(#pl-${seed})`} />
          </motion.svg>
        </>
      )}

      {/* Owner: regenerate this break */}
      {editable && onRegenerate && (
        <button
          type="button"
          onClick={onRegenerate}
          aria-label="Regenerate transition style"
          title="Shuffle transition"
          className="pointer-events-auto absolute top-1/2 right-3 sm:right-4 -translate-y-1/2 z-20 inline-flex items-center justify-center w-9 h-9 rounded-full bg-background/90 backdrop-blur-md text-foreground shadow-md hover:scale-105 active:scale-95 transition-transform"
        >
          <Shuffle className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

/* ---------------- SVG variants ---------------- */

function Wave({ brandColor, flip }: { brandColor: string; flip: boolean }) {
  return (
    <svg viewBox="0 0 1440 140" preserveAspectRatio="none" className="absolute inset-0 w-full h-full" style={{ transform: flip ? "scaleY(-1)" : undefined }}>
      <defs>
        <linearGradient id="wv" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={brandColor} stopOpacity="0.18" />
          <stop offset="50%" stopColor={brandColor} stopOpacity="0.32" />
          <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity="0.18" />
        </linearGradient>
      </defs>
      <path d="M0 70 C 240 10 480 130 720 70 S 1200 10 1440 70 L 1440 140 L 0 140 Z" fill="url(#wv)" />
      <path d="M0 90 C 240 40 480 140 720 90 S 1200 40 1440 90 L 1440 140 L 0 140 Z" fill={brandColor} fillOpacity="0.10" />
    </svg>
  );
}

function Curve({ brandColor, flip }: { brandColor: string; flip: boolean }) {
  return (
    <svg viewBox="0 0 1440 120" preserveAspectRatio="none" className="absolute inset-0 w-full h-full" style={{ transform: flip ? "scaleY(-1)" : undefined }}>
      <defs>
        <linearGradient id="cv" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={brandColor} stopOpacity="0.24" />
          <stop offset="100%" stopColor={brandColor} stopOpacity="0.08" />
        </linearGradient>
      </defs>
      <path d="M0 0 Q 720 160 1440 0 L 1440 120 L 0 120 Z" fill="url(#cv)" />
    </svg>
  );
}

function Diagonal({ brandColor, flip }: { brandColor: string; flip: boolean }) {
  return (
    <svg viewBox="0 0 1440 120" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
      <defs>
        <linearGradient id="dg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={brandColor} stopOpacity="0.28" />
          <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity="0.12" />
        </linearGradient>
      </defs>
      {flip ? (
        <polygon points="0,120 1440,0 1440,120" fill="url(#dg)" />
      ) : (
        <polygon points="0,0 1440,120 0,120" fill="url(#dg)" />
      )}
    </svg>
  );
}

function Blob({ brandColor, seed }: { brandColor: string; seed: number }) {
  const cx = 200 + Math.floor(seed * 1040);
  return (
    <svg viewBox="0 0 1440 160" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
      <defs>
        <radialGradient id="bb" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor={brandColor} stopOpacity="0.45" />
          <stop offset="60%" stopColor={brandColor} stopOpacity="0.15" />
          <stop offset="100%" stopColor={brandColor} stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx={cx} cy="80" rx="520" ry="70" fill="url(#bb)" />
      <ellipse cx={1440 - cx} cy="80" rx="380" ry="50" fill="url(#bb)" opacity="0.6" />
    </svg>
  );
}
