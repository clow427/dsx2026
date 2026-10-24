import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useCompanyBySlug(slug: string | undefined) {
  return useQuery({
    queryKey: ["public-company", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("public_profiles" as any)
        .select("id, full_name, company, company_description, website, avatar_url, social_links, company_slug")
        .eq("company_slug", slug!)
        .single();
      if (error) throw error;
      return data as any;

    },
    enabled: !!slug,
  });
}

export function usePublicEventsByUser(userId: string | undefined) {
  return useQuery({
    queryKey: ["public-events", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id,user_id,name,slug,description,event_date,event_end_date,event_type,status,template,primary_color,color_mode,logo_url,background_image_url,background_image_position,background_image_scale,registration_limit,registration_deadline,registration_opens_at,timezone,location_type,location_value,ticket_price,ticket_tiers,requires_approval,capacity,waitlist_enabled,created_at,updated_at")
        .eq("user_id", userId!)
        .eq("status", "live")
        .order("event_date", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });
}

export function usePublicRegistrationCounts(eventIds: string[]) {
  return useQuery({
    queryKey: ["public-reg-counts", eventIds],
    queryFn: async () => {
      const counts: Record<string, number> = {};
      for (const id of eventIds) {
        const { data, error } = await supabase.rpc("get_registration_count", { p_event_id: id });
        if (!error) counts[id] = data ?? 0;
      }
      return counts;
    },
    enabled: eventIds.length > 0,
  });
}
