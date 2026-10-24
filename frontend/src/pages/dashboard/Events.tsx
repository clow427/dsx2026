import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Search, CalendarDays, Users, Loader2, MapPin, ExternalLink, LayoutGrid, List } from "lucide-react";
import { useEvents, useCreateEvent } from "@/hooks/useEvents";
import { useRegistrations } from "@/hooks/useRegistrations";
import { format } from "date-fns";
import { clearNewEventDraft } from "@/lib/eventDraft";
import { getEventPriceLabel } from "@/lib/eventPrice";
import { toast } from "sonner";

const statusColors: Record<string, string> = {
  live: "bg-success text-success-foreground",
  draft: "bg-muted text-muted-foreground",
  past: "bg-secondary/20 text-secondary",
};

const Events = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"list" | "grid">("grid");
  const { data: events, isLoading } = useEvents(search || undefined);
  const { data: registrations } = useRegistrations();
  const createEvent = useCreateEvent();
  const [creating, setCreating] = useState(false);

  const handleCreateEvent = async () => {
    if (creating) return;
    setCreating(true);
    try {
      // Clear any legacy wizard draft so it never resurfaces
      clearNewEventDraft();
      const created = await createEvent.mutateAsync({
        name: "Untitled event",
        event_type: "webinar",
      });
      navigate(`/dashboard/events/${created.id}`);
    } catch (e: any) {
      toast.error(e?.message || "Couldn't create event");
      setCreating(false);
    }
  };

  const regCounts: Record<string, number> = {};
  registrations?.forEach((r) => {
    regCounts[r.event_id] = (regCounts[r.event_id] || 0) + 1;
  });

  const filtered = events?.filter(e => statusFilter === "all" || e.status === statusFilter);

  // Upcoming events: future-dated, sorted by date, take first 4
  const upcoming = events
    ?.filter(e => e.event_date && new Date(e.event_date) >= new Date())
    .sort((a, b) => new Date(a.event_date!).getTime() - new Date(b.event_date!).getTime())
    .slice(0, 4);

  const EventCard = ({ event, variant = "default" }: { event: NonNullable<typeof events>[number]; variant?: "default" | "upcoming" }) => {
    const count = regCounts[event.id] || 0;
    const isUpcoming = variant === "upcoming";

    return (
      <div
        className="group cursor-pointer"
        onClick={() => navigate(`/dashboard/events/${event.id}`)}
      >
        {/* Image */}
        <div className="relative aspect-[16/10] rounded-xl overflow-hidden bg-muted mb-3">
          {event.background_image_url ? (
            <img
              src={event.background_image_url}
              alt={event.name}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <CalendarDays className="w-8 h-8 text-muted-foreground/30" />
            </div>
          )}
          {/* Price / status badge */}
          <div className="absolute top-3 left-3">
            <span className="bg-card text-foreground text-xs font-semibold px-3 py-1 rounded-full shadow-sm">
              {getEventPriceLabel(event as any)}
            </span>
          </div>
        </div>
        {/* Info below image */}
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {event.event_date ? format(new Date(event.event_date), "EEE, MMM d") : "No date set"}
            </p>
            {!isUpcoming && (
              <Badge className={`${statusColors[event.status] || "bg-muted text-muted-foreground"} border-0 capitalize text-[10px]`}>
                {event.status}
              </Badge>
            )}
          </div>
          <h3 className="font-display font-bold text-base leading-snug group-hover:text-primary transition-colors">
            {event.name}
          </h3>
          {!isUpcoming && (
            <div className="flex flex-col gap-0.5 text-xs text-muted-foreground pt-1">
              <span className="flex items-center gap-1"><Users className="w-3 h-3" />{count} attending</span>
              {event.location_value && (
                <span className="flex items-center gap-1 truncate"><MapPin className="w-3 h-3" />{event.location_value}</span>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8" data-testid="page-events">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold">Events</h1>
          <p className="text-muted-foreground">Create and manage your event registration pages.</p>
        </div>
        <Button className="w-full sm:w-auto" onClick={handleCreateEvent} disabled={creating} data-testid="create-event-button">
          {creating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
          Create event
        </Button>
      </div>

      {/* Upcoming Events Row */}
      {upcoming && upcoming.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Upcoming</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {upcoming.map((event) => (
              <EventCard key={event.id} event={event} variant="upcoming" />
            ))}
          </div>
        </div>
      )}

      {/* Filters + View Toggle */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search events…" className="pl-10 rounded-full" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36 rounded-full">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="live">Live</SelectItem>
            <SelectItem value="past">Past</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex bg-muted rounded-full p-1 sm:ml-auto">
          <button
            onClick={() => setViewMode("list")}
            className={`p-2 rounded-full transition-colors ${viewMode === "list" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <List className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode("grid")}
            className={`p-2 rounded-full transition-colors ${viewMode === "grid" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : filtered && filtered.length > 0 ? (
        viewMode === "list" ? (
          /* LIST VIEW — borderless horizontal cards */
          <div className="space-y-6">
            {filtered.map((event) => {
              const count = regCounts[event.id] || 0;
              const shortDesc = event.description
                ? event.description.replace(/[*#_~`>]/g, "").split(/(?<=\.)\s+/).filter(Boolean).slice(0, 2).join(" ").slice(0, 250)
                : "";

              return (
                <div
                  key={event.id}
                  className="group flex flex-col sm:flex-row gap-4 cursor-pointer"
                  onClick={() => navigate(`/dashboard/events/${event.id}`)}
                >
                  <div className="sm:w-56 flex-shrink-0 aspect-video sm:aspect-[16/10] rounded-xl overflow-hidden bg-muted">
                    {event.background_image_url ? (
                      <img src={event.background_image_url} alt={event.name} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <CalendarDays className="w-10 h-10 text-muted-foreground/30" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 flex flex-col justify-center gap-1.5 py-1">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        {event.event_date ? format(new Date(event.event_date), "EEE, MMM d") : "No date set"}
                      </p>
                      <Badge className={`${statusColors[event.status] || "bg-muted text-muted-foreground"} border-0 capitalize text-[10px]`}>
                        {event.status}
                      </Badge>
                    </div>
                    <h3 className="font-display font-bold text-xl leading-tight group-hover:text-primary transition-colors">{event.name}</h3>
                    {shortDesc && <p className="text-sm text-muted-foreground line-clamp-2">{shortDesc}</p>}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1">
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" />{count} attending</span>
                      {event.location_value && (
                        <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{event.location_value}</span>
                      )}
                    </div>
                    <div className="flex gap-2 pt-2">
                      <Button variant="outline" size="sm" className="text-xs rounded-full" asChild onClick={(e) => e.stopPropagation()}>
                        <Link to={`/register/${event.slug}`}><ExternalLink className="w-3 h-3 mr-1" />View page</Link>
                      </Button>
                      <Button variant="outline" size="sm" className="text-xs rounded-full" asChild onClick={(e) => e.stopPropagation()}>
                        <Link to={`/dashboard/events/${event.id}`}>Manage</Link>
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* GRID VIEW — lander-style cards */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filtered.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )
      ) : (
        <div className="text-center py-20" data-testid="empty-state">
          <CalendarDays className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No events yet</h3>
          <p className="text-muted-foreground mb-4">Create your first event to get started.</p>
          <Button onClick={handleCreateEvent} disabled={creating} data-testid="create-event-empty-button">
            {creating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
            Create event
          </Button>
        </div>
      )}
    </div>
  );
};

export default Events;
