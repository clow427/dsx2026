import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Loader2, Upload, Trash2, RefreshCw, Check, Plus,
  Image as ImageIcon, Library, X, Move, ZoomIn, RotateCcw,
} from "lucide-react";
import { PolaroidIcon } from "@/components/icons/PolaroidIcon";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface LibraryRow {
  id: string;
  url: string;
  prompt: string | null;
  source: string;
  tag: string | null;
  created_at: string;
}

interface Props {
  value: string | null;
  onChange: (url: string | null) => void;
  eventId: string;
  tag?: string;
  template?: "minimal" | "split" | "landing" | "square" | "section";
  promptSeed?: string;
  aspectClass?: string;
  styleSeedUrl?: string;
  className?: string;
  emptyLabel?: string;
  /** Optional: persisted object-position (e.g. "50% 30%"). Defaults to "50% 50%". */
  position?: string | null;
  onPositionChange?: (pos: string) => void;
  /** Optional: persisted scale multiplier (1 = fit, >1 = zoom in). Defaults to 1. */
  scale?: number | null;
  onScaleChange?: (scale: number) => void;
}

export default function SmartImageField({
  value, onChange, eventId,
  tag, template = "minimal", promptSeed = "",
  aspectClass = "aspect-[16/10]",
  styleSeedUrl,
  className, emptyLabel = "Drop an image, click to upload, or generate with AI",
  position, onPositionChange, scale, onScaleChange,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedValue, setSelectedValue] = useState<string | null>(value);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [studioOpen, setStudioOpen] = useState(false);
  const [studioTab, setStudioTab] = useState<"generate" | "library">("generate");
  const [adjusting, setAdjusting] = useState(false);

  const pos = position || "50% 50%";
  const scl = typeof scale === "number" && scale > 0 ? scale : 1;
  const adjustable = !!(onPositionChange || onScaleChange);

  useEffect(() => {
    setSelectedValue(value);
  }, [value]);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const file = Array.from(files)[0];
    if (!file || !file.type.startsWith("image/")) {
      toast.error("Please drop an image file");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `uploads/${eventId}/${Date.now()}-${crypto.randomUUID().slice(0, 6)}.${ext}`;
      const { error } = await supabase.storage.from("event-assets").upload(path, file, { upsert: false });
      if (error) throw error;
      const { data: pub } = supabase.storage.from("event-assets").getPublicUrl(path);
      await supabase.from("event_image_library").insert({
        event_id: eventId, url: pub.publicUrl, source: "upload", tag: tag ?? null,
      });
      setSelectedValue(pub.publicUrl);
      onChange(pub.publicUrl);
      toast.success("Image uploaded");
    } catch (e: any) {
      toast.error(e.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }, [eventId, onChange, tag]);

  const openStudio = async (preferLibrary = false) => {
    if (preferLibrary) {
      // Peek at library to decide default tab
      const { count } = await supabase
        .from("event_image_library")
        .select("id", { count: "exact", head: true })
        .eq("event_id", eventId);
      setStudioTab((count ?? 0) > 0 ? "library" : "generate");
    } else {
      setStudioTab("generate");
    }
    setStudioOpen(true);
  };

  return (
    <>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault(); setDragOver(false);
          if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          "relative w-full overflow-hidden rounded-xl bg-muted group transition-all",
          aspectClass,
          dragOver && "ring-2 ring-primary ring-offset-2 ring-offset-background",
          className,
        )}
      >
        {selectedValue ? (
          <>
            {adjusting && adjustable ? (
              <ImageAdjuster
                 src={selectedValue}
                position={pos}
                scale={scl}
                onChange={(p, s) => {
                  if (onPositionChange && p !== pos) onPositionChange(p);
                  if (onScaleChange && s !== scl) onScaleChange(s);
                }}
                onDone={() => setAdjusting(false)}
              />
            ) : (
              <>
                <img
                  src={selectedValue}
                  alt=""
                  className="w-full h-full object-cover transition-transform"
                  style={{ objectPosition: pos, transform: `scale(${scl})` }}
                />
                <div className="absolute inset-0 bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 flex-wrap p-3">
                  <Button size="sm" variant="secondary" className="h-9 rounded-full" onClick={() => openStudio(true)}>
                    <Library className="w-4 h-4 mr-1.5" /> Change
                  </Button>
                  <Button size="sm" variant="secondary" className="h-9 rounded-full" onClick={() => openStudio(false)}>
                    <PolaroidIcon className="w-4 h-4 mr-1.5" /> AI
                  </Button>
                  {adjustable && (
                    <Button size="sm" variant="secondary" className="h-9 rounded-full" onClick={() => setAdjusting(true)}>
                      <Move className="w-4 h-4 mr-1.5" /> Adjust
                    </Button>
                  )}
                  <Button size="sm" variant="destructive" className="h-9 rounded-full" onClick={() => { setSelectedValue(null); onChange(null); }}>
                    <Trash2 className="w-4 h-4 mr-1.5" /> Remove
                  </Button>
                </div>
              </>
            )}
          </>
        ) : (
          <button
            type="button"
            onClick={() => openStudio(true)}
            className="w-full h-full flex flex-col items-center justify-center gap-3 text-muted-foreground hover:text-foreground transition-colors p-4"
          >
            {uploading ? (
              <Loader2 className="w-7 h-7 animate-spin text-primary" />
            ) : (
              <div className="flex items-center gap-2 opacity-70">
                <Upload className="w-5 h-5" />
                <ImageIcon className="w-5 h-5" />
                <PolaroidIcon className="w-5 h-5" />
              </div>
            )}
            <span className="text-sm text-center max-w-[18rem]">{emptyLabel}</span>
            {!uploading && (
              <div className="flex items-center gap-1.5 mt-1">
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); openStudio(false); }}
                  className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-full bg-foreground text-background hover:opacity-90 cursor-pointer"
                >
                  <PolaroidIcon className="w-3 h-3" /> Generate with AI
                </span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}
                  className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-full bg-background border border-border hover:bg-muted cursor-pointer"
                >
                  <Upload className="w-3 h-3" /> Upload
                </span>
              </div>
            )}
          </button>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
      </div>

      <ImageStudioDialog
        open={studioOpen}
        onOpenChange={setStudioOpen}
        eventId={eventId}
        tag={tag}
        template={template}
        promptSeed={promptSeed}
        styleSeedUrl={styleSeedUrl}
        defaultTab={studioTab}
        onPick={(url) => {
          setSelectedValue(url);
          onChange(url);
          setStudioOpen(false);
        }}
        onUploadFiles={handleFiles}
      />
    </>
  );
}

/* ---------------- Drag-to-reposition + zoom editor ---------------- */

function ImageAdjuster({
  src, position, scale, onChange, onDone,
}: {
  src: string;
  position: string;
  scale: number;
  onChange: (position: string, scale: number) => void;
  onDone: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number }>(() => parsePos(position));
  const [scl, setScl] = useState(scale);
  const dragging = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  function parsePos(p: string): { x: number; y: number } {
    const m = p.match(/(-?\d+(?:\.\d+)?)%\s+(-?\d+(?:\.\d+)?)%/);
    if (m) return { x: parseFloat(m[1]), y: parseFloat(m[2]) };
    return { x: 50, y: 50 };
  }

  useEffect(() => {
    onChange(`${pos.x.toFixed(1)}% ${pos.y.toFixed(1)}%`, scl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos.x, pos.y, scl]);

  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = true;
    last.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current || !last.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dx = e.clientX - last.current.x;
    const dy = e.clientY - last.current.y;
    last.current = { x: e.clientX, y: e.clientY };
    setPos((p) => ({
      x: Math.max(0, Math.min(100, p.x - (dx / rect.width) * 100)),
      y: Math.max(0, Math.min(100, p.y - (dy / rect.height) * 100)),
    }));
  };
  const onPointerUp = () => {
    dragging.current = false;
    last.current = null;
  };

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 cursor-grab active:cursor-grabbing select-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <img
        src={src}
        alt=""
        draggable={false}
        className="w-full h-full object-cover pointer-events-none"
        style={{ objectPosition: `${pos.x}% ${pos.y}%`, transform: `scale(${scl})` }}
      />
      <div className="absolute inset-x-3 bottom-3 bg-background/95 backdrop-blur rounded-2xl p-3 flex items-center gap-3 shadow-lg">
        <ZoomIn className="w-4 h-4 text-muted-foreground shrink-0" />
        <Slider
          value={[scl]}
          min={1}
          max={3}
          step={0.05}
          onValueChange={(v) => setScl(v[0])}
          className="flex-1"
        />
        <Button
          size="sm"
          variant="ghost"
          className="rounded-full h-8 px-2 gap-1"
          onClick={(e) => { e.stopPropagation(); setPos({ x: 50, y: 50 }); setScl(1); }}
        >
          <RotateCcw className="w-3.5 h-3.5" /> Reset
        </Button>
        <Button size="sm" className="rounded-full h-8" onClick={(e) => { e.stopPropagation(); onDone(); }}>
          <Check className="w-3.5 h-3.5 mr-1" /> Done
        </Button>
      </div>
      <div className="absolute top-3 left-3 bg-background/90 text-xs px-2.5 py-1 rounded-full flex items-center gap-1 pointer-events-none">
        <Move className="w-3 h-3" /> Drag to reposition
      </div>
    </div>
  );
}

/* ---------------- Image studio dialog ---------------- */

const ASPECT: Record<string, string> = {
  minimal: "aspect-video",
  landing: "aspect-video",
  section: "aspect-video",
  square: "aspect-square",
  split: "aspect-[3/4]",
};

function ImageStudioDialog({
  open, onOpenChange, eventId, tag, template = "minimal", promptSeed = "", styleSeedUrl,
  defaultTab = "generate", onPick, onUploadFiles,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  eventId: string;
  tag?: string;
  template?: string;
  promptSeed?: string;
  styleSeedUrl?: string;
  defaultTab?: "generate" | "library";
  onPick: (url: string) => void;
  onUploadFiles: (files: FileList | File[]) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [variants, setVariants] = useState<{ url: string }[]>([]);
  const [library, setLibrary] = useState<LibraryRow[]>([]);
  const [tab, setTab] = useState<"generate" | "library">(defaultTab);
  // Active in-flight jobs for this event/tag — survives dialog close, tab switch, refresh.
  const [activeJobs, setActiveJobs] = useState<Array<{ id: string; count: number }>>([]);
  const generating = activeJobs.length > 0;
  const pendingCount = activeJobs.reduce((n, j) => n + j.count, 0);
  const uploadRef = useRef<HTMLInputElement>(null);

  // Restore state on mount: load library + any in-flight or recently completed jobs for this event.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: lib } = await supabase
        .from("event_image_library")
        .select("*")
        .eq("event_id", eventId)
        .order("created_at", { ascending: false })
        .limit(60);
      if (!cancelled) setLibrary(lib || []);

      const { data: jobs } = await supabase
        .from("image_generation_jobs")
        .select("id, status, result_urls, prompt, count, created_at")
        .eq("event_id", eventId)
        .order("created_at", { ascending: false })
        .limit(5);
      if (cancelled || !jobs) return;
      const inflight = jobs
        .filter((j: any) => j.status === "pending" || j.status === "running")
        .map((j: any) => ({ id: j.id, count: j.count }));
      setActiveJobs(inflight);
      // Pick up the most recent succeeded job's variants so the user sees them after refresh.
      const latestDone = jobs.find((j: any) => j.status === "succeeded");
      if (latestDone && Array.isArray(latestDone.result_urls) && latestDone.result_urls.length) {
        setVariants(latestDone.result_urls as { url: string }[]);
        if (latestDone.prompt) setPrompt(latestDone.prompt);
      }
    })();
    return () => { cancelled = true; };
  }, [eventId]);

  // Reset prompt seed only when dialog opens with no in-flight job.
  useEffect(() => {
    if (!open) return;
    setTab(defaultTab);
    setPrompt((p) => p || promptSeed || "");
  }, [open, promptSeed, defaultTab]);

  // Realtime: react to job updates for this event.
  useEffect(() => {
    const channel = supabase
      .channel(`img-jobs-${eventId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "image_generation_jobs", filter: `event_id=eq.${eventId}` },
        (payload: any) => {
          const row = payload.new || payload.old;
          if (!row) return;
          if (row.status === "succeeded") {
            setActiveJobs((prev) => prev.filter((j) => j.id !== row.id));
            const newOnes = (row.result_urls || []) as { url: string }[];
            if (newOnes.length) {
              setVariants((prev) => {
                const seen = new Set(prev.map((v) => v.url));
                const merged = [...newOnes.filter((v) => !seen.has(v.url)), ...prev];
                return merged.slice(0, 12);
              });
              loadLibrary();
              toast.success(`Generated ${newOnes.length} image${newOnes.length > 1 ? "s" : ""}`);
            }
          } else if (row.status === "failed") {
            setActiveJobs((prev) => prev.filter((j) => j.id !== row.id));
            toast.error(row.error || "Generation failed");
          } else if (row.status === "pending" || row.status === "running") {
            setActiveJobs((prev) =>
              prev.some((j) => j.id === row.id) ? prev : [...prev, { id: row.id, count: row.count }],
            );
          }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [eventId]);

  // Polling fallback: while any job is in-flight, re-query every 4s in case a
  // realtime event was missed (e.g. websocket drop). Stops as soon as no jobs are active.
  useEffect(() => {
    if (activeJobs.length === 0) return;
    const ids = activeJobs.map((j) => j.id);
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from("image_generation_jobs")
        .select("id, status, result_urls, error")
        .in("id", ids);
      if (!data) return;
      for (const row of data as any[]) {
        if (row.status === "succeeded") {
          setActiveJobs((prev) => prev.filter((j) => j.id !== row.id));
          const newOnes = (row.result_urls || []) as { url: string }[];
          if (newOnes.length) {
            setVariants((prev) => {
              const seen = new Set(prev.map((v) => v.url));
              return [...newOnes.filter((v) => !seen.has(v.url)), ...prev].slice(0, 12);
            });
            loadLibrary();
          }
        } else if (row.status === "failed") {
          setActiveJobs((prev) => prev.filter((j) => j.id !== row.id));
          toast.error(row.error || "Generation failed");
        }
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [activeJobs]);

  const loadLibrary = async () => {
    const { data } = await supabase
      .from("event_image_library")
      .select("*")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false })
      .limit(60);
    setLibrary(data || []);
  };

  const saveToLibraryIfMissing = async (url: string, source = "ai") => {
    const alreadySaved = library.some((row) => row.url === url);
    if (alreadySaved) return;
    const optimisticRow: LibraryRow = {
      id: `pending-${url}`,
      event_id: eventId,
      url,
      prompt: prompt || null,
      source,
      tag: tag ?? null,
      created_at: new Date().toISOString(),
    } as LibraryRow;
    setLibrary((prev) => [optimisticRow, ...prev]);
    const { data: existing } = await supabase
      .from("event_image_library")
      .select("id")
      .eq("event_id", eventId)
      .eq("url", url)
      .maybeSingle();
    if (existing) return;
    const { error } = await supabase.from("event_image_library").insert({
      event_id: eventId,
      url,
      prompt: prompt || null,
      source,
      tag: tag ?? null,
    });
    if (error) {
      setLibrary((prev) => prev.filter((row) => row.id !== optimisticRow.id));
      toast.error("Image selected, but it could not be saved to the library");
    }
  };

  const pickImage = (url: string, source = "ai") => {
    onPick(url);
    void saveToLibraryIfMissing(url, source);
  };

  const generate = async (append = false) => {
    if (!prompt.trim()) {
      toast.error("Add a prompt first");
      return;
    }
    if (!append) setVariants([]);
    try {
      const { data, error } = await supabase.functions.invoke("generate-cover-image", {
        body: {
          background: true,
          prompt, template, count: 3, event_id: eventId, tag,
          style_seed_url: styleSeedUrl,
        },
      });
      if (error || data?.error || !data?.job_id) throw error || new Error(data?.error || "Could not start generation");

      setActiveJobs((prev) => [...prev, { id: data.job_id, count: data.count || 3 }]);
      toast.success("Generating in the background — feel free to keep working");
    } catch (e: any) {
      toast.error(e.message || "Could not start generation");
    }
  };

  const aspect = ASPECT[template] ?? "aspect-video";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl rounded-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <PolaroidIcon className="w-5 h-5 text-primary" />
            Image studio
          </DialogTitle>
          <DialogDescription>
            Click any image to use it. Generate new variants with AI, pick from your event library, or upload your own.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <TabsList className="rounded-full">
              <TabsTrigger value="library" className="rounded-full">
                <Library className="w-4 h-4 mr-1.5" /> Library {library.length ? `(${library.length})` : ""}
              </TabsTrigger>
              <TabsTrigger value="generate" className="rounded-full">
                <PolaroidIcon className="w-4 h-4 mr-1.5" /> Generate
              </TabsTrigger>
            </TabsList>
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={() => uploadRef.current?.click()}
            >
              <Upload className="w-4 h-4 mr-1.5" /> Upload your own
            </Button>
            <input
              ref={uploadRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) {
                  onUploadFiles(e.target.files);
                  onOpenChange(false);
                }
              }}
            />
          </div>

          <TabsContent value="generate" className="space-y-4 pt-3">
            <div className="space-y-2">
              <Label className="text-sm">Prompt</Label>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe the image…"
                className="rounded-2xl resize-y min-h-[120px] max-h-[40vh]"
              />
              {styleSeedUrl && (
                <p className="text-xs text-muted-foreground flex items-center gap-2">
                  <Check className="w-3 h-3 text-primary" />
                  Matching the style of your cover image
                </p>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
              <Button
                onClick={() => generate(false)}
                disabled={generating}
                className="rounded-full font-semibold bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {generating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : variants.length ? <RefreshCw className="w-4 h-4 mr-2" /> : <PolaroidIcon className="w-4 h-4 mr-2" />}
                {variants.length ? "Regenerate 3" : "Generate 3"}
              </Button>
              {variants.length > 0 && (
                <Button
                  variant="outline"
                  onClick={() => generate(true)}
                  disabled={generating}
                  className="rounded-full"
                >
                  <Plus className="w-4 h-4 mr-2" /> Generate 3 more
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <AnimatePresence mode="popLayout">
                {variants.map((v) => (
                  <motion.button
                    key={v.url}
                    type="button"
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    onClick={() => pickImage(v.url, "ai")}
                    className={cn(
                      "relative rounded-2xl overflow-hidden bg-muted ring-1 ring-border hover:ring-primary hover:ring-2 transition-all group/var",
                      aspect,
                    )}
                  >
                    <img src={v.url} alt="" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/var:opacity-100 transition-opacity flex items-center justify-center">
                      <span className="text-xs font-medium bg-background text-foreground rounded-full px-3 py-1.5 inline-flex items-center gap-1">
                        <Check className="w-3 h-3" /> Use this
                      </span>
                    </div>
                  </motion.button>
                ))}
                {generating && Array.from({ length: pendingCount || 3 }).map((_, i) => (
                  <motion.div
                    key={`skeleton-${i}`}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className={cn("rounded-2xl bg-muted/40 flex items-center justify-center", aspect)}
                  >
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </motion.div>
                ))}
                {!generating && variants.length === 0 && (
                  <div className={cn("col-span-full rounded-2xl border border-dashed border-border flex flex-col items-center justify-center text-muted-foreground gap-2", aspect)}>
                    <ImageIcon className="w-7 h-7" />
                    <p className="text-sm">Variants will appear here — click any to use it</p>
                  </div>
                )}
              </AnimatePresence>
            </div>
          </TabsContent>

          <TabsContent value="library" className="pt-3">
            {library.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">
                No images saved yet. Generate or upload one to start your library.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {library.map((row) => (
                  <div key={row.id} className="relative group rounded-2xl overflow-hidden bg-muted aspect-square ring-1 ring-border hover:ring-primary hover:ring-2 transition-all">
                    <button
                      type="button"
                      onClick={() => pickImage(row.url, row.source)}
                      className="w-full h-full"
                    >
                      <img src={row.url} alt="" className="w-full h-full object-cover" />
                    </button>
                    <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                      <span className="text-xs font-medium bg-background text-foreground rounded-full px-3 py-1.5 inline-flex items-center gap-1">
                        <Check className="w-3 h-3" /> Use this
                      </span>
                    </div>
                    <Button
                      size="icon" variant="destructive"
                      className="absolute top-1.5 right-1.5 h-7 w-7 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={async (e) => {
                        e.stopPropagation();
                        await supabase.from("event_image_library").delete().eq("id", row.id);
                        loadLibrary();
                      }}
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                    {row.source === "ai" && (
                      <span className="absolute top-1.5 left-1.5 text-[10px] uppercase tracking-wide bg-background/90 px-1.5 py-0.5 rounded-full">AI</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
