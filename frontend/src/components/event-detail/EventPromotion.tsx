import { useEffect, useMemo, useState } from "react";
import { useRegistrationsByEvent } from "@/hooks/useRegistrations";
import {
  useTrackingLinks,
  useCreateTrackingLink,
  useUpdateTrackingLink,
  useDeleteTrackingLink,
  type TrackingLink,
} from "@/hooks/useTrackingLinks";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Copy, Check, BarChart3, Share2, Plus, QrCode, Trophy, Pencil, Trash2,
  MousePointerClick, Users, TrendingUp, Download,
} from "lucide-react";
import { toast } from "sonner";
import { getRegistrationUrl, REGISTRATION_VARIANTS, type RegistrationVariant } from "@/lib/publicUrl";
import QRCode from "qrcode";
import EventQRCode from "@/components/event-detail/EventQRCode";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { copyToClipboard } from "@/lib/clipboard";

interface Props {
  eventSlug: string;
  eventId: string;
  eventName: string;
}

const SOURCE_PRESETS = ["paid", "internal", "partner", "organic", "social", "email", "other"];
const MEDIUM_PRESETS = ["cpc", "newsletter", "post", "story", "referral", "qr", "sms", "other"];

const slugify = (s: string) =>
  s.toLowerCase().trim()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

function buildLinkUrl(slug: string, link: TrackingLink): string {
  const base = getRegistrationUrl(slug);
  const params = new URLSearchParams();
  params.set("ref", link.code);
  params.set("lid", link.id);
  const u: any = link.utm || {};
  if (u.source) params.set("utm_source", u.source);
  if (u.medium) params.set("utm_medium", u.medium);
  if (u.campaign) params.set("utm_campaign", u.campaign);
  if (u.content) params.set("utm_content", u.content);
  if (u.term) params.set("utm_term", u.term);
  return `${base}?${params.toString()}`;
}

type Tab = "share" | "links" | "insights";

const TAB_FOR_ID: Record<string, Tab> = {
  "promo-share": "share",
  "promo-qr": "share",
  "promo-links": "links",
  "promo-attribution": "insights",
};

export default function EventPromotion({ eventSlug, eventId, eventName }: Props) {
  const { data: registrations } = useRegistrationsByEvent(eventId);
  const { data: links = [] } = useTrackingLinks(eventId);
  const createLink = useCreateTrackingLink();
  const updateLink = useUpdateTrackingLink();
  const deleteLink = useDeleteTrackingLink();

  const [tab, setTab] = useState<Tab>("share");
  const [copiedVariant, setCopiedVariant] = useState<RegistrationVariant | null>(null);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
  const [editingLink, setEditingLink] = useState<TrackingLink | null>(null);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [deletingLink, setDeletingLink] = useState<TrackingLink | null>(null);
  const [qrLink, setQrLink] = useState<TrackingLink | null>(null);



  // Side-subnav integration: it dispatches `promo-nav` with a section id.
  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      const next = TAB_FOR_ID[id];
      if (!next) return;
      setTab(next);
      // After tab transition mounts the section, scroll to it
      window.setTimeout(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
    };
    window.addEventListener("promo-nav", handler as EventListener);
    return () => window.removeEventListener("promo-nav", handler as EventListener);
  }, []);

  const copyVariant = async (v: RegistrationVariant) => {
    const ok = await copyToClipboard(getRegistrationUrl(eventSlug, v));
    if (!ok) return toast.error("Couldn't copy — select the link and copy manually.");
    setCopiedVariant(v);
    toast.success(`${v} link copied`);
    setTimeout(() => setCopiedVariant(null), 1500);
  };

  // ── Stats
  const linkStats = useMemo(() => {
    const rows = registrations ?? [];
    const byLid = new Map<string, number>();
    let untrackedCount = 0;
    rows.forEach((r) => {
      const u: any = (r as any).utm || {};
      const lid = u?.lid;
      if (lid) byLid.set(lid, (byLid.get(lid) ?? 0) + 1);
      else untrackedCount += 1;
    });
    const enriched = links.map((l) => {
      const regs = byLid.get(l.id) ?? 0;
      const clicks = l.click_count ?? 0;
      const conversion = clicks > 0 ? Math.round((regs / clicks) * 100) : 0;
      return { link: l, regs, clicks, conversion };
    });
    enriched.sort((a, b) => b.regs - a.regs || b.clicks - a.clicks);
    const totalClicks = links.reduce((sum, l) => sum + (l.click_count ?? 0), 0);
    const trackedRegs = rows.length - untrackedCount;
    const overallConv = totalClicks > 0 ? Math.round((trackedRegs / totalClicks) * 100) : 0;
    return {
      rows: enriched,
      untrackedCount,
      totalRegs: rows.length,
      totalClicks,
      overallConv,
      topPromoter: enriched[0],
    };
  }, [registrations, links]);

  const analytics = useMemo(() => {
    const rows = registrations ?? [];
    const total = rows.length;
    const bySource = new Map<string, number>();
    const byMedium = new Map<string, number>();
    const byCampaign = new Map<string, number>();
    rows.forEach((r) => {
      const u: any = (r as any).utm || {};
      const s = (u.source || "direct").toLowerCase();
      const m = (u.medium || "—").toLowerCase();
      const c = u.campaign || "—";
      bySource.set(s, (bySource.get(s) ?? 0) + 1);
      byMedium.set(m, (byMedium.get(m) ?? 0) + 1);
      byCampaign.set(c, (byCampaign.get(c) ?? 0) + 1);
    });
    const toSorted = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]);
    return { total, bySource: toSorted(bySource), byMedium: toSorted(byMedium), byCampaign: toSorted(byCampaign) };
  }, [registrations]);

  const Bar = ({ label, count, total }: { label: string; count: number; total: number }) => {
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium truncate pr-3">{label}</span>
          <span className="text-muted-foreground tabular-nums">{count} · {pct}%</span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-primary rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />
        </div>
      </div>
    );
  };

  const openCreateDialog = () => { setEditingLink(null); setLinkDialogOpen(true); };
  const openEditDialog = (l: TrackingLink) => { setEditingLink(l); setLinkDialogOpen(true); };

  const copyLink = async (l: TrackingLink) => {
    const ok = await copyToClipboard(buildLinkUrl(eventSlug, l));
    if (!ok) return toast.error("Couldn't copy — select the link and copy manually.");
    setCopiedLinkId(l.id);
    toast.success("Link copied");
    setTimeout(() => setCopiedLinkId(null), 1500);
  };

  const TABS: { id: Tab; label: string; icon: any; hint: string }[] = [
    { id: "share", label: "Share", icon: Share2, hint: "Send your event out" },
    { id: "links", label: "Promoter links", icon: Trophy, hint: "Track who's driving signups" },
    { id: "insights", label: "Insights", icon: BarChart3, hint: "See where traffic comes from" },
  ];

  return (
    <div className="space-y-5">
      {/* ── Stats hero strip ───────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatPill
          icon={Users}
          label="Registrations"
          value={linkStats.totalRegs}
          tint="from-primary/15 to-primary/5"
        />
        <StatPill
          icon={MousePointerClick}
          label="Tracked clicks"
          value={linkStats.totalClicks}
          tint="from-blue-500/15 to-blue-500/5"
        />
        <StatPill
          icon={TrendingUp}
          label="Conversion"
          value={`${linkStats.overallConv}%`}
          tint="from-emerald-500/15 to-emerald-500/5"
        />
        <StatPill
          icon={Trophy}
          label="Top promoter"
          value={linkStats.topPromoter?.link.label ?? "—"}
          subValue={linkStats.topPromoter ? `${linkStats.topPromoter.regs} regs` : "share to start"}
          tint="from-amber-500/15 to-amber-500/5"
          valueClassName="text-base truncate"
        />
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────── */}
      <div className="bg-card rounded-2xl p-1.5 flex flex-wrap gap-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "relative flex-1 min-w-[140px] flex items-center justify-center gap-2 h-11 px-4 rounded-full text-sm font-medium transition-colors",
                isActive ? "text-background" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="promo-tab-pill"
                  className="absolute inset-0 bg-foreground rounded-full"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                />
              )}
              <span className="relative flex items-center gap-2">
                <Icon className="w-4 h-4" />
                {t.label}
              </span>
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18 }}
          className="space-y-5"
        >
          {tab === "share" && (
            <>
              {/* Share formats */}
              <div id="promo-share" className="scroll-mt-24 bg-card rounded-2xl p-5 sm:p-6 space-y-4">
                <SectionHead
                  icon={Share2}
                  title="3 ways to share"
                  hint="Same event, different vibes — pick what fits."
                />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {REGISTRATION_VARIANTS.map((v) => {
                    const url = getRegistrationUrl(eventSlug, v.id);
                    const isCopied = copiedVariant === v.id;
                    return (
                      <div
                        key={v.id}
                        className="group relative bg-muted/40 hover:bg-muted/60 transition-colors rounded-2xl p-4 flex flex-col gap-3"
                      >
                        <div>
                          <p className="text-sm font-semibold">{v.label}</p>
                          <p className="text-xs text-muted-foreground leading-snug mt-0.5">{v.description}</p>
                        </div>
                        <div className="text-[11px] font-mono text-muted-foreground truncate bg-background/60 rounded-full px-3 py-1.5">
                          {url.replace(/^https?:\/\//, "")}
                        </div>
                        <div className="flex gap-2 mt-auto">
                          <Button variant="outline" size="sm" className="rounded-full flex-1 h-9" asChild>
                            <a href={url} target="_blank" rel="noopener noreferrer">Preview</a>
                          </Button>
                          <Button size="sm" className="rounded-full flex-1 h-9" onClick={() => copyVariant(v.id)}>
                            {isCopied ? <><Check className="w-3.5 h-3.5 mr-1" />Copied</> : <><Copy className="w-3.5 h-3.5 mr-1" />Copy</>}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* QR code */}
              <div id="promo-qr" className="scroll-mt-24">
                <EventQRCode registrationUrl={getRegistrationUrl(eventSlug)} eventName={eventName} />
              </div>
            </>
          )}

          {tab === "links" && (
            <>
              {/* Leaderboard */}
              <div id="promo-links" className="scroll-mt-24 bg-card rounded-2xl p-5 sm:p-6 space-y-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <SectionHead
                    icon={Trophy}
                    title="Promoter links"
                    hint="Give each person their own link. We'll rank them by signups."
                  />
                  <Button size="sm" className="rounded-full" onClick={openCreateDialog}>
                    <Plus className="w-3.5 h-3.5 mr-1" /> New link
                  </Button>
                </div>

                {linkStats.rows.length === 0 ? (
                  <EmptyState
                    icon={Trophy}
                    title="No promoter links yet"
                    body="Create one for every channel or person you're sharing with — we'll do the counting."
                    cta={<Button size="sm" className="rounded-full" onClick={openCreateDialog}><Plus className="w-3.5 h-3.5 mr-1" />Create your first link</Button>}
                  />
                ) : (
                  <div className="space-y-2">
                    {linkStats.rows.map((row, idx) => {
                      const url = buildLinkUrl(eventSlug, row.link);
                      const rank = idx + 1;
                      const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null;
                      return (
                        <motion.div
                          key={row.link.id}
                          layout
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={cn(
                            "rounded-2xl p-3.5 space-y-2.5 transition-colors",
                            rank === 1 ? "bg-gradient-to-r from-amber-500/10 to-amber-500/5" : "bg-muted/40",
                          )}
                        >
                          <div className="flex items-start gap-3 flex-wrap">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                {medal && <span className="text-base leading-none">{medal}</span>}
                                <span className="text-sm font-semibold leading-tight">{row.link.label}</span>
                                <Badge variant="outline" className="rounded-full font-mono text-[10px]">/{row.link.code}</Badge>
                              </div>
                              <p className="text-[11px] text-muted-foreground font-mono truncate mt-1">{url.replace(/^https?:\/\//, "")}</p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <IconBtn label="QR code" onClick={() => setQrLink(row.link)}><QrCode className="w-3.5 h-3.5" /></IconBtn>
                              <IconBtn label="Edit" onClick={() => openEditDialog(row.link)}><Pencil className="w-3.5 h-3.5" /></IconBtn>
                              <IconBtn label="Delete" onClick={() => setDeletingLink(row.link)}><Trash2 className="w-3.5 h-3.5" /></IconBtn>
                              <Button size="sm" className="rounded-full h-9" onClick={() => copyLink(row.link)}>
                                {copiedLinkId === row.link.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                              </Button>
                            </div>
                          </div>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground pl-1 flex-wrap">
                            <Stat icon={MousePointerClick} value={row.clicks} label="clicks" />
                            <Stat icon={Users} value={row.regs} label="regs" />
                            <Stat icon={TrendingUp} value={`${row.conversion}%`} label="conv" />
                          </div>
                        </motion.div>
                      );
                    })}
                    {linkStats.untrackedCount > 0 && (
                      <p className="text-xs text-muted-foreground pl-1 pt-1">
                        + {linkStats.untrackedCount} from untracked / direct traffic.
                      </p>
                    )}
                  </div>
                )}
              </div>

            </>
          )}

          {tab === "insights" && (
            <div id="promo-attribution" className="scroll-mt-24 bg-card rounded-2xl p-5 sm:p-6 space-y-5">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <SectionHead
                  icon={BarChart3}
                  title="Where signups come from"
                  hint="UTM-based attribution across every registration."
                />
                <Badge variant="outline" className="rounded-full">{analytics.total} total</Badge>
              </div>

              {analytics.total === 0 ? (
                <EmptyState
                  icon={BarChart3}
                  title="No attribution data yet"
                  body="Once people register through your tracked links, you'll see breakdowns here."
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {[
                    { title: "Source", data: analytics.bySource },
                    { title: "Medium", data: analytics.byMedium },
                    { title: "Campaign", data: analytics.byCampaign },
                  ].map((col) => (
                    <div key={col.title} className="space-y-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">{col.title}</p>
                      {col.data.slice(0, 6).map(([k, v]) => (
                        <Bar key={k} label={k} count={v} total={analytics.total} />
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      <TrackingLinkDialog
        open={linkDialogOpen}
        onOpenChange={setLinkDialogOpen}
        eventId={eventId}
        eventSlug={eventSlug}
        existingLinks={links}
        editing={editingLink}
        onSave={async (payload) => {
          try {
            if (editingLink) {
              await updateLink.mutateAsync({ id: editingLink.id, event_id: eventId, ...payload });
              toast.success("Link updated");
            } else {
              await createLink.mutateAsync({ event_id: eventId, ...payload });
              toast.success("Tracked link created");
            }
            setLinkDialogOpen(false);
          } catch (err: any) {
            toast.error(err?.message?.includes("duplicate") ? "That custom ending is already used. Pick another." : "Couldn't save link");
          }
        }}
      />

      <AlertDialog open={!!deletingLink} onOpenChange={(o) => !o && setDeletingLink(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this tracked link?</AlertDialogTitle>
            <AlertDialogDescription>
              Past registrations attributed to this link stay in your records, but the link itself will stop working and disappear from the leaderboard.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-full"
              onClick={async () => {
                if (!deletingLink) return;
                await deleteLink.mutateAsync({ id: deletingLink.id, event_id: eventId });
                toast.success("Link deleted");
                setDeletingLink(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <LinkQRDialog link={qrLink} eventSlug={eventSlug} onOpenChange={(o) => !o && setQrLink(null)} />
    </div>
  );
}

// ───────────────────────── Small UI helpers ─────────────────────────

function StatPill({
  icon: Icon, label, value, subValue, tint, valueClassName,
}: { icon: any; label: string; value: string | number; subValue?: string; tint: string; valueClassName?: string }) {
  return (
    <div className={cn("relative overflow-hidden rounded-2xl p-4 bg-gradient-to-br", tint)}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </div>
      <p className={cn("font-display font-semibold tracking-[-0.02em] mt-1.5 text-2xl", valueClassName)}>{value}</p>
      {subValue && <p className="text-[11px] text-muted-foreground mt-0.5">{subValue}</p>}
    </div>
  );
}

function SectionHead({ icon: Icon, title, hint }: { icon: any; title: string; hint?: string }) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-primary" />
        <h3 className="font-display font-semibold">{title}</h3>
      </div>
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

function Stat({ icon: Icon, value, label }: { icon: any; value: string | number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className="w-3 h-3" />
      <span className="tabular-nums font-semibold text-foreground">{value}</span> {label}
    </span>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button variant="outline" size="sm" className="rounded-full h-9 w-9 p-0" onClick={onClick} title={label}>
      {children}
    </Button>
  );
}

function EmptyState({ icon: Icon, title, body, cta }: { icon: any; title: string; body: string; cta?: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-muted/40 p-8 text-center flex flex-col items-center gap-3">
      <div className="w-12 h-12 rounded-full bg-background flex items-center justify-center">
        <Icon className="w-5 h-5 text-muted-foreground" />
      </div>
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-sm">{body}</p>
      </div>
      {cta}
    </div>
  );
}


// ───────────────────────── Tracking Link Dialog ─────────────────────────

function TrackingLinkDialog({
  open, onOpenChange, eventId, eventSlug, existingLinks, editing, onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  eventId: string;
  eventSlug: string;
  existingLinks: TrackingLink[];
  editing: TrackingLink | null;
  onSave: (payload: { label: string; code: string; utm: any }) => Promise<void>;
}) {
  const [label, setLabel] = useState("");
  const [code, setCode] = useState("");
  const [src, setSrc] = useState("");
  const [med, setMed] = useState("");
  const [camp, setCamp] = useState("");

  useMemo(() => {
    if (open) {
      if (editing) {
        const u: any = editing.utm || {};
        setLabel(editing.label);
        setCode(editing.code);
        setSrc(u.source || "");
        setMed(u.medium || "");
        setCamp(u.campaign || "");
      } else {
        setLabel(""); setCode(""); setSrc(""); setMed(""); setCamp("");
      }
    }
  }, [open, editing]);

  const cleanedCode = slugify(code || label);
  const baseUrl = getRegistrationUrl(eventSlug);
  const previewUrl = cleanedCode ? `${baseUrl}?ref=${cleanedCode}` : baseUrl;
  const codeTaken = existingLinks.some((l) => l.code === cleanedCode && l.id !== editing?.id);
  const canSave = label.trim().length > 0 && cleanedCode.length > 0 && !codeTaken;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-0 overflow-hidden">
        <div className="px-6 pt-6 pb-4">
          <DialogHeader>
            <DialogTitle className="text-xl tracking-[-0.01em]">
              {editing ? "Edit tracked link" : "New tracked link"}
            </DialogTitle>
            <DialogDescription className="text-sm">
              Each link gets its own click counter, registrations, and leaderboard rank.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-6 space-y-5 max-h-[60vh] overflow-y-auto">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">
              Label <span className="text-muted-foreground/60">· private, for your records</span>
            </Label>
            <Input
              value={label}
              onChange={(e) => { setLabel(e.target.value); if (!editing && !code) setCode(slugify(e.target.value)); }}
              placeholder="Jane — Instagram"
              maxLength={80}
              className="rounded-full h-11"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Custom ending</Label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="jane-instagram"
              maxLength={40}
              className="rounded-full h-11 font-mono text-sm"
            />
            {codeTaken && <p className="text-[11px] text-destructive pl-1">That ending is already used on this event.</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Source</Label>
              <Select value={src} onValueChange={setSrc}>
                <SelectTrigger className="rounded-full h-11"><SelectValue placeholder="optional" /></SelectTrigger>
                <SelectContent>{SOURCE_PRESETS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Medium</Label>
              <Select value={med} onValueChange={setMed}>
                <SelectTrigger className="rounded-full h-11"><SelectValue placeholder="optional" /></SelectTrigger>
                <SelectContent>{MEDIUM_PRESETS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">
              Campaign <span className="text-muted-foreground/60">· optional</span>
            </Label>
            <Input value={camp} onChange={(e) => setCamp(e.target.value)} placeholder="spring-launch" className="rounded-full h-11" />
          </div>

          <div className="rounded-2xl bg-muted/50 p-4 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Live preview</span>
              {cleanedCode && !codeTaken && <span className="text-[10px] font-medium text-primary">Ready</span>}
            </div>
            <p className="text-xs font-mono break-all leading-relaxed text-foreground/90">{previewUrl}</p>
          </div>
        </div>

        <DialogFooter className="px-6 py-4 mt-2 bg-muted/30 gap-2">
          <Button variant="outline" className="rounded-full" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            className="rounded-full"
            disabled={!canSave}
            onClick={() => onSave({
              label: label.trim(),
              code: cleanedCode,
              utm: {
                source: src || undefined,
                medium: med || undefined,
                campaign: camp.trim() || undefined,
                content: cleanedCode,
              },
            })}
          >
            {editing ? "Save changes" : "Create link"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LinkQRDialog({ link, eventSlug, onOpenChange }: { link: TrackingLink | null; eventSlug: string; onOpenChange: (o: boolean) => void }) {
  const url = link ? buildLinkUrl(eventSlug, link) : "";
  const [dataUrl, setDataUrl] = useState<string>("");

  useMemo(() => {
    if (!url) return;
    QRCode.toDataURL(url, { width: 320, margin: 2, color: { dark: "#000000", light: "#ffffff" } }).then(setDataUrl);
  }, [url]);

  const download = () => {
    if (!dataUrl || !link) return;
    const a = document.createElement("a");
    a.download = `${link.code}-qr.png`;
    a.href = dataUrl;
    a.click();
  };

  return (
    <Dialog open={!!link} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{link?.label}</DialogTitle>
          <DialogDescription className="font-mono text-[11px] break-all">{url}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-2">
          <div className="bg-white rounded-xl p-3">
            {dataUrl ? <img src={dataUrl} alt="QR code" className="w-[280px] h-[280px]" /> : <div className="w-[280px] h-[280px]" />}
          </div>
          <Button variant="outline" className="rounded-full" onClick={download}>
            <Download className="w-3.5 h-3.5 mr-1" /> Download PNG
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
