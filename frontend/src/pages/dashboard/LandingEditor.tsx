import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowLeft, ExternalLink, Loader2, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useLandingContent } from "@/hooks/useLandingContent";
import { AssetDropzone } from "@/components/landing-editor/AssetDropzone";
import {
  LANDING_DEFAULTS,
  LANDING_SECTION_LABELS,
  type LandingSectionKey,
} from "@/lib/landing-defaults";

const SECTIONS: {
  key: LandingSectionKey;
  description: string;
  preview: (content: any) => React.ReactNode;
}[] = [
  {
    key: "hero",
    description: "The first thing visitors see — badge, headline, rotating word, subhead, primary button.",
    preview: (c) => (
      <>
        <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-primary mb-2">{c.badge}</p>
        <p className="font-display text-xl tracking-[-0.02em] leading-tight mb-2">
          {c.headline_prefix} <span className="italic text-primary">{c.rotating_words?.[0]}</span>
        </p>
        <p className="text-sm text-muted-foreground line-clamp-2">{c.subhead}</p>
      </>
    ),
  },
  {
    key: "popular_events",
    description: "Heading + subhead above the popular-events grid.",
    preview: (c) => (
      <>
        <p className="font-display text-xl tracking-[-0.02em] leading-tight mb-1">
          {c.title_line_1} <span className="text-muted-foreground">/ {c.title_line_2}</span>
        </p>
        <p className="text-sm text-muted-foreground line-clamp-2">{c.subhead}</p>
      </>
    ),
  },
  {
    key: "features",
    description: "Bento grid: section heading + 4 feature cards (tag, title, description).",
    preview: (c) => (
      <>
        <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-primary mb-1">{c.eyebrow}</p>
        <p className="font-display text-xl tracking-[-0.02em] leading-tight mb-2">
          {c.title_line_1} {c.title_line_2}
        </p>
        <div className="grid grid-cols-2 gap-1.5 mt-2">
          {(c.items ?? []).slice(0, 4).map((it: any, i: number) => (
            <div key={i} className="text-xs bg-muted/60 rounded-lg px-2.5 py-1.5 truncate">
              <span className="font-semibold">{it.title}</span>
            </div>
          ))}
        </div>
      </>
    ),
  },
  {
    key: "testimonials",
    description: "Section title + 5 short organizer quotes (name, role).",
    preview: (c) => (
      <>
        <p className="font-display text-xl tracking-[-0.02em] leading-tight mb-2">{c.title}</p>
        <p className="text-sm text-muted-foreground line-clamp-2">
          “{c.items?.[0]?.quote}” — {c.items?.[0]?.name}
        </p>
      </>
    ),
  },
  {
    key: "cta",
    description: "Final dark call-to-action block — title, subhead, button.",
    preview: (c) => (
      <>
        <p className="font-display text-xl tracking-[-0.02em] leading-tight mb-2">
          {c.title_line_1} {c.title_line_2}
        </p>
        <p className="text-sm text-muted-foreground line-clamp-2">{c.subhead}</p>
      </>
    ),
  },
];

export default function LandingEditor() {
  const isAdmin = useIsAdmin();
  const { data: landing, isLoading } = useLandingContent();
  const queryClient = useQueryClient();

  const [direction, setDirection] = useState<Record<string, string>>({});
  const [assets, setAssets] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);

  if (isAdmin === false) return <Navigate to="/dashboard/events" replace />;

  const regenerateAll = async () => {
    if (bulkBusy) return;
    setBulkBusy(true);
    setBulkProgress({ done: 0, total: SECTIONS.length });
    let failed = 0;
    for (let i = 0; i < SECTIONS.length; i++) {
      const { key } = SECTIONS[i];
      try {
        const { data, error } = await supabase.functions.invoke("regenerate-landing-section", {
          body: {
            section_key: key,
            direction: direction[key] ?? "",
            asset_urls: assets[key] ?? [],
          },
        });
        if (error) throw error;
        if ((data as any)?.error) throw new Error((data as any).error);
      } catch (e: any) {
        failed++;
        toast.error(`${LANDING_SECTION_LABELS[key]}: ${e?.message ?? "failed"}`);
      }
      setBulkProgress({ done: i + 1, total: SECTIONS.length });
      await queryClient.invalidateQueries({ queryKey: ["landing-sections"] });
    }
    setBulkBusy(false);
    setBulkProgress(null);
    if (failed === 0) toast.success("Whole landing page regenerated");
    else toast.message(`Regenerated with ${failed} error${failed > 1 ? "s" : ""}`);
  };

  const regenerate = async (key: LandingSectionKey) => {
    setBusy(key);
    try {
      const { data, error } = await supabase.functions.invoke("regenerate-landing-section", {
        body: {
          section_key: key,
          direction: direction[key] ?? "",
          asset_urls: assets[key] ?? [],
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(`${LANDING_SECTION_LABELS[key]} regenerated`);
      setDirection((d) => ({ ...d, [key]: "" }));
      setAssets((a) => ({ ...a, [key]: [] }));
      await queryClient.invalidateQueries({ queryKey: ["landing-sections"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not regenerate");
    } finally {
      setBusy(null);
    }
  };

  const revert = async (key: LandingSectionKey) => {
    setBusy(key);
    try {
      const { error } = await supabase.from("landing_sections").delete().eq("section_key", key);
      if (error) throw error;
      toast.success(`Reverted to default`);
      await queryClient.invalidateQueries({ queryKey: ["landing-sections"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not revert");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-6 lg:px-8 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link
              to="/dashboard/events"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-2"
            >
              <ArrowLeft className="w-3 h-3" /> Back
            </Link>
            <h1 className="font-display text-3xl tracking-[-0.02em] font-bold">Landing page editor</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Regenerate any section. Add direction, drop in reference images — both optional.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={regenerateAll}
              disabled={bulkBusy || busy !== null}
              className="rounded-full"
            >
              {bulkBusy ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Regenerating {bulkProgress?.done}/{bulkProgress?.total}…
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" /> Regenerate entire page
                </>
              )}
            </Button>
            <Button variant="outline" className="rounded-full" asChild>
              <Link to="/" target="_blank" rel="noreferrer">
                View live <ExternalLink className="ml-1.5 w-3.5 h-3.5" />
              </Link>
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-48 rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="space-y-6">
            {SECTIONS.map(({ key, description, preview }, idx) => {
              const content = landing?.content[key] ?? (LANDING_DEFAULTS[key] as any);
              const isCustom = !!landing?.assets[key]?.length || !!landing?.content[key];
              const sectionAssets = landing?.assets[key] ?? [];

              return (
                <motion.div
                  key={key}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05, duration: 0.35 }}
                >
                  <Card className="border-0 shadow-sm rounded-3xl overflow-hidden">
                    <div className="grid md:grid-cols-2 gap-0">
                      {/* Left — preview */}
                      <div className="p-7 bg-muted/30">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted-foreground">
                            {LANDING_SECTION_LABELS[key]}
                          </span>
                          {isCustom && (
                            <button
                              type="button"
                              onClick={() => revert(key)}
                              disabled={busy === key}
                              className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                            >
                              <RotateCcw className="w-3 h-3" /> Revert
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mb-4">{description}</p>
                        <div className="bg-background rounded-2xl p-5 min-h-[160px]">
                          {preview(content)}
                        </div>
                        {sectionAssets.length > 0 && (
                          <div className="mt-4">
                            <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted-foreground mb-2">
                              Saved references
                            </p>
                            <div className="flex gap-1.5 flex-wrap">
                              {sectionAssets.slice(0, 4).map((a) => (
                                <img
                                  key={a.url}
                                  src={a.url}
                                  alt=""
                                  className="w-12 h-12 rounded-lg object-cover"
                                />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Right — controls */}
                      <div className="p-7 space-y-4">
                        <div>
                          <label className="text-xs font-semibold text-foreground mb-2 block">
                            Direction <span className="text-muted-foreground font-normal">(optional)</span>
                          </label>
                          <Textarea
                            value={direction[key] ?? ""}
                            onChange={(e) => setDirection((d) => ({ ...d, [key]: e.target.value }))}
                            placeholder="e.g. Make it punchier, focus on community, mention 'free forever'..."
                            rows={3}
                            className="rounded-2xl resize-none"
                          />
                        </div>

                        <div>
                          <label className="text-xs font-semibold text-foreground mb-2 block">
                            Reference assets <span className="text-muted-foreground font-normal">(optional)</span>
                          </label>
                          <AssetDropzone
                            value={assets[key] ?? []}
                            onChange={(urls) => setAssets((a) => ({ ...a, [key]: urls }))}
                          />
                        </div>

                        <Button
                          onClick={() => regenerate(key)}
                          disabled={busy === key}
                          className="w-full rounded-full"
                        >
                          {busy === key ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Regenerating…
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-4 h-4 mr-2" /> Regenerate section
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
