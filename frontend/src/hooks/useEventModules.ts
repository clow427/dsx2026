import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ModuleType =
  | "why_attend"
  | "schedule"
  | "speakers"
  | "location"
  | "faq"
  | "sponsors"
  | "custom";

export interface EventModule {
  id: string;
  event_id: string;
  type: ModuleType;
  position: number;
  enabled: boolean;
  content: any;
  created_at: string;
  updated_at: string;
}

const KEY = (eventId: string) => ["event_modules", eventId];

export function useEventModules(eventId: string | undefined) {
  return useQuery({
    queryKey: KEY(eventId || ""),
    enabled: !!eventId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_modules" as any)
        .select("*")
        .eq("event_id", eventId!)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as EventModule[];
    },
  });
}

export function useAddModule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ event_id, type, position, content }: { event_id: string; type: ModuleType; position: number; content: any }) => {
      const { data, error } = await supabase.from("event_modules" as any).insert({ event_id, type, position, content }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: KEY(v.event_id) }),
  });
}

export function useUpdateModule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, event_id, ...patch }: Partial<EventModule> & { id: string; event_id: string }) => {
      const { error } = await supabase.from("event_modules" as any).update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: KEY(v.event_id) }),
  });
}

export function useDeleteModule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, event_id }: { id: string; event_id: string }) => {
      const { error } = await supabase.from("event_modules" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: KEY(v.event_id) }),
  });
}

export function useReorderModules() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ event_id, ordered }: { event_id: string; ordered: { id: string; position: number }[] }) => {
      // Update each row's position
      await Promise.all(
        ordered.map((o) =>
          supabase.from("event_modules" as any).update({ position: o.position }).eq("id", o.id)
        )
      );
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: KEY(v.event_id) }),
  });
}

export const MODULE_DEFAULTS: Record<ModuleType, { title: string; content: any }> = {
  why_attend: {
    title: "Why attend",
    content: {
      heading: "Why attend",
      bullets: ["Learn from industry leaders", "Network with peers", "Hands-on workshops"],
    },
  },
  schedule: {
    title: "Schedule",
    content: {
      heading: "What to expect",
      items: [
        { time: "09:00", title: "Doors open & coffee" },
        { time: "10:00", title: "Opening keynote" },
        { time: "12:30", title: "Lunch & networking" },
      ],
    },
  },
  speakers: {
    title: "Speakers",
    content: {
      heading: "Speakers & hosts",
      people: [
        { name: "Jane Doe", role: "CEO, Acme", avatar: "" },
        { name: "John Smith", role: "Founder, Beta", avatar: "" },
      ],
    },
  },
  location: {
    title: "Location",
    content: { heading: "Where", venue: "", address: "", mapUrl: "" },
  },
  faq: {
    title: "FAQ",
    content: {
      heading: "Frequently asked",
      items: [
        { q: "Is there parking?", a: "Yes, free parking on site." },
        { q: "Will food be provided?", a: "Light refreshments and lunch are included." },
      ],
    },
  },
  sponsors: {
    title: "Sponsors",
    content: { heading: "Brought to you by", logos: [] },
  },
  custom: {
    title: "Custom section",
    content: { heading: "Section title", body: "Add any content here." },
  },
};
