import { Link } from "react-router-dom";
import { useMyTickets, useBrowseEvents } from "@/hooks/useMyTickets";
import { useProfile } from "@/hooks/useProfile";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, MapPin, Ticket, ArrowRight } from "lucide-react";

function formatDate(iso: string | null) {
  if (!iso) return "Date TBA";
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function AttendeeHome() {
  const { data: profile } = useProfile();
  const { data: tickets, isLoading: ticketsLoading } = useMyTickets();
  const excludeIds = (tickets ?? []).map((t) => t.event_id);
  const { data: browse, isLoading: browseLoading } = useBrowseEvents(excludeIds);

  const firstName = profile?.full_name?.split(" ")[0];

  return (
    <div className="max-w-5xl mx-auto w-full space-y-12">
      <header className="space-y-2">
        <h1 className="font-display text-3xl sm:text-4xl tracking-[-0.02em]">
          {firstName ? `Hi, ${firstName}` : "Your events"}
        </h1>
        <p className="text-muted-foreground text-sm sm:text-base">
          Tickets you've registered for and live events you can join.
        </p>
      </header>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl sm:text-2xl tracking-[-0.02em]">My tickets</h2>
          {tickets && tickets.length > 0 && (
            <span className="text-xs text-muted-foreground">{tickets.length} total</span>
          )}
        </div>

        {ticketsLoading ? (
          <div className="grid gap-3">
            {[0, 1].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
          </div>
        ) : tickets && tickets.length > 0 ? (
          <ul className="grid gap-3">
            {tickets.map((t) => (
              <li key={t.registration_id} className="min-w-0">
                <Link
                  to={`/ticket/${t.registration_id}`}
                  className="group flex items-stretch gap-4 p-4 rounded-2xl bg-card hover:bg-muted/50 transition-colors min-w-0 overflow-hidden"
                >
                  <div
                    className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl bg-muted shrink-0 flex items-center justify-center overflow-hidden"
                    style={t.cover_image_url ? { backgroundImage: `url(${t.cover_image_url})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
                  >
                    {!t.cover_image_url && <Ticket className="w-6 h-6 text-muted-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
                    <div className="font-display text-base sm:text-lg tracking-[-0.01em] truncate">
                      {t.event_name}
                    </div>
                    <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-x-3 gap-y-1 text-xs text-muted-foreground min-w-0">
                      <span className="flex items-center gap-1.5 min-w-0"><Calendar className="w-3 h-3 shrink-0" /><span className="truncate min-w-0">{formatDate(t.event_date)}</span></span>
                      {t.location_value && (
                        <span className="flex items-center gap-1.5 min-w-0"><MapPin className="w-3 h-3 shrink-0" /><span className="truncate min-w-0">{t.location_value}</span></span>
                      )}
                      <span className="truncate min-w-0">· {t.attendee_name}</span>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 shrink-0 self-center text-muted-foreground group-hover:text-foreground transition-colors" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-2xl bg-muted/40 p-8 text-center">
            <Ticket className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">You haven't registered for any events yet.</p>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-xl sm:text-2xl tracking-[-0.02em]">Browse events</h2>

        {browseLoading ? (
          <div className="grid sm:grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}
          </div>
        ) : browse && browse.length > 0 ? (
          <ul className="grid sm:grid-cols-2 gap-3">
            {browse.map((e) => (
              <li key={e.id} className="min-w-0">
                <Link
                  to={`/register/${e.slug}`}
                  className="group block rounded-2xl bg-card hover:bg-muted/50 transition-colors overflow-hidden min-w-0"
                >
                  <div
                    className="aspect-[16/9] bg-muted"
                    style={e.background_image_url ? { backgroundImage: `url(${e.background_image_url})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
                  />
                  <div className="p-4 space-y-1 min-w-0">
                    <div className="font-display text-base tracking-[-0.01em] truncate">{e.name}</div>
                    <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-x-3 gap-y-1 text-xs text-muted-foreground min-w-0">
                      <span className="flex items-center gap-1.5 min-w-0"><Calendar className="w-3 h-3 shrink-0" /><span className="truncate min-w-0">{formatDate(e.event_date)}</span></span>
                      {e.location_value && (
                        <span className="flex items-center gap-1.5 min-w-0"><MapPin className="w-3 h-3 shrink-0" /><span className="truncate min-w-0">{e.location_value}</span></span>
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-2xl bg-muted/40 p-8 text-center">
            <p className="text-sm text-muted-foreground">No public events available right now. Check back soon.</p>
          </div>
        )}
      </section>

    </div>
  );
}
