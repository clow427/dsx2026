import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { SmoothScroll } from "@/components/motion/SmoothScroll";
import { GraphProvider } from "@/data/GraphContext";

import Landing from "./pages/Landing";
import Explore from "./pages/Explore";
import Chat, { ChatIndex } from "./pages/Chat";
import NotFound from "./pages/NotFound";

// The explorer is a static app: it reads the committed graph JSON and needs no backend or auth
// (architecture.md: "Storage: committed JSON files. No database.").
// The event-studio pages imported from Lovable (auth, dashboard, registration, tickets) are not
// routed because they need Supabase. Their source files are still in the tree.
// Exception: /chat calls the `alumni-chat` Supabase edge function (needs VITE_SUPABASE_URL).

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} storageKey="app-theme">
    <GraphProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <ScrollToTop />
          <Routes>
            {/* Lenis smooth scrolling only on the marketing page; it would fight the graph canvas's wheel zoom. */}
            <Route path="/" element={<><SmoothScroll /><Landing /></>} />
            <Route path="/explore" element={<Explore />} />
            <Route path="/chat" element={<ChatIndex />} />
            <Route path="/chat/:threadId" element={<Chat />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </GraphProvider>
  </ThemeProvider>
);

export default App;
