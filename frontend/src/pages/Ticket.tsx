import { useEffect, useRef, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import QRCode from "qrcode";
import { ArrowLeft, Loader2, CalendarDays, MapPin, CheckCircle2, Download, Ticket as TicketIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { toast } from "sonner";

interface TicketData {
  id: string;
  event_id: string;
  status: string;
  checked_in_at: string | null;
  attendee_name: string;
  ticket_name?: string | null;
  event_name: string;
  event_date: string | null;
  end_date: string | null;
  timezone: string | null;
  location: string | null;
  location_type: string | null;
  primary_color: string | null;
  cover_image_url: string | null;
  event_slug: string | null;
}

function formatDateTime(iso: string | null, tz?: string | null) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: tz || undefined,
      timeZoneName: "short",
    }).format(d);
  } catch {
    return iso;
  }
}

const Ticket = () => {
  const { registrationId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [ticket, setTicket] = useState<TicketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const downloadRef = useRef<HTMLAnchorElement>(null);

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate(user ? "/dashboard/home" : "/");
    }
  };

  useEffect(() => {
    let active = true;
    (async () => {
      if (!registrationId) {
        setLoading(false);
        return;
      }
      const { data, error } = await supabase.rpc("get_ticket", { p_registration_id: registrationId });
      if (!active) return;
      if (error || !data) {
        setTicket(null);
      } else {
        setTicket(data as unknown as TicketData);
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [registrationId]);

  useEffect(() => {
    if (!registrationId) return;
    QRCode.toDataURL(registrationId, {
      width: 720,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
    })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, [registrationId]);

  const handleDownload = () => {
    if (!qrDataUrl || !ticket) return;
    const a = downloadRef.current;
    if (!a) return;
    a.href = qrDataUrl;
    a.download = `${ticket.event_name.replace(/[^\w-]+/g, "_")}_ticket.png`;
    a.click();
    toast.success("Ticket saved");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-7 h-7 animate-spin text-primary" />
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-background">
        <div className="max-w-md w-full bg-card rounded-3xl p-10 text-center">
          <TicketIcon className="w-10 h-10 mx-auto mb-4 text-muted-foreground" />
          <h1 className="text-2xl font-display font-bold mb-2">Ticket not found</h1>
          <p className="text-muted-foreground text-sm mb-6">
            This ticket link is invalid or the event is no longer live.
          </p>
          <Button
            onClick={handleBack}
            variant="outline"
            className="rounded-full h-11 px-5"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            {user ? "Back to my tickets" : "Back to home"}
          </Button>
        </div>
      </div>
    );
  }

  const brand = ticket.primary_color || "hsl(var(--primary))";
  const checkedIn = !!ticket.checked_in_at;

  return (
    <div className="min-h-screen bg-background px-4 py-8 sm:py-14 flex items-center justify-center overflow-x-hidden">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md"
      >
        <button
          type="button"
          onClick={handleBack}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4 -ml-1 px-2 h-9 rounded-full hover:bg-muted"
        >
          <ArrowLeft className="w-4 h-4" />
          {user ? "My tickets" : "Back"}
        </button>
        <div className="rounded-[28px] overflow-hidden bg-card shadow-[0_24px_70px_-20px_rgba(0,0,0,0.25)]">
          {/* Header band */}
          <div
            className="px-6 pt-7 pb-6 text-white relative"
            style={{ background: `linear-gradient(135deg, ${brand}, ${brand}cc)` }}
          >
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] opacity-90">
              <TicketIcon className="w-3.5 h-3.5" />
              Your ticket
            </div>
            <h1 className="font-display font-bold text-2xl sm:text-3xl mt-2 leading-tight tracking-[-0.02em]">
              {ticket.event_name}
            </h1>
            <div className="mt-4 text-sm/relaxed opacity-95">
              <div className="flex items-start gap-2">
                <CalendarDays className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{formatDateTime(ticket.event_date, ticket.timezone)}</span>
              </div>
              {ticket.location && (
                <div className="flex items-start gap-2 mt-1.5">
                  <MapPin className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{ticket.location}</span>
                </div>
              )}
            </div>
          </div>

          {/* Perforation */}
          <div className="relative h-6 bg-card">
            <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 border-t border-dashed border-border" />
            <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-background" />
            <div className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-background" />
          </div>

          {/* QR */}
          <div className="px-6 pb-7">
            <div className="rounded-2xl bg-white p-4 flex items-center justify-center">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="Ticket QR code" className="w-full max-w-[260px] aspect-square" />
              ) : (
                <div className="w-[260px] aspect-square flex items-center justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>

            <div className="mt-5 space-y-2 text-center">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Attendee</p>
              <p className="font-display font-semibold text-lg">{ticket.attendee_name}</p>
              {ticket.ticket_name && (
                <p className="text-xs text-muted-foreground">{ticket.ticket_name}</p>
              )}
            </div>

            {checkedIn ? (
              <div className="mt-5 rounded-full bg-emerald-50 text-emerald-700 px-4 py-2 text-xs font-medium flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                Checked in {ticket.checked_in_at ? new Date(ticket.checked_in_at).toLocaleString() : ""}
              </div>
            ) : (
              <div className="mt-5 rounded-full bg-muted text-muted-foreground px-4 py-2 text-xs font-medium text-center">
                Show this QR at the door
              </div>
            )}

            <Button
              onClick={handleDownload}
              className="w-full mt-5 rounded-full h-11 bg-foreground text-background hover:bg-foreground/90"
            >
              <Download className="w-4 h-4 mr-2" />
              Save ticket
            </Button>

            <p className="text-[11px] text-muted-foreground text-center mt-4">
              Bookmark this page to keep your ticket handy.
            </p>
          </div>
        </div>

        {ticket.event_slug && (
          <div className="text-center mt-5">
            <Link
              to={`/register/${ticket.event_slug}`}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              View event page
            </Link>
          </div>
        )}

        <a ref={downloadRef} className="hidden" />
      </motion.div>
    </div>
  );
};

export default Ticket;
