import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function useInvitations() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["cohost-invitations", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cohost_invitations" as any)
        .select("id, email, scope, event_id, status, created_at, expires_at, token, accepted_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });
}

export function useCohosts() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["cohosts", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cohosts" as any)
        .select("id, owner_id, cohost_user_id, event_id, created_at")
        .eq("owner_id", user!.id);
      if (error) throw error;
      return data as any[];
    },
  });
}

export function useCreateInvitation() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { email: string; scope: "account" | "event"; event_id?: string | null }) => {
      const email = input.email.trim().toLowerCase();
      const { data, error } = await supabase
        .from("cohost_invitations" as any)
        .insert({
          inviter_id: user!.id,
          email,
          scope: input.scope,
          event_id: input.scope === "event" ? input.event_id : null,
        })
        .select("id, token, email, scope, event_id")
        .single();
      if (error) throw error;
      return data as any;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cohost-invitations"] }),
  });
}

export function useRevokeInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("cohost_invitations" as any)
        .update({ status: "revoked" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cohost-invitations"] }),
  });
}

export function useRemoveCohost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("cohosts" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cohosts"] }),
  });
}

export function getAcceptUrl(token: string): string {
  return `${window.location.origin}/cohost/accept?token=${encodeURIComponent(token)}`;
}
