import { useUserRole } from "@/hooks/useUserRole";
import { Navigate } from "react-router-dom";

/**
 * Sends the user to the organizer dashboard if they own/cohost any events,
 * otherwise to the attendee home. Renders nothing while resolving (no flash).
 */
export function RoleHomeRedirect() {
  const { role, loading } = useUserRole();
  if (loading || !role) return null;
  if (role === "organizer") return <Navigate to="/dashboard/events" replace />;
  return <Navigate to="/dashboard/home" replace />;
}
