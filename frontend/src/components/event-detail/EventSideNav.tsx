import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Layout, FormInput, Palette, Megaphone, Users,
  Settings as SettingsIcon, ChevronLeft, ChevronRight, ArrowLeft,
  Share2, QrCode, Trophy, BarChart3, ScanLine,
} from "lucide-react";

export type EventSection =
  | "overview" | "page" | "form" | "branding"
  | "promotion" | "attendees" | "checkin" | "settings";

interface SubItem {
  id: string; // DOM id to scroll to
  label: string;
  icon: any;
}

interface NavItem {
  key: EventSection;
  label: string;
  icon: any;
  subItems?: SubItem[];
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const PROMOTION_SUBS: SubItem[] = [
  { id: "promo-share", label: "Share formats", icon: Share2 },
  { id: "promo-qr", label: "Event QR code", icon: QrCode },
  { id: "promo-links", label: "Promoter links", icon: Trophy },
  { id: "promo-attribution", label: "Source attribution", icon: BarChart3 },
];

const GROUPS: NavGroup[] = [
  {
    label: "Build",
    items: [
      { key: "overview", label: "Overview", icon: LayoutDashboard },
      { key: "page", label: "Landing page", icon: Layout },
      { key: "form", label: "Tickets / Registration", icon: FormInput },
      { key: "branding", label: "Branding", icon: Palette },
    ],
  },
  {
    label: "Grow",
    items: [
      { key: "promotion", label: "Promotion", icon: Megaphone },
      { key: "attendees", label: "Attendees", icon: Users },
      { key: "checkin", label: "Check-in scanner", icon: ScanLine },
    ],
  },
  {
    label: "Configure",
    items: [
      { key: "settings", label: "Settings", icon: SettingsIcon },
    ],
  },
];

interface Props {
  active: EventSection;
  onChange: (s: EventSection) => void;
  attendeesCount?: number;
}

const STORAGE_KEY = "eventDetailSidebarCollapsed";

export default function EventSideNav({ active, onChange, attendeesCount }: Props) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  });
  const [activeSubId, setActiveSubId] = useState<string | null>(null);

  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0"); } catch {}
  }, [collapsed]);

  // Scrollspy for the active section's subitems
  useEffect(() => {
    const item = GROUPS.flatMap((g) => g.items).find((i) => i.key === active);
    const subs = item?.subItems;
    if (!subs || subs.length === 0) {
      setActiveSubId(null);
      return;
    }
    // Wait a tick for the section to mount
    const ids = subs.map((s) => s.id);
    let timeout: number | undefined;
    const setup = () => {
      const els = ids
        .map((id) => document.getElementById(id))
        .filter((el): el is HTMLElement => !!el);
      if (els.length === 0) {
        timeout = window.setTimeout(setup, 100);
        return;
      }
      setActiveSubId(els[0].id);
      const observer = new IntersectionObserver(
        (entries) => {
          // pick the entry closest to top that is intersecting
          const visible = entries
            .filter((e) => e.isIntersecting)
            .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
          if (visible[0]) setActiveSubId(visible[0].target.id);
        },
        { rootMargin: "-20% 0px -60% 0px", threshold: 0 },
      );
      els.forEach((el) => observer.observe(el));
      cleanup = () => observer.disconnect();
    };
    let cleanup: (() => void) | undefined;
    setup();
    return () => {
      if (timeout) window.clearTimeout(timeout);
      cleanup?.();
    };
  }, [active]);

  const scrollToSub = (id: string) => {
    setActiveSubId(id);
    // Let the section owner switch tabs / expand panels if needed.
    window.dispatchEvent(new CustomEvent("promo-nav", { detail: id }));
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  // Flatten items for the mobile horizontal nav
  const flatItems = GROUPS.flatMap((g) => g.items);

  return (
    <>
      {/* Mobile: horizontal scroll pill bar */}
      <div className="md:hidden -mx-4 sm:-mx-6 px-4 sm:px-6 overflow-x-auto scrollbar-none">
        <div className="flex items-center gap-1.5 min-w-max pb-1">
          {flatItems.map((it) => {
            const Icon = it.icon;
            const isActive = active === it.key;
            const showBadge = it.key === "attendees" && typeof attendeesCount === "number" && attendeesCount > 0;
            return (
              <button
                key={it.key}
                type="button"
                onClick={() => onChange(it.key)}
                className={cn(
                  "flex items-center gap-2 h-10 px-4 rounded-full text-sm font-medium transition-colors whitespace-nowrap shrink-0",
                  isActive
                    ? "bg-foreground text-background"
                    : "bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{it.label}</span>
                {showBadge && (
                  <span className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded-full font-semibold tabular-nums",
                    isActive ? "bg-background/20 text-background" : "bg-muted text-muted-foreground",
                  )}>
                    {attendeesCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Desktop: vertical sidebar */}
      <aside
        className={cn(
          "hidden md:block shrink-0 sticky top-4 self-start transition-[width] duration-200 ease-out",
          collapsed ? "w-14" : "w-56",
        )}
      >
        <div className="bg-card rounded-2xl p-2 space-y-1">
          {/* Back link */}
          <Link
            to="/dashboard/events"
            className={cn(
              "flex items-center gap-2 px-3 h-10 rounded-full text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors",
              collapsed && "justify-center px-0",
            )}
            title="Back to events"
          >
            <ArrowLeft className="w-4 h-4 shrink-0" />
            {!collapsed && <span>All events</span>}
          </Link>

          <div className="h-px bg-border/50 my-1" />

          {GROUPS.map((g, gi) => (
            <div key={g.label} className={cn(gi > 0 && "pt-2")}>
              {!collapsed && (
                <p className="px-3 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  {g.label}
                </p>
              )}
              {g.items.map((it) => {
                const Icon = it.icon;
                const isActive = active === it.key;
                const showBadge = it.key === "attendees" && typeof attendeesCount === "number" && attendeesCount > 0;
                const showSubs = isActive && !collapsed && it.subItems && it.subItems.length > 0;
                return (
                  <div key={it.key}>
                    <button
                      type="button"
                      onClick={() => onChange(it.key)}
                      title={collapsed ? it.label : undefined}
                      className={cn(
                        "w-full flex items-center gap-2.5 h-10 rounded-full text-sm font-medium transition-colors",
                        collapsed ? "justify-center px-0" : "px-3",
                        isActive
                          ? "bg-foreground text-background"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
                      )}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      {!collapsed && <span className="flex-1 text-left truncate">{it.label}</span>}
                      {!collapsed && showBadge && (
                        <span className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded-full font-semibold tabular-nums",
                          isActive ? "bg-background/20 text-background" : "bg-muted text-muted-foreground",
                        )}>
                          {attendeesCount}
                        </span>
                      )}
                    </button>
                    {showSubs && (
                      <div className="mt-1 mb-1 ml-3 pl-3 border-l border-border/60 space-y-0.5 animate-in fade-in slide-in-from-top-1 duration-200">
                        {it.subItems!.map((s) => {
                          const SIcon = s.icon;
                          const isSubActive = activeSubId === s.id;
                          return (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => scrollToSub(s.id)}
                              className={cn(
                                "w-full flex items-center gap-2 h-8 px-2.5 rounded-full text-xs font-medium transition-colors",
                                isSubActive
                                  ? "bg-muted text-foreground"
                                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                              )}
                            >
                              <SIcon className="w-3.5 h-3.5 shrink-0" />
                              <span className="flex-1 text-left truncate">{s.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          <div className="h-px bg-border/50 my-1" />

          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className={cn(
              "w-full flex items-center gap-2 h-10 rounded-full text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors",
              collapsed ? "justify-center px-0" : "px-3",
            )}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <><ChevronLeft className="w-4 h-4" /><span>Collapse</span></>}
          </button>
        </div>
      </aside>
    </>
  );
}
