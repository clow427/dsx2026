import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  useEventModules, useAddModule, useUpdateModule, useDeleteModule, useReorderModules,
  MODULE_DEFAULTS, type EventModule, type ModuleType,
} from "@/hooks/useEventModules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  GripVertical, Trash2, Plus, ChevronDown, ChevronUp,
  Sparkles, Loader2, Wand2, Monitor, Tablet, Smartphone, RotateCw, ExternalLink,
} from "lucide-react";
import { MagicWandIcon } from "@/components/icons/MagicWandIcon";

import SectionIcon from "./SectionIcon";
import SmartImageField from "./SmartImageField";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const TYPE_META: Record<ModuleType, { label: string }> = {
  why_attend: { label: "Why attend" },
  schedule: { label: "Schedule" },
  speakers: { label: "Speakers" },
  location: { label: "Location" },
  faq: { label: "FAQ" },
  sponsors: { label: "Sponsors" },
  custom: { label: "Custom" },
};

interface Props {
  eventId: string;
  eventSlug?: string | null;
  eventName: string;
  description?: string | null;
  eventDate?: string | null;
  locationType?: string | null;
  brandColor?: string;
  coverImageUrl?: string | null;
}

export default function EventPageBuilder({ eventId, eventSlug, eventName, description, eventDate, locationType, brandColor = "#7C3AED", coverImageUrl }: Props) {
  const { data: modules = [], refetch } = useEventModules(eventId);
  const add = useAddModule();
  const reorder = useReorderModules();
  const [addType, setAddType] = useState<ModuleType>("why_attend");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [seedLoading, setSeedLoading] = useState(false);
  const [matchingLoading, setMatchingLoading] = useState(false);
  const [regenAllLoading, setRegenAllLoading] = useState(false);
  const [regenAllProgress, setRegenAllProgress] = useState<{ done: number; total: number } | null>(null);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const updateModule = useUpdateModule();

  const DEVICE_WIDTH: Record<typeof previewDevice, number> = {
    desktop: 1280,
    tablet: 820,
    mobile: 390,
  };
  const deviceWidth = DEVICE_WIDTH[previewDevice];

  // Auto-refresh the preview iframe shortly after modules change (debounced)
  const modulesHash = useMemo(() => JSON.stringify(modules.map((m) => ({ i: m.id, e: m.enabled, p: m.position, c: m.content, t: m.type }))), [modules]);
  const [iframeKey, setIframeKey] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setIframeKey((k) => k + 1), 600);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [modulesHash]);

  const previewUrl = eventSlug ? `/register/${eventSlug}` : null;

  const regenerateOne = async (mod: EventModule) => {
    const { data, error } = await supabase.functions.invoke("generate-event-page", {
      body: { event_id: eventId, mode: "section", type: mod.type, with_image: true },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    const section = data?.sections?.[0];
    if (!section) throw new Error("No content returned");
    // Preserve user-positioning, but let regeneration replace imagery so the visual change is obvious.
    const preserved = {
      image_position: mod.content?.image_position,
      image_scale: mod.content?.image_scale,
    };
    await updateModule.mutateAsync({
      id: mod.id,
      event_id: mod.event_id,
      content: { ...section.content, ...Object.fromEntries(Object.entries(preserved).filter(([, v]) => v !== undefined && v !== null)) },
    });
  };

  const handleRegenerateOne = async (mod: EventModule) => {
    setRegeneratingId(mod.id);
    try {
      await regenerateOne(mod);
      toast.success(`✨ ${TYPE_META[mod.type].label} regenerated`);
    } catch (e: any) {
      toast.error(e?.message || "Failed to regenerate section");
    } finally {
      setRegeneratingId(null);
    }
  };

  const handleRegenerateAll = async () => {
    if (modules.length === 0) {
      handleAISeed();
      return;
    }
    setRegenAllLoading(true);
    setRegenAllProgress({ done: 0, total: modules.length });
    let failed = 0;
    for (let i = 0; i < modules.length; i++) {
      try {
        await regenerateOne(modules[i]);
      } catch (e: any) {
        failed++;
        toast.error(`${TYPE_META[modules[i].type].label}: ${e?.message ?? "failed"}`);
      }
      setRegenAllProgress({ done: i + 1, total: modules.length });
    }
    await refetch();
    setRegenAllLoading(false);
    setRegenAllProgress(null);
    if (failed === 0) toast.success("✨ Whole page regenerated");
    else toast.message(`Regenerated with ${failed} error${failed > 1 ? "s" : ""}`);
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = modules.findIndex((m) => m.id === active.id);
    const newIdx = modules.findIndex((m) => m.id === over.id);
    const next = arrayMove(modules, oldIdx, newIdx).map((m, i) => ({ id: m.id, position: i }));
    reorder.mutate({ event_id: eventId, ordered: next });
  };

  const handleAdd = async () => {
    const def = MODULE_DEFAULTS[addType];
    await add.mutateAsync({
      event_id: eventId,
      type: addType,
      position: modules.length,
      content: def.content,
    });
    toast.success(`${def.title} added`);
  };

  const handleAIAdd = async () => {
    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-event-page", {
        body: { event_id: eventId, mode: "section", type: addType, with_image: true },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const section = data?.sections?.[0];
      if (!section) throw new Error("No content returned");
      await add.mutateAsync({
        event_id: eventId,
        type: section.type,
        position: modules.length,
        content: section.content,
      });
      toast.success(`✨ ${TYPE_META[section.type as ModuleType].label} generated`);
    } catch (e: any) {
      toast.error(e?.message || "Failed to generate section");
    } finally {
      setAiLoading(false);
    }
  };

  const handleAISeed = async () => {
    setSeedLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-event-page", {
        body: { event_id: eventId, mode: "seed", with_image: true },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const sections = (data?.sections || []) as { type: ModuleType; content: any }[];
      if (!sections.length) throw new Error("No content returned");
      let pos = modules.length;
      for (const s of sections) {
        await add.mutateAsync({ event_id: eventId, type: s.type, position: pos++, content: s.content });
      }
      await refetch();
      toast.success(`✨ ${sections.length} sections generated`);
    } catch (e: any) {
      toast.error(e?.message || "Failed to generate page");
    } finally {
      setSeedLoading(false);
    }
  };

  const handleMatchingSet = async () => {
    if (!coverImageUrl) {
      toast.error("Set a cover image first to use as the style reference");
      return;
    }
    const targets = modules.filter((m) =>
      ["why_attend", "location", "custom", "speakers", "schedule"].includes(m.type) && !m.content?.image_url
    );
    if (targets.length === 0) {
      toast.info("All sections already have an image, or no image-supporting sections to fill");
      return;
    }
    setMatchingLoading(true);
    try {
      for (const mod of targets) {
        const heading = mod.content?.heading || mod.type;
        const { data, error } = await supabase.functions.invoke("generate-cover-image", {
          body: {
            prompt: `Editorial image for the "${heading}" section of an event landing page. Match the style of the reference exactly.`,
            template: "section",
            count: 1,
            event_id: eventId,
            tag: `section:${mod.type}`,
            style_seed_url: coverImageUrl,
          },
        });
        if (error || data?.error) continue;
        const url = data?.images?.[0]?.url;
        if (url) {
          await updateModule.mutateAsync({
            id: mod.id, event_id: mod.event_id,
            content: { ...(mod.content || {}), image_url: url },
          });
        }
      }
      toast.success(`✨ Matching imagery generated for ${targets.length} section${targets.length > 1 ? "s" : ""}`);
    } catch (e: any) {
      toast.error(e?.message || "Failed to generate matching set");
    } finally {
      setMatchingLoading(false);
    }
  };

  return (
    <div className="grid lg:grid-cols-2 gap-5">
      <div className="bg-card rounded-xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display font-semibold">Page sections</h3>
          <div className="flex items-center gap-2">
            {modules.length > 0 && (
              <Button
                size="sm"
                onClick={handleRegenerateAll}
                disabled={regenAllLoading || regeneratingId !== null}
                className="rounded-full"
                title="Regenerate every section with AI"
              >
                {regenAllLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    {regenAllProgress?.done}/{regenAllProgress?.total}
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                    Regenerate page
                  </>
                )}
              </Button>
            )}
            <Badge variant="outline" className="rounded-full">{modules.length} {modules.length === 1 ? "section" : "sections"}</Badge>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Drag to reorder. Toggle visibility per section.</p>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={modules.map((m) => m.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {modules.map((m) => (
                <SortableRow
                  key={m.id}
                  module={m}
                  expanded={expanded === m.id}
                  onToggleExpand={() => setExpanded(expanded === m.id ? null : m.id)}
                  coverImageUrl={coverImageUrl}
                  onRegenerate={() => handleRegenerateOne(m)}
                  regenerating={regeneratingId === m.id}
                  disabled={regenAllLoading}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {modules.length === 0 && (
          <div className="text-center py-8 px-4 rounded-xl bg-muted/30 space-y-3">
            <Wand2 className="w-6 h-6 text-primary mx-auto" />
            <p className="text-sm text-muted-foreground">No sections yet. Let AI build a starter page tailored to your event.</p>
            <Button onClick={handleAISeed} disabled={seedLoading} className="rounded-full">
              {seedLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
              {seedLoading ? "Generating…" : "Generate page with AI"}
            </Button>
          </div>
        )}

        <div className="space-y-2 pt-2">
          <div className="flex gap-2">
            <Select value={addType} onValueChange={(v) => setAddType(v as ModuleType)}>
              <SelectTrigger className="rounded-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(TYPE_META) as ModuleType[]).map((t) => (
                  <SelectItem key={t} value={t}>{TYPE_META[t].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={handleAIAdd}
              disabled={aiLoading}
              className="rounded-full whitespace-nowrap"
              title="Generate this section with AI based on your event details"
            >
              {aiLoading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />}
              {aiLoading ? "Generating…" : "Add with AI"}
            </Button>
          </div>
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleAdd}
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 px-1"
            >
              <Plus className="w-3 h-3" /> Or add an empty section
            </button>
            {modules.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleMatchingSet}
                disabled={matchingLoading || !coverImageUrl}
                className="rounded-full"
                title={coverImageUrl ? "Generate matching imagery for sections without an image, using your cover as the style reference" : "Set a cover image first"}
              >
                {matchingLoading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <MagicWandIcon className="w-3.5 h-3.5 mr-1.5" />}
                Generate matching set
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="bg-muted/30 rounded-xl p-5 sm:p-6">
        <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
          <h3 className="font-display font-semibold">Live preview</h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIframeKey((k) => k + 1)}
              title="Refresh preview"
              aria-label="Refresh preview"
              className="inline-flex items-center justify-center w-8 h-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
            >
              <RotateCw className="w-4 h-4" />
            </button>
            {previewUrl && (
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="Open in new tab"
                aria-label="Open in new tab"
                className="inline-flex items-center justify-center w-8 h-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
            <div className="inline-flex items-center gap-0.5 rounded-full bg-background p-0.5">
              {([
                { id: "desktop", icon: Monitor, label: "Desktop" },
                { id: "tablet", icon: Tablet, label: "Tablet" },
                { id: "mobile", icon: Smartphone, label: "Mobile" },
              ] as const).map(({ id, icon: Icon, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPreviewDevice(id)}
                  title={label}
                  aria-label={label}
                  aria-pressed={previewDevice === id}
                  className={`inline-flex items-center justify-center w-8 h-8 rounded-full transition-colors ${
                    previewDevice === id
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-muted/40 p-3 overflow-auto">
          <div
            className="relative bg-background rounded-xl overflow-hidden mx-auto transition-[width] duration-300 ease-out shadow-sm"
            style={{ width: previewDevice === "desktop" ? "100%" : deviceWidth, maxWidth: "100%" }}
          >
            {previewUrl ? (
              <iframe
                key={iframeKey}
                src={previewUrl}
                title="Live event page preview"
                className="block w-full bg-background"
                style={{ height: previewDevice === "desktop" ? 760 : 720, border: 0 }}
              />
            ) : (
              <p className="text-center py-12 text-sm text-muted-foreground">
                Save the event to enable a live preview.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SortableRow({ module: m, expanded, onToggleExpand, coverImageUrl, onRegenerate, regenerating, disabled }: { module: EventModule; expanded: boolean; onToggleExpand: () => void; coverImageUrl?: string | null; onRegenerate: () => void; regenerating: boolean; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: m.id });
  const update = useUpdateModule();
  const del = useDeleteModule();
  const meta = TYPE_META[m.type];

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="rounded-xl bg-muted/50 overflow-hidden">
      <div className="flex items-center gap-2 p-3">
        <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing touch-none p-1 text-muted-foreground hover:text-foreground">
          <GripVertical className="w-4 h-4" />
        </button>
        <span className="shrink-0"><SectionIcon type={m.type} color="hsl(var(--foreground))" size={18} animated={false} /></span>
        <span className="text-sm font-medium flex-1 truncate">{m.content?.heading || meta.label}</span>
        <Switch
          checked={m.enabled}
          onCheckedChange={(v) => update.mutate({ id: m.id, event_id: m.event_id, enabled: v })}
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onRegenerate}
          disabled={regenerating || disabled}
          title="Regenerate this section with AI"
        >
          {regenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-primary" />}
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onToggleExpand}>
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => del.mutate({ id: m.id, event_id: m.event_id })}>
          <Trash2 className="w-3.5 h-3.5 text-destructive" />
        </Button>
      </div>

      {expanded && (
        <div className="px-3 pb-4 pt-1 space-y-3 border-t border-border/40">
          <ModuleEditor module={m} coverImageUrl={coverImageUrl} />
        </div>
      )}
    </div>
  );
}

function ModuleEditor({ module: m, coverImageUrl }: { module: EventModule; coverImageUrl?: string | null }) {
  const update = useUpdateModule();
  const c = m.content || {};
  const patch = (next: any) => update.mutate({ id: m.id, event_id: m.event_id, content: { ...c, ...next } });

  return (
    <>
      <div className="space-y-1.5">
        <Label className="text-xs">Heading</Label>
        <Input
          defaultValue={c.heading || ""}
          onBlur={(e) => patch({ heading: e.target.value })}
          className="rounded-full"
        />
      </div>

      {(m.type === "why_attend" || m.type === "location" || m.type === "custom" || m.type === "speakers" || m.type === "schedule") && (
        <div className="space-y-1.5">
          <Label className="text-xs">Section image (optional)</Label>
          <SmartImageField
            value={c.image_url || null}
            onChange={(url) => patch({ image_url: url })}
            eventId={m.event_id}
            tag={`section:${m.type}`}
            template="section"
            promptSeed={`Editorial photograph for the "${c.heading || m.type}" section of an event landing page. Show real people authentically engaged — candid faces, warm cinematic lighting, documentary realism. ${coverImageUrl ? "Match the look, palette and mood of the existing cover image." : ""}`}
            styleSeedUrl={coverImageUrl || undefined}
            aspectClass="aspect-[16/9]"
            emptyLabel="Drop, click, or generate a section image"
            position={c.image_position ?? null}
            onPositionChange={(p) => patch({ image_position: p })}
            scale={c.image_scale ?? null}
            onScaleChange={(s) => patch({ image_scale: s })}
          />
        </div>
      )}

      {m.type === "why_attend" && (
        <ListEditor
          label="Bullets"
          items={c.bullets || []}
          onChange={(items) => patch({ bullets: items })}
          render={(v, set) => (
            <Input value={v} onChange={(e) => set(e.target.value)} placeholder="Reason to attend" className="rounded-full" />
          )}
          newItem=""
        />
      )}

      {m.type === "schedule" && (
        <ListEditor
          label="Items"
          items={c.items || []}
          onChange={(items) => patch({ items })}
          render={(v, set) => (
            <div className="flex gap-2">
              <Input value={v.time || ""} onChange={(e) => set({ ...v, time: e.target.value })} placeholder="09:00" className="rounded-full w-24" />
              <Input value={v.title || ""} onChange={(e) => set({ ...v, title: e.target.value })} placeholder="Item title" className="rounded-full flex-1" />
            </div>
          )}
          newItem={{ time: "", title: "" }}
        />
      )}

      {m.type === "speakers" && (
        <ListEditor
          label="People"
          items={c.people || []}
          onChange={(people) => patch({ people })}
          render={(v, set) => (
            <div className="flex gap-2">
              <Input value={v.name || ""} onChange={(e) => set({ ...v, name: e.target.value })} placeholder="Name" className="rounded-full flex-1" />
              <Input value={v.role || ""} onChange={(e) => set({ ...v, role: e.target.value })} placeholder="Role" className="rounded-full flex-1" />
            </div>
          )}
          newItem={{ name: "", role: "", avatar: "" }}
        />
      )}

      {m.type === "location" && (
        <>
          <div className="space-y-1.5">
            <Label className="text-xs">Venue</Label>
            <Input defaultValue={c.venue || ""} onBlur={(e) => patch({ venue: e.target.value })} className="rounded-full" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Address</Label>
            <Input defaultValue={c.address || ""} onBlur={(e) => patch({ address: e.target.value })} className="rounded-full" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Map URL</Label>
            <Input defaultValue={c.mapUrl || ""} onBlur={(e) => patch({ mapUrl: e.target.value })} className="rounded-full" placeholder="https://maps.google.com/..." />
          </div>
        </>
      )}

      {m.type === "faq" && (
        <ListEditor
          label="Questions"
          items={c.items || []}
          onChange={(items) => patch({ items })}
          render={(v, set) => (
            <div className="space-y-2">
              <Input value={v.q || ""} onChange={(e) => set({ ...v, q: e.target.value })} placeholder="Question" className="rounded-full" />
              <Textarea value={v.a || ""} onChange={(e) => set({ ...v, a: e.target.value })} placeholder="Answer" className="rounded-xl text-sm" rows={2} />
            </div>
          )}
          newItem={{ q: "", a: "" }}
        />
      )}

      {m.type === "sponsors" && (
        <ListEditor
          label="Logo URLs"
          items={c.logos || []}
          onChange={(logos) => patch({ logos })}
          render={(v, set) => (
            <Input value={v} onChange={(e) => set(e.target.value)} placeholder="https://..." className="rounded-full" />
          )}
          newItem=""
        />
      )}

      {m.type === "custom" && (
        <div className="space-y-1.5">
          <Label className="text-xs">Body</Label>
          <Textarea defaultValue={c.body || ""} onBlur={(e) => patch({ body: e.target.value })} className="rounded-xl" rows={5} />
        </div>
      )}
    </>
  );
}

function ListEditor<T>({
  label, items, onChange, render, newItem,
}: {
  label: string;
  items: T[];
  onChange: (items: T[]) => void;
  render: (value: T, set: (v: T) => void) => React.ReactNode;
  newItem: T;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>
      {items.map((it, i) => (
        <div key={i} className="flex items-start gap-2">
          <div className="flex-1">
            {render(it, (v) => onChange(items.map((x, j) => (j === i ? v : x))))}
          </div>
          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => onChange(items.filter((_, j) => j !== i))}>
            <Trash2 className="w-3.5 h-3.5 text-destructive" />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" className="rounded-full" onClick={() => onChange([...items, newItem])}>
        <Plus className="w-3.5 h-3.5 mr-1" /> Add
      </Button>
    </div>
  );
}
