import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tables, TablesInsert } from "@/integrations/supabase/types";

export type FormField = Tables<"form_fields">;

export function useFormFields(eventId: string | undefined) {
  return useQuery({
    queryKey: ["form_fields", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("form_fields")
        .select("*")
        .eq("event_id", eventId!)
        .order("position");
      if (error) throw error;
      return data as FormField[];
    },
    enabled: !!eventId,
  });
}

export function useBulkInsertFormFields() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (fields: TablesInsert<"form_fields">[]) => {
      const { data, error } = await supabase.from("form_fields").insert(fields).select();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      if (variables.length > 0) {
        qc.invalidateQueries({ queryKey: ["form_fields", variables[0].event_id] });
      }
    },
  });
}

export function useAddFormField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (field: TablesInsert<"form_fields">) => {
      const { data, error } = await supabase.from("form_fields").insert(field).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => qc.invalidateQueries({ queryKey: ["form_fields", data.event_id] }),
  });
}

export function useUpdateFormField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, eventId, patch }: { id: string; eventId: string; patch: Partial<FormField> }) => {
      const { data, error } = await supabase.from("form_fields").update(patch).eq("id", id).select().single();
      if (error) throw error;
      return { data, eventId };
    },
    onSuccess: ({ eventId }) => qc.invalidateQueries({ queryKey: ["form_fields", eventId] }),
  });
}

export function useDeleteFormField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, eventId }: { id: string; eventId: string }) => {
      const { error } = await supabase.from("form_fields").delete().eq("id", id);
      if (error) throw error;
      return eventId;
    },
    onSuccess: (eventId) => qc.invalidateQueries({ queryKey: ["form_fields", eventId] }),
  });
}
