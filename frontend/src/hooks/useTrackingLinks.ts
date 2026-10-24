import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tables, Json } from "@/integrations/supabase/types";

export type TrackingLink = Tables<"event_tracking_links">;

export type TrackingLinkUtm = {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
};

export function useTrackingLinks(eventId: string | undefined) {
  return useQuery({
    queryKey: ["tracking-links", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_tracking_links")
        .select("*")
        .eq("event_id", eventId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as TrackingLink[];
    },
    enabled: !!eventId,
  });
}

export function useCreateTrackingLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { event_id: string; label: string; code: string; utm: TrackingLinkUtm }) => {
      const { data, error } = await supabase
        .from("event_tracking_links")
        .insert({
          event_id: input.event_id,
          label: input.label,
          code: input.code,
          utm: input.utm as unknown as Json,
        })
        .select()
        .single();
      if (error) throw error;
      return data as TrackingLink;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["tracking-links", vars.event_id] }),
  });
}

export function useUpdateTrackingLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, event_id, ...patch }: { id: string; event_id: string; label?: string; code?: string; utm?: TrackingLinkUtm }) => {
      const update: any = { ...patch };
      if (patch.utm) update.utm = patch.utm as unknown as Json;
      const { error } = await supabase.from("event_tracking_links").update(update).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["tracking-links", vars.event_id] }),
  });
}

export function useDeleteTrackingLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; event_id: string }) => {
      const { error } = await supabase.from("event_tracking_links").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["tracking-links", vars.event_id] }),
  });
}

export async function incrementLinkClick(linkId: string) {
  try {
    await supabase.rpc("increment_link_click", { p_link_id: linkId });
  } catch {
    // best-effort, never block the page
  }
}
