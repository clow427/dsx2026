import { AlertTriangle, BadgeCheck, CircleHelp, ExternalLink, FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";
import { CONFIDENCE_LABEL, DERIVATION_HELP, DERIVATION_LABEL, NODE_STYLE, NODE_TYPE_LABEL, SOURCE_LABEL, STATUS_HELP, STATUS_LABEL } from "@/lib/graphLabels";
import type { BuStatus, Confidence, Derivation, NodeType, SourceRef } from "@/types/graph";

const STATUS_TONE: Record<BuStatus, string> = {
  verified_alumnus: "bg-success/10 text-success border-success/30",
  bu_affiliated_researcher: "bg-primary/10 text-primary border-primary/30",
  unverified: "bg-muted text-muted-foreground border-border",
  ambiguous: "bg-warning/15 text-[hsl(38,80%,32%)] border-warning/40",
};

const STATUS_ICON: Record<BuStatus, typeof BadgeCheck> = {
  verified_alumnus: BadgeCheck,
  bu_affiliated_researcher: FlaskConical,
  unverified: CircleHelp,
  ambiguous: AlertTriangle,
};

export function AffiliationBadge({ status, className }: { status: BuStatus; className?: string }) {
  const Icon = STATUS_ICON[status];
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold", STATUS_TONE[status], className)}
      title={STATUS_HELP[status]}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {STATUS_LABEL[status]}
    </span>
  );
}

const CONF_TONE: Record<Confidence, string> = {
  high: "border-solid border-success/40 text-success",
  medium: "border-dashed border-warning/60 text-[hsl(38,80%,32%)]",
  low: "border-dotted border-destructive/60 text-destructive",
};

/** Border style (solid / dashed / dotted) mirrors the edge line style on the canvas. */
export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border-2 px-2 py-0.5 text-[11px] font-semibold", CONF_TONE[confidence])}>
      {CONFIDENCE_LABEL[confidence]}
      {confidence === "low" && <span className="ml-1">· flagged</span>}
    </span>
  );
}

export function DerivationBadge({ derivation }: { derivation: Derivation }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-semibold text-foreground/80" title={DERIVATION_HELP[derivation]}>
      {DERIVATION_LABEL[derivation]}
    </span>
  );
}

export function NodeTypeGlyph({ type, className }: { type: NodeType; className?: string }) {
  const { color } = NODE_STYLE[type];
  const common = { fill: color, stroke: "white", strokeWidth: 1.5 };
  const shape = {
    person: <circle cx="8" cy="8" r="6.5" {...common} />,
    publication: <rect x="2" y="2" width="12" height="12" {...common} />,
    patent: <polygon points="8,1 15,8 8,15 1,8" {...common} />,
    award: <polygon points="4.5,1.5 11.5,1.5 15,8 11.5,14.5 4.5,14.5 1,8" {...common} />,
    organization: <rect x="2" y="2" width="12" height="12" rx="3.5" {...common} />,
    topic: <polygon points="1,3 11,3 15,8 11,13 1,13" {...common} />,
  }[type];
  return (
    <svg viewBox="0 0 16 16" className={cn("h-3.5 w-3.5 shrink-0", className)} role="img" aria-label={NODE_TYPE_LABEL[type].one}>
      {shape}
    </svg>
  );
}

export function SourceLink({ source, compact = false }: { source: SourceRef; compact?: boolean }) {
  const isMock = source.note?.startsWith("MOCK");
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group inline-flex items-start gap-1.5 text-sm text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
    >
      <ExternalLink className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0">
        <span className="font-semibold">{SOURCE_LABEL[source.source] ?? source.source}</span>
        {source.record_id && <span className="text-muted-foreground font-mono text-xs"> · {source.record_id}</span>}
        {!compact && source.note && <span className={cn("block text-xs", isMock ? "text-warning" : "text-muted-foreground")}>{source.note}</span>}
        <span className="sr-only"> (opens in a new tab)</span>
      </span>
    </a>
  );
}
