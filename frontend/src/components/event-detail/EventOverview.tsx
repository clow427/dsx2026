import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Tables } from "@/integrations/supabase/types";
import { useRegistrationsByEvent } from "@/hooks/useRegistrations";
import { useFormFields } from "@/hooks/useFormFields";
import { useEventModules } from "@/hooks/useEventModules";
import { useUpdateEvent } from "@/hooks/useEvents";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Users,
  TrendingUp,
  Clock,
  CheckCircle2,
  Circle,
  ArrowRight,
  Copy,
  ExternalLink,
  Share2,
  Loader2,
  Pencil,
  Check,
  X,
} from "lucide-react";
import { format, formatDistanceToNow, differenceInDays, subDays, startOfDay, isAfter } from "date-fns";
import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { getRegistrationUrl, getPublicOrigin } from "@/lib/publicUrl";
import { copyToClipboard } from "@/lib/clipboard";
import { toast } from "sonner";

interface Props {
  event: Tables<"events">;
  onJumpTab: (tab: string) => void;
}

export default function EventOverview({ event, onJumpTab }: Props) {
  const { data: registrations, isLoading } = useRegistrationsByEvent(event.id);
  const { data: formFields } = useFormFields(event.id);
  const { data: modules } = useEventModules(event.id);
  const updateEvent = useUpdateEvent();
  const [editingSlug, setEditingSlug] = useState(false);
  const [slugDraft, setSlugDraft] = useState(event.slug);

  const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

  const handleSaveSlug = async () => {
    const next = slugify(slugDraft);
    if (!next) { toast.error("Link can't be empty"); return; }
    if (next === event.slug) { setEditingSlug(false); return; }
    try {
      await updateEvent.mutateAsync({ id: event.id, slug: next });
      toast.success("Link updated");
      setEditingSlug(false);
    } catch (e: any) {
      toast.error(e?.message?.includes("duplicate") ? "That link is already taken" : "Couldn't update link");
    }
  };

  const stats = useMemo(() => {
    const regs = registrations ?? [];
    const active = regs.filter((r) => r.status !== "cancelled");
    const weekAgo = subDays(new Date(), 7);
    const thisWeek = active.filter((r) => isAfter(new Date(r.created_at), weekAgo)).length;
    const checkedIn = regs.filter((r) => r.status === "checked_in" || r.checked_in_at).length;
    const waitlisted = regs.filter((r) => r.status === "waitlisted").length;

    // 14-day trend
    const days = Array.from({ length: 14 }, (_, i) => {
      const d = startOfDay(subDays(new Date(), 13 - i));
      return { date: d, label: format(d, "MMM d"), count: 0 };
    });
    active.forEach((r) => {
      const day = startOfDay(new Date(r.created_at));
      const idx = days.findIndex((x) => x.date.getTime() === day.getTime());
      if (idx >= 0) days[idx].count += 1;
    });

    const daysToEvent = event.event_date ? differenceInDays(new Date(event.event_date), new Date()) : null;

    return {
      total: active.length,
      thisWeek,
      checkedIn,
      waitlisted,
      trend: days,
      recent: active.slice(0, 5),
      daysToEvent,
    };
  }, [registrations, event.event_date]);

  const checklist = useMemo(() => {
    const items = [
      { key: "name", label: "Set event name", done: !!event.name?.trim(), tab: null },
      { key: "date", label: "Set event date & time", done: !!event.event_date, tab: null },
      { key: "location", label: "Add location or virtual link", done: !!event.location_value?.trim(), tab: null },
      { key: "description", label: "Write a description", done: !!event.description?.trim(), tab: null },
      { key: "image", label: "Add a cover image", done: !!event.background_image_url, tab: null },
      { key: "fields", label: "Customize registration form", done: (formFields?.length ?? 0) > 0, tab: "form" },
      { key: "page", label: "Build event page sections", done: (modules?.length ?? 0) > 0, tab: "page" },
      { key: "live", label: "Publish event (set Live)", done: event.status === "live", tab: null },
    ];
    return items;
  }, [event, formFields, modules]);

  const completed = checklist.filter((i) => i.done).length;
  const progress = Math.round((completed / checklist.length) * 100);

  const capacity = event.capacity ?? null;
  const capacityPct = capacity ? Math.min(100, Math.round((stats.total / capacity) * 100)) : null;

  const handleCopyLink = async () => {
    const ok = await copyToClipboard(getRegistrationUrl(event.slug));
    toast[ok ? "success" : "error"](ok ? "Registration link copied" : "Couldn't copy — select and copy manually.");
  };

  return (
    <div className="space-y-5">
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={<Users className="w-4 h-4" />}
          label="Registered"
          value={isLoading ? "—" : stats.total.toString()}
          sub={capacity ? `of ${capacity}` : "no cap"}
        />
        <KpiCard
          icon={<TrendingUp className="w-4 h-4" />}
          label="This week"
          value={isLoading ? "—" : `+${stats.thisWeek}`}
          sub="last 7 days"
        />
        <KpiCard
          icon={<CheckCircle2 className="w-4 h-4" />}
          label="Checked in"
          value={isLoading ? "—" : stats.checkedIn.toString()}
          sub={stats.waitlisted > 0 ? `${stats.waitlisted} waitlisted` : "—"}
        />
        <KpiCard
          icon={<Clock className="w-4 h-4" />}
          label={stats.daysToEvent !== null && stats.daysToEvent < 0 ? "Days since" : "Days to go"}
          value={
            stats.daysToEvent === null
              ? "—"
              : stats.daysToEvent === 0
                ? "Today"
                : Math.abs(stats.daysToEvent).toString()
          }
          sub={event.event_date ? format(new Date(event.event_date), "MMM d, yyyy") : "no date set"}
        />
      </div>

      {/* Capacity bar */}
      {capacity && (
        <div className="bg-card rounded-xl p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Capacity</span>
            <span className="text-xs text-muted-foreground">
              {stats.total} / {capacity} ({capacityPct}%)
            </span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                capacityPct! >= 100 ? "bg-destructive" : capacityPct! >= 80 ? "bg-amber-500" : "bg-primary"
              }`}
              style={{ width: `${capacityPct}%` }}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Trend */}
        <div className="lg:col-span-2 bg-card rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-semibold text-sm">Registrations · last 14 days</h3>
            <span className="text-xs text-muted-foreground">{stats.total} total</span>
          </div>
          <div className="h-44">
            {isLoading ? (
              <div className="h-full flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.trend} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="regGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                    interval={2}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "none",
                      borderRadius: 12,
                      fontSize: 12,
                      boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
                    }}
                    labelStyle={{ color: "hsl(var(--muted-foreground))", fontSize: 11 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="url(#regGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Setup checklist */}
        <div className="bg-card rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display font-semibold text-sm">Setup checklist</h3>
            <span className="text-xs font-medium text-muted-foreground">
              {completed}/{checklist.length}
            </span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-4">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <ul className="space-y-2">
            {checklist.map((item) => (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={() => item.tab && onJumpTab(item.tab)}
                  disabled={!item.tab}
                  className={`w-full flex items-center gap-2.5 text-left text-sm py-1.5 rounded-lg ${
                    item.tab && !item.done ? "hover:bg-muted/60 px-2 -mx-2" : ""
                  }`}
                >
                  {item.done ? (
                    <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                  ) : (
                    <Circle className="w-4 h-4 text-muted-foreground/40 shrink-0" />
                  )}
                  <span className={item.done ? "line-through text-muted-foreground" : ""}>
                    {item.label}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Recent registrations */}
        <div className="lg:col-span-2 bg-card rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-semibold text-sm">Recent registrations</h3>
            {stats.total > 5 && (
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                onClick={() => onJumpTab("attendees")}
              >
                View all <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>
          {isLoading ? (
            <div className="py-6 flex justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : stats.recent.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No registrations yet. Share your event to start collecting sign-ups.
            </div>
          ) : (
            <ul className="space-y-2.5">
              {stats.recent.map((r) => {
                const data = (r.data ?? {}) as Record<string, string>;
                const name =
                  data["Full Name"] || data["Name"] || data["name"] || data["Email Address"] || data["email"] || "Anonymous";
                const email = data["Email Address"] || data["email"] || data["Email"] || "";
                const initials = String(name).slice(0, 2).toUpperCase();
                return (
                  <li key={r.id} className="flex items-center gap-3 py-1.5">
                    <div className="w-8 h-8 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center shrink-0">
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{name}</p>
                      {email && email !== name && (
                        <p className="text-xs text-muted-foreground truncate">{email}</p>
                      )}
                    </div>
                    {r.status === "waitlisted" && (
                      <Badge variant="outline" className="text-[10px] rounded-full">Waitlist</Badge>
                    )}
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Quick share */}
        <div className="bg-card rounded-xl p-5">
          <h3 className="font-display font-semibold text-sm mb-3">Share your event</h3>
          {event.status !== "live" ? (
            <p className="text-xs text-muted-foreground mb-4">
              Publish your event to start sharing. Link will be public once live.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mb-4">
              Your event is live. Copy the link or open the share kit.
            </p>
          )}
          <div className="space-y-2">
            {editingSlug ? (
              <div className="space-y-2">
                <div className="flex items-center gap-1 bg-muted/50 rounded-full pl-3 pr-1 py-1">
                  <span className="text-xs text-muted-foreground shrink-0 truncate max-w-[55%]">{getPublicOrigin().replace(/^https?:\/\//, "")}/register/</span>
                  <Input
                    autoFocus
                    value={slugDraft}
                    onChange={(e) => setSlugDraft(e.target.value)}
                    onBlur={(e) => setSlugDraft(slugify(e.target.value))}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSaveSlug(); if (e.key === "Escape") { setSlugDraft(event.slug); setEditingSlug(false); } }}
                    className="h-6 text-xs rounded-full border-0 bg-background px-2 flex-1 min-w-0"
                  />
                  <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={handleSaveSlug} disabled={updateEvent.isPending}>
                    {updateEvent.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  </Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => { setSlugDraft(event.slug); setEditingSlug(false); }}>
                    <X className="w-3 h-3" />
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground px-1">Lowercase, numbers, dashes only.</p>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => { setSlugDraft(event.slug); setEditingSlug(true); }}
                className="w-full bg-muted/50 hover:bg-muted rounded-full px-3 py-2 text-xs text-muted-foreground flex items-center gap-2 group transition-colors"
                title="Click to customize your link"
              >
                <span className="truncate flex-1 text-left">{getRegistrationUrl(event.slug)}</span>
                <Pencil className="w-3 h-3 shrink-0 opacity-50 group-hover:opacity-100" />
              </button>
            )}
            <Button onClick={handleCopyLink} variant="outline" size="sm" className="w-full rounded-full">
              <Copy className="w-3.5 h-3.5 mr-2" /> Copy link
            </Button>
            <Button asChild variant="outline" size="sm" className="w-full rounded-full">
              <Link to={`/register/${event.slug}`} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-3.5 h-3.5 mr-2" /> Preview as attendee
              </Link>
            </Button>
            <Button onClick={() => onJumpTab("promotion")} size="sm" className="w-full rounded-full">
              <Share2 className="w-3.5 h-3.5 mr-2" /> Open share kit
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="bg-card rounded-xl p-4 sm:p-5">
      <div className="flex items-center gap-2 text-muted-foreground mb-2">
        {icon}
        <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-3xl font-display font-bold leading-none">{value}</div>
      <div className="text-xs text-muted-foreground mt-1.5">{sub}</div>
    </div>
  );
}
