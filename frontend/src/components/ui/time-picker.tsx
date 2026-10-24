import { useMemo, useRef, useEffect, useState } from "react";
import { Clock, Sparkles } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  value: string; // "HH:MM" 24h, or ""
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  /** When provided, popover shows duration-based suggestions relative to this start time (HH:MM 24h). */
  startTime?: string;
};

const PRESETS = ["08:00", "09:00", "10:00", "12:00", "14:00", "17:00", "18:00", "19:00"];

const DURATION_OFFSETS: { mins: number; label: string }[] = [
  { mins: 30, label: "30 min" },
  { mins: 60, label: "1 hr" },
  { mins: 90, label: "1.5 hr" },
  { mins: 120, label: "2 hr" },
  { mins: 180, label: "3 hr" },
  { mins: 240, label: "4 hr" },
  { mins: 360, label: "6 hr" },
  { mins: 480, label: "8 hr" },
];

function to12(value: string): { h: number; m: number; period: "AM" | "PM" } | null {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return null;
  const [hStr, mStr] = value.split(":");
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  const period: "AM" | "PM" = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return { h, m, period };
}

function to24(h: number, m: number, period: "AM" | "PM"): string {
  let H = h % 12;
  if (period === "PM") H += 12;
  return `${String(H).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function toMinutes(value: string): number | null {
  if (!/^\d{2}:\d{2}$/.test(value)) return null;
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

function fromMinutes(total: number): string {
  const wrapped = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function formatLabel(value: string): string {
  const t = to12(value);
  if (!t) return "";
  return `${t.h}:${String(t.m).padStart(2, "0")} ${t.period}`;
}

function formatDuration(mins: number): string {
  if (mins <= 0) return "";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return h === 1 ? "1 hr" : `${h} hr`;
  return `${h}h ${m}m`;
}

export function TimePicker({ value, onChange, placeholder = "Select time", className, startTime }: Props) {
  const [open, setOpen] = useState(false);
  const parsed = to12(value);
  const hour = parsed?.h ?? 9;
  const minute = parsed?.m ?? 0;
  const period: "AM" | "PM" = parsed?.period ?? "AM";

  const hours = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), []);
  const minutes = useMemo(() => [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55], []);

  const set = (h: number, m: number, p: "AM" | "PM") => onChange(to24(h, m, p));

  const hourRef = useRef<HTMLDivElement>(null);
  const minRef = useRef<HTMLDivElement>(null);

  const startMins = startTime ? toMinutes(startTime) : null;
  const valueMins = value ? toMinutes(value) : null;
  const currentDuration =
    startMins !== null && valueMins !== null
      ? ((valueMins - startMins + 24 * 60) % (24 * 60))
      : null;

  const suggestions = useMemo(() => {
    if (startMins === null) return [];
    return DURATION_OFFSETS.map(({ mins, label }) => ({
      time: fromMinutes(startMins + mins),
      mins,
      label,
    }));
  }, [startMins]);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => {
      const hEl = hourRef.current?.querySelector<HTMLButtonElement>('[data-active="true"]');
      const mEl = minRef.current?.querySelector<HTMLButtonElement>('[data-active="true"]');
      hEl?.scrollIntoView({ block: "center" });
      mEl?.scrollIntoView({ block: "center" });
    });
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-11 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-base md:text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-colors hover:bg-accent/40",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate flex items-center gap-2">
            <span>{value ? formatLabel(value) : placeholder}</span>
            {currentDuration !== null && currentDuration > 0 && (
              <span className="text-[11px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                {formatDuration(currentDuration)}
              </span>
            )}
          </span>
          <Clock className="h-4 w-4 opacity-60 shrink-0 ml-2" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-3" align="start">
        {suggestions.length > 0 ? (
          <div className="mb-2">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Sparkles className="h-3 w-3 text-primary" />
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                After {formatLabel(startTime!)}
              </div>
            </div>
            <div className="flex flex-wrap gap-1">
              {suggestions.map(s => {
                const active = value === s.time;
                return (
                  <button
                    key={s.mins}
                    type="button"
                    onClick={() => { onChange(s.time); setOpen(false); }}
                    className={cn(
                      "group px-2.5 py-1 rounded-full text-xs transition-colors flex items-center gap-1.5",
                      active
                        ? "bg-foreground text-background"
                        : "bg-muted hover:bg-primary/10 text-foreground",
                    )}
                  >
                    <span className="font-medium">+{s.label}</span>
                    <span className={cn(
                      "tabular-nums opacity-70",
                      active ? "" : "group-hover:opacity-100",
                    )}>
                      {formatLabel(s.time)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="mb-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Quick pick</div>
            <div className="flex flex-wrap gap-1">
              {PRESETS.map(p => {
                const active = value === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => { onChange(p); setOpen(false); }}
                    className={cn(
                      "px-2.5 py-1 rounded-full text-xs transition-colors",
                      active ? "bg-foreground text-background" : "bg-muted hover:bg-muted/70 text-foreground",
                    )}
                  >
                    {formatLabel(p)}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-[1fr_1fr_auto] gap-2 pt-2 border-t border-border">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1 text-center">Hour</div>
            <div ref={hourRef} className="h-40 overflow-y-auto rounded-md bg-muted/40 py-1 scrollbar-thin">
              {hours.map(h => {
                const active = parsed ? h === hour : false;
                return (
                  <button
                    key={h}
                    type="button"
                    data-active={active}
                    onClick={() => set(h, minute, period)}
                    className={cn(
                      "block w-full py-1.5 text-sm tabular-nums transition-colors",
                      active ? "bg-foreground text-background font-medium" : "hover:bg-accent",
                    )}
                  >
                    {h}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1 text-center">Min</div>
            <div ref={minRef} className="h-40 overflow-y-auto rounded-md bg-muted/40 py-1 scrollbar-thin">
              {minutes.map(m => {
                const active = parsed ? m === minute : false;
                return (
                  <button
                    key={m}
                    type="button"
                    data-active={active}
                    onClick={() => set(hour, m, period)}
                    className={cn(
                      "block w-full py-1.5 text-sm tabular-nums transition-colors",
                      active ? "bg-foreground text-background font-medium" : "hover:bg-accent",
                    )}
                  >
                    {String(m).padStart(2, "0")}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex flex-col gap-1 justify-start pt-5">
            {(["AM", "PM"] as const).map(p => {
              const active = period === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => set(hour, minute, p)}
                  className={cn(
                    "px-3 py-2 rounded-md text-sm font-medium transition-colors",
                    active ? "bg-foreground text-background" : "bg-muted hover:bg-muted/70",
                  )}
                >
                  {p}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex justify-between items-center mt-3 pt-2 border-t border-border">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => { onChange(""); setOpen(false); }}
            >
              Clear
            </Button>
            {currentDuration !== null && currentDuration > 0 && (
              <span className="text-[11px] text-muted-foreground">
                Duration: <span className="font-medium text-foreground">{formatDuration(currentDuration)}</span>
              </span>
            )}
          </div>
          <Button
            type="button"
            size="sm"
            className="h-7 px-3 text-xs rounded-full"
            onClick={() => setOpen(false)}
          >
            Done
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
