interface LogoProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizes = {
  sm: { glyph: "w-6 h-6", text: "text-lg" },
  md: { glyph: "w-8 h-8", text: "text-[22px]" },
  lg: { glyph: "w-10 h-10", text: "text-2xl" },
};

/** Six connected nodes — the "six degrees" glyph. */
function LogoGlyph({ className }: { className: string }) {
  const pts = [
    [16, 4], [27, 10], [27, 22], [16, 28], [5, 22], [5, 10],
  ];
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      {pts.map(([x, y], i) => (
        <line key={`l${i}`} x1={16} y1={16} x2={x} y2={y} stroke="hsl(var(--primary))" strokeWidth="1.6" strokeLinecap="round" opacity="0.55" />
      ))}
      {pts.map(([x, y], i) => (
        <circle key={`c${i}`} cx={x} cy={y} r={3.2} fill="hsl(var(--primary))" />
      ))}
      <circle cx={16} cy={16} r={4.6} fill="hsl(var(--foreground))" />
    </svg>
  );
}

export function Logo({ size = "md", className = "" }: LogoProps) {
  const s = sizes[size];
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <LogoGlyph className={s.glyph} />
      <span className={`font-display font-bold text-primary tracking-tight ${s.text}`}>
        6degrees
      </span>
    </span>
  );
}
