import { useEffect, useRef, useState } from "react";
import { useLocation, Link, useNavigate } from "react-router-dom";
import { Logo } from "@/components/Logo";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile } from "@/hooks/useProfile";
import { useUserRole } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { clearNewEventDraft } from "@/lib/eventDraft";
import {
  CalendarDays,
  Users,
  BarChart3,
  Puzzle,
  Settings,
  LogOut,
  Eye,
  Menu,
  Ticket,
} from "lucide-react";

const organizerNavItems = [
  { title: "Events", url: "/dashboard/events", icon: CalendarDays },
  { title: "Attendees", url: "/dashboard/attendees", icon: Users },
  { title: "Analytics", url: "/dashboard/analytics", icon: BarChart3 },
  { title: "Integrations", url: "/dashboard/integrations", icon: Puzzle },
  { title: "Settings", url: "/dashboard/settings", icon: Settings },
];

const attendeeNavItems = [
  { title: "My Tickets", url: "/dashboard/home", icon: Ticket },
  { title: "Settings", url: "/dashboard/settings", icon: Settings },
];

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const mainRef = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  const { user, signOut } = useAuth();
  const { data: profile } = useProfile();
  const { role, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
  }, [pathname]);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  // One-time cleanup of any leftover wizard draft from the legacy create flow.
  useEffect(() => {
    clearNewEventDraft();
  }, []);

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  // Hide nav until role resolves so attendees never flash organizer items.
  const allItems = roleLoading || !role
    ? []
    : role === "organizer"
      ? [...organizerNavItems, { title: "Company", url: "/dashboard/company", icon: Eye }]
      : attendeeNavItems;

  const homeHref = role === "attendee" ? "/dashboard/home" : "/dashboard/events";

  return (
    <div className="min-h-screen flex flex-col w-full bg-background">
      <header className="h-14 flex items-center px-4 sm:px-6 gap-3 sm:gap-4">
        <Link to={homeHref} className="lg:mr-6 shrink-0">
          <Logo size="sm" />
        </Link>

        {/* Desktop horizontal nav (lg+) */}
        <div className="hidden lg:flex flex-1 items-center h-full">
          <div className="flex items-center gap-1">
            {allItems.map((item) => (
              <NavLink
                key={item.url}
                to={item.url}
                className="px-4 py-2 text-sm font-medium text-muted-foreground rounded-full transition-colors hover:text-foreground hover:bg-muted"
                activeClassName="bg-foreground text-background hover:bg-foreground hover:text-background"
                data-testid={`nav-${item.title.toLowerCase()}`}
              >
                {item.title}
              </NavLink>
            ))}
          </div>
        </div>

        {/* Spacer for mobile/tablet (push trigger right) */}
        <div className="flex-1 lg:hidden" />

        {/* Desktop avatar dropdown (lg+) */}
        <div className="hidden lg:flex items-center gap-3 shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Account menu"
                className="rounded-full outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-opacity hover:opacity-80"
              >
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-foreground text-background text-xs font-semibold uppercase">
                    {(user?.email?.[0] ?? "?").toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {user && (
                <div className="px-2 py-1.5 text-xs text-muted-foreground truncate">{user.email}</div>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/dashboard/settings"><Settings className="w-3.5 h-3.5 mr-2" /> Account settings</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
                <LogOut className="w-3.5 h-3.5 mr-2" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Mobile + Tablet: hamburger (right) */}
        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              aria-label="Open menu"
              className="lg:hidden h-10 w-10 -mr-1 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
          </SheetTrigger>
          <SheetContent side="right" className="w-80 p-0 flex flex-col">
            <div className="h-14 flex items-center px-5">
              <Logo size="sm" />
            </div>
            <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
              {allItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.url}
                    to={item.url}
                    className="flex items-center gap-3 px-4 h-11 text-sm font-medium text-muted-foreground rounded-full transition-colors hover:text-foreground hover:bg-muted"
                    activeClassName="bg-foreground text-background hover:bg-foreground hover:text-background"
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.title}</span>
                  </NavLink>
                );
              })}
            </nav>
            <div className="p-3 border-t border-border/40 space-y-1">
              {user && (
                <div className="flex items-center gap-3 px-3 py-2">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="bg-foreground text-background text-xs font-semibold uppercase">
                      {(user.email?.[0] ?? "?").toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-muted-foreground truncate">{user.email}</div>
                  </div>
                </div>
              )}
              <NavLink
                to="/dashboard/settings"
                className="flex items-center gap-3 px-4 h-11 text-sm font-medium text-muted-foreground rounded-full hover:bg-muted hover:text-foreground transition-colors"
              >
                <Settings className="w-4 h-4" /> Account settings
              </NavLink>
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full flex items-center gap-3 px-4 h-11 text-sm font-medium text-destructive rounded-full hover:bg-destructive/10 transition-colors"
              >
                <LogOut className="w-4 h-4" /> Sign out
              </button>
            </div>
          </SheetContent>
        </Sheet>
      </header>
      <main ref={mainRef} className="flex-1 p-4 sm:p-6 overflow-auto">{children}</main>
    </div>
  );
}
