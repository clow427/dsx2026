import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { OrganizerOnly } from "@/components/OrganizerOnly";
import { RoleHomeRedirect } from "@/components/RoleHomeRedirect";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { SmoothScroll } from "@/components/motion/SmoothScroll";

import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import Register from "./pages/Register";
import Ticket from "./pages/Ticket";
import Unsubscribe from "./pages/Unsubscribe";
import CompanyPage from "./pages/dashboard/CompanyPage";
import Events from "./pages/dashboard/Events";
// Legacy wizard removed — events are now created/edited inline on EventDetail.
const EventDetailEditRedirect = () => {
  const { id } = useParams();
  return <Navigate to={`/dashboard/events/${id}`} replace />;
};
import EventDetail from "./pages/dashboard/EventDetail";
import AttendeeHome from "./pages/dashboard/AttendeeHome";
import Attendees from "./pages/dashboard/Attendees";
import Analytics from "./pages/dashboard/Analytics";
import Integrations from "./pages/dashboard/Integrations";
import SettingsPage from "./pages/dashboard/SettingsPage";
import LandingEditor from "./pages/dashboard/LandingEditor";
import NotFound from "./pages/NotFound";
import AcceptCohostInvitation from "./pages/AcceptCohostInvitation";

const queryClient = new QueryClient();

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} storageKey="app-theme">
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <ScrollToTop />
            <SmoothScroll />
            <Routes>
              {/* Public */}
              <Route path="/" element={<Landing />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/register/:slug" element={<Register />} />
              <Route path="/register/:slug/:variant" element={<Register />} />
              <Route path="/ticket/:registrationId" element={<Ticket />} />
              <Route path="/unsubscribe" element={<Unsubscribe />} />
              
              <Route path="/cohost/accept" element={<AcceptCohostInvitation />} />

              {/* Dashboard (protected) */}
              <Route path="/dashboard" element={<ProtectedRoute><RoleHomeRedirect /></ProtectedRoute>} />
              <Route path="/dashboard/*" element={
                <ProtectedRoute>
                  <DashboardLayout>
                    <Routes>
                      <Route path="home" element={<AttendeeHome />} />
                      <Route path="events" element={<OrganizerOnly><Events /></OrganizerOnly>} />
                      <Route path="events/create" element={<Navigate to="/dashboard/events" replace />} />
                      <Route path="events/:id" element={<OrganizerOnly><EventDetail /></OrganizerOnly>} />
                      <Route path="events/:id/edit" element={<EventDetailEditRedirect />} />
                      <Route path="attendees" element={<OrganizerOnly><Attendees /></OrganizerOnly>} />
                      <Route path="analytics" element={<OrganizerOnly><Analytics /></OrganizerOnly>} />
                      <Route path="integrations" element={<OrganizerOnly><Integrations /></OrganizerOnly>} />
                      <Route path="settings" element={<SettingsPage />} />
                      <Route path="landing-editor" element={<OrganizerOnly><LandingEditor /></OrganizerOnly>} />
                      <Route path="company" element={<OrganizerOnly><CompanyPage /></OrganizerOnly>} />
                    </Routes>
                  </DashboardLayout>
                </ProtectedRoute>
              } />

              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
