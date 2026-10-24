import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";

export type Event = Tables<"events">;

// All event columns EXCEPT internal email-config (which is owner-only via RPC and
// column-revoked from authenticated/anon roles).
const EVENT_COLS = "id,user_id,name,slug,description,event_date,event_end_date,event_type,status,template,primary_color,color_mode,logo_url,background_image_url,background_image_position,background_image_scale,registration_limit,registration_deadline,registration_opens_at,timezone,location_type,location_value,ticket_price,ticket_tiers,requires_approval,capacity,waitlist_enabled,created_at,updated_at";

export function useEvents(search?: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["events", user?.id, search],
    queryFn: async () => {
      let query = supabase
        .from("events")
        .select(EVENT_COLS)
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(2000);
      if (search) {
        query = query.ilike("name", `%${search}%`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data as Event[];
    },
    enabled: !!user,
  });
}

export function useEvent(id: string | undefined) {
  return useQuery({
    queryKey: ["event", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("events").select(EVENT_COLS).eq("id", id!).single();
      if (error) throw error;
      return data as Event;
    },
    enabled: !!id,
  });
}

export function useEventBySlug(slug: string | undefined) {
  return useQuery({
    queryKey: ["event-slug", slug],
    queryFn: async () => {
      // Public-safe columns only (excludes internal email config exposed by RLS to anon).
      const { data, error } = await supabase.from("events").select(EVENT_COLS).eq("slug", slug!).maybeSingle();
      if (!data) throw new Error("Event not found");
      if (error) throw error;
      return data as Event;
    },
    enabled: !!slug,
  });
}

// Owner-only RPC for fetching internal email configuration.
export function useEventEmailConfig(eventId: string | undefined) {
  return useQuery({
    queryKey: ["event-email-config", eventId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_event_email_config", { p_event_id: eventId! });
      if (error) throw error;
      return (data || {}) as {
        email_intro: string | null;
        email_signature: string | null;
        send_confirmation_email: boolean;
        send_reminder_24h: boolean;
        send_reminder_1h: boolean;
      };
    },
    enabled: !!eventId,
  });
}

function generateSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + "-" + Math.random().toString(36).substring(2, 8);
}

export function useCreateEvent() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      description?: string;
      event_date?: string;
      event_end_date?: string;
      timezone?: string;
      event_type?: string;
      template?: string;
      location_type?: string;
      location_value?: string;
      ticket_price?: number;
      requires_approval?: boolean;
      capacity?: number;
    }) => {
      const slug = generateSlug(input.name);
      const { data, error } = await supabase.from("events").insert({
        ...input,
        slug,
        user_id: user!.id,
        status: "draft",
      } as any).select(EVENT_COLS).single();
      if (error) throw error;

      // Seed default registration form fields: Name + Email (required) + Phone (optional)
      await supabase.from("form_fields").insert([
        { event_id: data.id, label: "Full Name", field_type: "text", required: true, position: 0 },
        { event_id: data.id, label: "Email Address", field_type: "email", required: true, position: 1 },
        { event_id: data.id, label: "Phone", field_type: "tel", required: false, position: 2 },
      ]);

      return data as Event;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["events"] }),
  });
}

export function useUpdateEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: TablesUpdate<"events"> & { id: string }) => {
      const { data, error } = await supabase.from("events").update(updates).eq("id", id).select(EVENT_COLS).single();
      if (error) throw error;
      return data as Event;
    },
    onMutate: async ({ id, ...updates }) => {
      await qc.cancelQueries({ queryKey: ["event", id] });
      const previousEvent = qc.getQueryData<Event>(["event", id]);
      if (previousEvent) qc.setQueryData<Event>(["event", id], { ...previousEvent, ...updates });
      qc.setQueriesData<Event[]>({ queryKey: ["events"] }, (current) =>
        current?.map((event) => event.id === id ? { ...event, ...updates } : event),
      );
      return { previousEvent };
    },
    onError: (_error, variables, context) => {
      if (context?.previousEvent) qc.setQueryData(["event", variables.id], context.previousEvent);
    },
    onSuccess: (data) => {
      qc.setQueryData(["event", data.id], data);
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.invalidateQueries({ queryKey: ["event", data.id] });
    },
  });
}

export function useDuplicateEvent() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (sourceId: string) => {
      // Read source event
      const { data: src, error: srcErr } = await supabase.from("events").select(EVENT_COLS).eq("id", sourceId).single();
      if (srcErr) throw srcErr;
      const { id, created_at, updated_at, slug, status, ...rest } = src as any;
      const newName = `${rest.name} (copy)`;
      const newSlug = generateSlug(newName);
      const { data: created, error: insErr } = await supabase
        .from("events")
        .insert({ ...rest, name: newName, slug: newSlug, status: "draft", user_id: user!.id } as any)
        .select(EVENT_COLS)
        .single();
      if (insErr) throw insErr;

      // Copy form fields
      const { data: fields } = await supabase.from("form_fields").select("*").eq("event_id", sourceId);
      if (fields && fields.length) {
        await supabase.from("form_fields").insert(
          fields.map((f: any) => {
            const { id, event_id, ...fieldRest } = f;
            return { ...fieldRest, event_id: (created as any).id };
          }),
        );
      }
      // Copy modules
      const { data: mods } = await supabase.from("event_modules").select("*").eq("event_id", sourceId);
      if (mods && mods.length) {
        await supabase.from("event_modules").insert(
          mods.map((m: any) => {
            const { id, event_id, created_at, updated_at, ...modRest } = m;
            return { ...modRest, event_id: (created as any).id };
          }),
        );
      }
      return created as Event;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["events"] }),
  });
}

export function useDeleteEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("events").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["events"] }),
  });
}
