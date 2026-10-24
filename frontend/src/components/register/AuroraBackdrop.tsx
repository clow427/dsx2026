import { motion } from "framer-motion";

interface Props {
  brandColor: string;
  isDark?: boolean;
  variant?: "full" | "soft";
}

/**
 * Animated aurora mesh-gradient backdrop.
 * Three drifting blobs in brand color + supporting hues, on a deep gradient base.
 * Uses radial-gradients + motion + a subtle film grain for premium feel.
 */
export function AuroraBackdrop({ brandColor, isDark = false, variant = "full" }: Props) {
  // Base canvas: deep indigo→violet for dark, soft cream for light.
  const base = isDark
    ? "radial-gradient(at 20% 0%, hsl(260 60% 12%) 0%, transparent 50%), radial-gradient(at 80% 100%, hsl(220 50% 8%) 0%, transparent 50%), linear-gradient(180deg, hsl(250 35% 6%), hsl(240 40% 4%))"
    : "radial-gradient(at 20% 0%, hsl(260 100% 97%) 0%, transparent 50%), radial-gradient(at 80% 100%, hsl(220 100% 97%) 0%, transparent 50%), linear-gradient(180deg, hsl(0 0% 100%), hsl(240 30% 98%))";

  const opacity = variant === "soft" ? (isDark ? 0.55 : 0.4) : (isDark ? 0.85 : 0.65);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      {/* Base gradient */}
      <div className="absolute inset-0" style={{ background: base }} />

      {/* Aurora blob 1 — brand color */}
      <motion.div
        className="absolute rounded-full blur-3xl"
        style={{
          width: "55vw",
          height: "55vw",
          maxWidth: 900,
          maxHeight: 900,
          background: `radial-gradient(circle, ${brandColor} 0%, transparent 65%)`,
          opacity,
          top: "-15%",
          left: "-10%",
          mixBlendMode: isDark ? "screen" : "multiply",
        }}
        animate={{
          x: [0, 60, -30, 0],
          y: [0, 40, -20, 0],
          scale: [1, 1.08, 0.95, 1],
        }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Aurora blob 2 — violet */}
      <motion.div
        className="absolute rounded-full blur-3xl"
        style={{
          width: "50vw",
          height: "50vw",
          maxWidth: 800,
          maxHeight: 800,
          background: "radial-gradient(circle, hsl(265 90% 70%) 0%, transparent 65%)",
          opacity: opacity * 0.75,
          bottom: "-20%",
          right: "-15%",
          mixBlendMode: isDark ? "screen" : "multiply",
        }}
        animate={{
          x: [0, -50, 30, 0],
          y: [0, -30, 20, 0],
          scale: [1, 1.1, 0.92, 1],
        }}
        transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Aurora blob 3 — cyan accent */}
      <motion.div
        className="absolute rounded-full blur-3xl"
        style={{
          width: "40vw",
          height: "40vw",
          maxWidth: 650,
          maxHeight: 650,
          background: "radial-gradient(circle, hsl(190 95% 65%) 0%, transparent 70%)",
          opacity: opacity * 0.55,
          top: "30%",
          left: "40%",
          mixBlendMode: isDark ? "screen" : "multiply",
        }}
        animate={{
          x: [0, 40, -40, 0],
          y: [0, 50, -30, 0],
          scale: [1, 1.12, 0.9, 1],
        }}
        transition={{ duration: 30, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Subtle grain for premium texture */}
      <svg className="absolute inset-0 w-full h-full opacity-[0.035] mix-blend-overlay">
        <filter id="aurora-noise">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.6 0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#aurora-noise)" />
      </svg>

      {/* Top vignette to keep text readable */}
      {isDark && (
        <div className="absolute inset-0" style={{
          background: "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.35) 100%)",
        }} />
      )}
    </div>
  );
}

/**
 * Glass card — frosted, layered, gradient-ring border. Drop-in for <Card>.
 */
export function GlassCard({
  children,
  className = "",
  isDark = false,
  brandColor,
}: {
  children: React.ReactNode;
  className?: string;
  isDark?: boolean;
  brandColor?: string;
}) {
  // Gradient ring uses brand color when provided; falls back to a neutral chrome.
  const ring = brandColor
    ? `linear-gradient(140deg, ${brandColor}80, hsl(265 90% 70% / 0.5), hsl(190 95% 65% / 0.45))`
    : "linear-gradient(140deg, hsl(0 0% 100% / 0.6), hsl(0 0% 100% / 0.1))";

  return (
    <div
      className={`relative rounded-3xl p-[1.5px] ${className}`}
      style={{ background: ring, boxShadow: isDark
        ? "0 30px 80px -20px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04) inset"
        : "0 30px 80px -20px rgba(15, 10, 31, 0.25), 0 8px 20px -8px rgba(15, 10, 31, 0.12)" }}
    >
      <div
        className="rounded-[calc(1.5rem-1.5px)] backdrop-blur-2xl"
        style={{
          background: isDark
            ? "linear-gradient(160deg, hsl(250 35% 12% / 0.85), hsl(240 40% 8% / 0.92))"
            : "linear-gradient(160deg, hsl(0 0% 100% / 0.85), hsl(0 0% 100% / 0.7))",
        }}
      >
        {children}
      </div>
    </div>
  );
}
