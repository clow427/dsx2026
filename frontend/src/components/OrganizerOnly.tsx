import { useUserRole } from "@/hooks/useUserRole";
import { Navigate } from "react-router-dom";

/**
 * Restricts a route to users with organizer access. While the role is
 * resolving we render nothing (parent layout shell stays visible) instead
 * of flashing the organizer UI to attendees.
 */
export function OrganizerOnly({ children }: { children: React.ReactNode }) {
  const { role, loading } = useUserRole();
  if (loading || !role) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-muted-foreground/30 border-t-foreground rounded-full animate-spin" />
      </div>
    );
  }
  if (role !== "organizer") return <Navigate to="/dashboard/home" replace />;
  return <>{children}</>;
}
