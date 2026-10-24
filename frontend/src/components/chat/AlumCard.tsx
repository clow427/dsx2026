import { ExternalLink, Check } from "lucide-react";
import type { FoundAlum } from "@/lib/chatStore";
import { initials } from "@/lib/alumniGraph";

const tints = ["bg-primary/10 text-primary", "bg-success/15 text-success", "bg-warning/20 text-warning", "bg-secondary text-secondary-foreground"];

export function AlumCard({ alum, index = 0, compact = false }: { alum: FoundAlum; index?: number; compact?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-card text-card-foreground p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className={`w-11 h-11 shrink-0 rounded-full flex items-center justify-center font-display font-bold text-sm ${tints[index % tints.length]}`}>
          {initials(alum.name) || alum.name.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold text-foreground leading-tight truncate">{alum.name}</p>
            <a
              href={alum.url}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              aria-label={`Open ${alum.name} on LinkedIn`}
            >
              LinkedIn <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          {alum.headline && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{alum.headline}</p>}
          {alum.connection && (
            <span className="inline-block mt-2 text-xs font-semibold text-primary bg-primary/10 rounded-full px-2.5 py-0.5 leading-snug">
              {alum.connection}
            </span>
          )}
        </div>
      </div>
      {!compact && alum.reasons.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {alum.reasons.map((r, i) => (
            <li key={i} className="flex gap-2 text-sm text-foreground/90 leading-snug">
              <Check className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
              <span>{r}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
