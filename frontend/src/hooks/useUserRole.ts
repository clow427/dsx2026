import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type UserRole = "organizer" | "attendee";

/**
 * Returns whether the current user has organizer access (owns or co-hosts any event).
 * Used to decide between the organizer dashboard and the attendee home.
 */
export function useUserRole() {
  const { user, loading: authLoading } = useAuth();

  const query = useQuery({
    queryKey: ["user-role", user?.id],
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<UserRole> => {
      const { data, error } = await supabase.rpc("has_any_organizer_access" as any, {
        _user_id: user!.id,
      });
      if (error) throw error;
      return data ? "organizer" : "attendee";
    },
  });

  return {
    role: query.data ?? null,
    isOrganizer: query.data === "organizer",
    isAttendee: query.data === "attendee",
    loading: authLoading || (!!user && query.isLoading),
  };
}
