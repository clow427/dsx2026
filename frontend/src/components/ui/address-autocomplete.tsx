import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Loader2, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

type Suggestion = {
  display_name: string;
  lat: string;
  lon: string;
  place_id: number;
};

type Props = {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
};

/**
 * Free address autocomplete powered by OpenStreetMap Nominatim.
 * No API key required — works out-of-the-box for remixes and templates.
 * Respects Nominatim usage policy with debounce + minimum query length.
 */
export function AddressAutocomplete({ value, onChange, placeholder, className }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [highlight, setHighlight] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const skipNextFetchRef = useRef(false);

  // Debounced fetch
  useEffect(() => {
    if (skipNextFetchRef.current) {
      skipNextFetchRef.current = false;
      return;
    }
    const q = value.trim();
    if (q.length < 3) {
      setSuggestions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=6&q=${encodeURIComponent(q)}`,
          {
            signal: ctrl.signal,
            headers: { "Accept-Language": navigator.language || "en" },
          },
        );
        if (!res.ok) throw new Error("lookup failed");
        const data: Suggestion[] = await res.json();
        setSuggestions(data);
        setOpen(true);
        setHighlight(0);
      } catch {
        // Silent fail — user can still type freely
      } finally {
        setLoading(false);
      }
    }, 400);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [value]);

  // Close on outside click
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const select = (s: Suggestion) => {
    skipNextFetchRef.current = true;
    onChange(s.display_name);
    setOpen(false);
    setSuggestions([]);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight(h => (h + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight(h => (h - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      select(suggestions[highlight]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapperRef} className={cn("relative", className)}>
      <div className="relative">
        <Input
          value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          className="pr-9"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4 opacity-60" />}
        </div>
      </div>
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover shadow-md">
          <ul className="max-h-72 overflow-y-auto py-1">
            {suggestions.map((s, i) => (
              <li key={s.place_id}>
                <button
                  type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => select(s)}
                  onMouseEnter={() => setHighlight(i)}
                  className={cn(
                    "flex w-full items-start gap-2 px-3 py-2 text-left text-sm transition-colors",
                    i === highlight ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
                  )}
                >
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-60" />
                  <span className="line-clamp-2">{s.display_name}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="border-t border-border bg-muted/40 px-3 py-1.5 text-[10px] text-muted-foreground">
            Suggestions by OpenStreetMap
          </div>
        </div>
      )}
    </div>
  );
}
