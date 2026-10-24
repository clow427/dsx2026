import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type MyTicket = {
  registration_id: string;
  status: string;
  checked_in_at: string | null;
  created_at: string;
  attendee_name: string;
  event_id: string;
  event_name: string;
  event_date: string | null;
  event_end_date: string | null;
  timezone: string | null;
  location_value: string | null;
  location_type: string | null;
  event_slug: string;
  cover_image_url: string | null;
  primary_color: string | null;
};

export function useMyTickets() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-tickets", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<MyTicket[]> => {
      const { data, error } = await supabase.rpc("get_my_tickets" as any);
      if (error) throw error;
      return (data as unknown as MyTicket[]) ?? [];
    },
  });
}

export type BrowseEvent = {
  id: string;
  name: string;
  slug: string;
  event_date: string | null;
  location_value: string | null;
  location_type: string | null;
  background_image_url: string | null;
  primary_color: string | null;
  description: string | null;
};

export function useBrowseEvents(excludeEventIds: string[] = []) {
  return useQuery({
    queryKey: ["browse-events", excludeEventIds.sort().join(",")],
    queryFn: async (): Promise<BrowseEvent[]> => {
      let q = supabase
        .from("events")
        .select("id, name, slug, event_date, location_value, location_type, background_image_url, primary_color, description")
        .eq("status", "live")
        .order("event_date", { ascending: true, nullsFirst: false })
        .limit(50);
      if (excludeEventIds.length > 0) {
        q = q.not("id", "in", `(${excludeEventIds.join(",")})`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data as BrowseEvent[]) ?? [];
    },
  });
}
