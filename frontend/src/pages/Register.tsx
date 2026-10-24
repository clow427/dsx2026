import { useState, useCallback, useMemo, useEffect } from "react";
import { incrementLinkClick } from "@/hooks/useTrackingLinks";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { CalendarDays, MapPin, Video, Globe, Loader2, CheckCircle2, Clock, Zap } from "lucide-react";
import { useEventBySlug, Event } from "@/hooks/useEvents";
import { useFormFields } from "@/hooks/useFormFields";
import { useCreateRegistration } from "@/hooks/useRegistrations";
import { useEventModules } from "@/hooks/useEventModules";

import { PublicEventPage } from "@/components/event-public/PublicEventPage";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Tables } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import PhoneInput from "react-phone-number-input";
import "react-phone-number-input/style.css";
import { AuroraBackdrop, GlassCard } from "@/components/register/AuroraBackdrop";
import type { TicketTier } from "@/components/event-detail/TicketTiersManager";
import { Crown, Ticket as TicketIcon, Check, Minus, Plus } from "lucide-react";

type FormField = Tables<"form_fields">;

const formatTicketPrice = (price: number, currency = "USD") => {
  if (!price) return "Free";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(price);
  } catch {
    return `${currency} ${price}`;
  }
};

const QuantityStepper = ({
  value, onChange, min = 1, max = 10, brandColor,
}: { value: number; onChange: (n: number) => void; min?: number; max?: number; brandColor: string }) => (
  <div
    className="inline-flex items-center gap-0 rounded-full bg-background/80 backdrop-blur p-1"
    onClick={(e) => e.stopPropagation()}
  >
    <button
      type="button"
      onClick={() => onChange(Math.max(min, value - 1))}
      disabled={value <= min}
      className="w-8 h-8 rounded-full inline-flex items-center justify-center text-foreground/70 hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent transition"
      aria-label="Decrease quantity"
    >
      <Minus className="w-3.5 h-3.5" />
    </button>
    <span
      className="w-7 text-center text-sm font-display font-semibold tabular-nums"
      style={{ color: brandColor }}
    >
      {value}
    </span>
    <button
      type="button"
      onClick={() => onChange(Math.min(max, value + 1))}
      disabled={value >= max}
      className="w-8 h-8 rounded-full inline-flex items-center justify-center text-foreground/70 hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent transition"
      aria-label="Increase quantity"
    >
      <Plus className="w-3.5 h-3.5" />
    </button>
  </div>
);

const TicketPicker = ({
  tickets, selectedId, onSelect, quantity, onQuantityChange, brandColor,
}: {
  tickets: TicketTier[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  quantity: number;
  onQuantityChange: (n: number) => void;
  brandColor: string;
}) => (
  <div className="space-y-2.5">
    <div className="flex items-baseline justify-between">
      <Label className="text-xs font-semibold tracking-[0.12em] uppercase text-muted-foreground">
        Choose your ticket
      </Label>
      <span className="text-[10px] text-muted-foreground">{tickets.length} available</span>
    </div>
    <div className="space-y-2">
      {tickets.map((t) => {
        const selected = selectedId === t.id;
        return (
          <motion.button
            type="button"
            key={t.id}
            onClick={() => onSelect(t.id)}
            whileTap={{ scale: 0.99 }}
            className={`group w-full text-left relative overflow-hidden rounded-2xl p-4 transition-all ${
              selected ? "bg-card" : "bg-muted/40 hover:bg-muted/70"
            }`}
            style={selected ? {
              boxShadow: `0 0 0 1.5px ${brandColor}, 0 18px 40px -20px ${brandColor}66`,
            } : undefined}
          >
            {selected && (
              <motion.div
                layoutId="ticket-glow"
                className="absolute inset-0 -z-10 opacity-60"
                style={{ background: `radial-gradient(circle at 0% 50%, ${brandColor}1a, transparent 60%)` }}
              />
            )}
            <div className="flex items-center gap-3.5">
              <div
                className={`shrink-0 w-10 h-10 rounded-full inline-flex items-center justify-center transition ${
                  selected ? "text-white" : t.is_vip ? "text-foreground bg-background" : "bg-background text-muted-foreground"
                }`}
                style={selected ? {
                  background: t.is_vip
                    ? `linear-gradient(135deg, ${brandColor}, hsl(265 90% 62%))`
                    : brandColor,
                } : undefined}
              >
                {t.is_vip ? <Crown className="w-4 h-4" /> : <TicketIcon className="w-4 h-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-display font-semibold tracking-[-0.01em] truncate">
                    {t.name || "Untitled"}
                  </span>
                  {t.is_vip && (
                    <span
                      className="text-[9px] uppercase tracking-[0.2em] font-bold px-1.5 py-0.5 rounded-full"
                      style={{ color: brandColor, background: `${brandColor}1a` }}
                    >
                      VIP
                    </span>
                  )}
                </div>
                {t.description && (
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{t.description}</p>
                )}
              </div>
              <div className="text-right shrink-0 flex items-center gap-3">
                <div>
                  <div className="text-base font-display font-bold tabular-nums tracking-[-0.01em]">
                    {formatTicketPrice(t.price, t.currency || "USD")}
                  </div>
                </div>
                <div
                  className={`shrink-0 w-5 h-5 rounded-full inline-flex items-center justify-center transition ${
                    selected ? "scale-100" : "scale-0"
                  }`}
                  style={{ background: brandColor }}
                >
                  <Check className="w-3 h-3 text-white" strokeWidth={3} />
                </div>
              </div>
            </div>

            {selected && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden"
              >
                <div className="mt-3.5 pt-3.5 border-t border-border/60 flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Quantity</span>
                  <QuantityStepper value={quantity} onChange={onQuantityChange} brandColor={brandColor} />
                </div>
              </motion.div>
            )}
          </motion.button>
        );
      })}
    </div>
  </div>
);


// ─── Helper: format event date/time with timezone ───
function formatEventDateTime(event: Event) {
  const tz = event.timezone || "America/New_York";
  const parts: string[] = [];

  if (event.event_date) {
    const start = new Date(event.event_date);
    const dateStr = start.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: tz });
    const timeStr = start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });

    let line = `${dateStr} · ${timeStr}`;

    if (event.event_end_date) {
      const end = new Date(event.event_end_date);
      const endDateStr = end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: tz });
      const endTimeStr = end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });

      if (endDateStr === dateStr) {
        line += ` – ${endTimeStr}`;
      } else {
        line += ` – ${endDateStr} · ${endTimeStr}`;
      }
    }

    // Timezone abbreviation
    const tzAbbr = start.toLocaleTimeString("en-US", { timeZone: tz, timeZoneName: "short" }).split(" ").pop() || tz;
    line += ` ${tzAbbr}`;

    parts.push(line);
  }

  return parts.join("");
}

// ─── Extracted stable components ───

const SuccessCard = ({ brandColor, eventName, waitlisted, isDark }: { brandColor: string; eventName: string; waitlisted: boolean; isDark?: boolean }) => (
  <motion.div key="success" initial={{ opacity: 0, scale: 0.92, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ type: "spring", damping: 18 }} className="w-full max-w-lg mx-auto relative z-10">
    <GlassCard isDark={isDark} brandColor={brandColor}>
      <div className="p-10 text-center">
        <motion.div initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", delay: 0.2, damping: 12 }} className="relative inline-block mb-5">
          <div className="absolute inset-0 blur-2xl rounded-full" style={{ background: brandColor, opacity: 0.5 }} />
          <div className="relative w-20 h-20 rounded-full flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${brandColor}, hsl(265 90% 65%))`, boxShadow: `0 12px 40px -8px ${brandColor}88` }}>
            {waitlisted ? <Clock className="w-9 h-9 text-white" /> : <CheckCircle2 className="w-9 h-9 text-white" />}
          </div>
        </motion.div>
        <h2 className="text-3xl font-display font-bold mb-3 tracking-[-0.02em]">
          {waitlisted ? "You're on the waitlist" : "You're registered"}
        </h2>
        <p className="text-muted-foreground leading-relaxed">
          {waitlisted
            ? <>This event is at capacity. We've added you to the waitlist for <strong>{eventName}</strong> and will email you if a spot opens up.</>
            : <>Thank you for registering for <strong>{eventName}</strong>. You'll receive a confirmation email shortly.</>}
        </p>
      </div>
    </GlassCard>
  </motion.div>
);

const EventInfo = ({ event, className = "" }: { event: Event; className?: string }) => {
  const [expanded, setExpanded] = useState(false);
  const locationIcon = event.location_type === "physical" ? <MapPin className="w-4 h-4" /> : event.location_type === "hybrid" ? <Globe className="w-4 h-4" /> : <Video className="w-4 h-4" />;
  const locationLabel = event.location_type === "physical" ? "In-Person" : event.location_type === "hybrid" ? "Hybrid" : "Virtual";
  const dateTimeStr = formatEventDateTime(event);

  // Truncate to first 2 sentences
  const description = event.description || "";
  const sentences = description.match(/[^.!?]*[.!?]+/g) || [description];
  const isTruncatable = sentences.length > 1;
  const truncated = isTruncatable ? sentences.slice(0, 1).join("").trim() + "…" : description;

  return (
    <div className={`pt-6 md:pt-0 ${className}`}>
      {dateTimeStr && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
          <CalendarDays className="w-4 h-4 shrink-0" />
          {dateTimeStr}
        </div>
      )}
      <h1 className="text-2xl sm:text-4xl md:text-7xl font-display font-bold">{event.name}</h1>
      {description && (
        <div className="mt-4 mb-4">
          <p className="text-muted-foreground text-sm leading-relaxed">
            {expanded || !isTruncatable ? description : truncated}
          </p>
          {isTruncatable && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="text-sm font-medium mt-1 hover:underline"
              style={{ color: "hsl(var(--primary))" }}
            >
              {expanded ? "Show less" : "Read more"}
            </button>
          )}
        </div>
      )}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {locationIcon} {locationLabel}
      </div>
    </div>
  );
};

const RegistrationForm = ({
  formFields,
  formData,
  onFieldChange,
  consent,
  onConsentChange,
  onSubmit,
  isPending,
  brandColor,
  tickets,
  selectedTicketId,
  onSelectTicket,
  quantity,
  onQuantityChange,
  className = "",
}: {
  formFields: FormField[] | undefined;
  formData: Record<string, string>;
  onFieldChange: (label: string, value: string) => void;
  consent: boolean;
  onConsentChange: (v: boolean) => void;
  onSubmit: (e: React.FormEvent) => void;
  isPending: boolean;
  brandColor: string;
  tickets: TicketTier[];
  selectedTicketId: string | null;
  onSelectTicket: (id: string) => void;
  quantity: number;
  onQuantityChange: (n: number) => void;
  className?: string;
}) => {
  const selectedTicket = tickets.find((t) => t.id === selectedTicketId);
  const subtotal = selectedTicket ? selectedTicket.price * quantity : 0;
  const isPaid = !!selectedTicket && selectedTicket.price > 0;
  const ctaLabel = isPending
    ? "Processing…"
    : isPaid
      ? `Get ${quantity} ticket${quantity > 1 ? "s" : ""} · ${formatTicketPrice(subtotal, selectedTicket.currency || "USD")}`
      : selectedTicket
        ? `Reserve ${quantity > 1 ? `${quantity} spots` : "my spot"}`
        : "Register now";

  return (
    <form onSubmit={onSubmit} className={`space-y-6 ${className}`}>
      {tickets.length > 0 && (
        <TicketPicker
          tickets={tickets}
          selectedId={selectedTicketId}
          onSelect={onSelectTicket}
          quantity={quantity}
          onQuantityChange={onQuantityChange}
          brandColor={brandColor}
        />
      )}

      {(formFields?.length ?? 0) > 0 && (
        <div className="space-y-1">
          <Label className="text-xs font-semibold tracking-[0.12em] uppercase text-muted-foreground">
            Your details
          </Label>
        </div>
      )}

      <div className="space-y-3.5">
        {formFields?.map((field) => (
          <div key={field.id} className="space-y-1.5">
            <Label className="text-xs font-medium text-foreground/80">
              {field.label}{field.required && <span style={{ color: brandColor }}> *</span>}
            </Label>
            {field.field_type === "tel" ? (
              <PhoneInput
                international
                defaultCountry="US"
                placeholder={field.placeholder || field.label}
                value={formData[field.label] || ""}
                onChange={(v) => onFieldChange(field.label, v || "")}
                className="phone-input-wrapper"
              />
            ) : (
              <Input
                type={field.field_type === "email" ? "email" : "text"}
                placeholder={field.placeholder || field.label}
                required={field.required}
                value={formData[field.label] || ""}
                onChange={e => onFieldChange(field.label, e.target.value)}
                className="h-12 rounded-2xl bg-muted/40 border-0 px-4 text-sm placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-offset-0"
                style={{ ['--tw-ring-color' as any]: brandColor }}
              />
            )}
          </div>
        ))}
      </div>

      {isPaid && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between rounded-2xl bg-muted/40 px-4 py-3"
        >
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-muted-foreground">Order total</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {quantity} × {selectedTicket!.name} @ {formatTicketPrice(selectedTicket!.price, selectedTicket!.currency)}
            </p>
          </div>
          <div className="text-2xl font-display font-bold tabular-nums tracking-[-0.02em]" style={{ color: brandColor }}>
            {formatTicketPrice(subtotal, selectedTicket!.currency || "USD")}
          </div>
        </motion.div>
      )}

      <div className="flex items-start gap-2.5 pt-1">
        <Checkbox id="gdpr" checked={consent} onCheckedChange={(c) => onConsentChange(!!c)} className="mt-0.5" />
        <Label htmlFor="gdpr" className="text-xs text-muted-foreground leading-relaxed cursor-pointer">
          I agree to receive communications about this event and consent to the processing of my data in accordance with the Privacy Policy.
        </Label>
      </div>

      <Button
        type="submit"
        className="w-full h-14 text-base border-0 text-white rounded-full font-display font-semibold tracking-[-0.01em] transition-transform hover:scale-[1.01] active:scale-[0.99]"
        style={{
          background: `linear-gradient(135deg, ${brandColor}, hsl(265 90% 62%))`,
          boxShadow: `0 18px 40px -12px ${brandColor}99, 0 0 0 1px rgba(255,255,255,0.08) inset`,
        }}
        disabled={isPending}
      >
        {isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processing…</> : ctaLabel}
      </Button>
    </form>
  );
};


const FlyerImage = ({ flyerUrl, eventName, className = "" }: { flyerUrl: string | null; eventName: string; className?: string }) => (
  flyerUrl ? (
    <div className={`flex items-start justify-center ${className}`}>
      <img src={flyerUrl} alt={eventName} className="w-full h-full object-contain" />
    </div>
  ) : null
);

const PoweredBy = () => (
  <p className="text-center text-xs text-muted-foreground mt-6">
    Powered by <span className="font-semibold">6degrees</span>
  </p>
);

// ─── Main component ───

const Register = () => {
  const { slug, variant } = useParams();
  const navigate = useNavigate();
  const { data: event, isLoading: eventLoading } = useEventBySlug(slug);
  const { data: modules = [], isLoading: modulesLoading } = useEventModules(event?.id);
  const { data: formFields, isLoading: fieldsLoading } = useFormFields(event?.id);
  const createReg = useCreateRegistration();
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [consent, setConsent] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [waitlisted, setWaitlisted] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const tickets: TicketTier[] = useMemo(
    () => (Array.isArray((event as any)?.ticket_tiers) ? ((event as any).ticket_tiers as TicketTier[]) : []),
    [event]
  );
  // Auto-select single ticket
  useEffect(() => {
    if (tickets.length === 1 && !selectedTicketId) setSelectedTicketId(tickets[0].id);
  }, [tickets, selectedTicketId]);
  const [searchParams] = useSearchParams();
  const utm = useMemo(() => {
    const keys = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "ref"];
    const out: Record<string, string> = {};
    keys.forEach(k => {
      const v = searchParams.get(k);
      if (v) out[k.replace("utm_", "")] = v;
    });
    const lid = searchParams.get("lid");
    if (lid) out.lid = lid;
    return Object.keys(out).length ? { ...out, landed_at: new Date().toISOString() } : null;
  }, [searchParams]);

  // Best-effort click counter for saved promoter links
  useEffect(() => {
    const lid = searchParams.get("lid");
    if (lid && /^[0-9a-f-]{36}$/i.test(lid)) {
      incrementLinkClick(lid);
    }
  }, [searchParams]);

  const handleFieldChange = useCallback((label: string, value: string) => {
    setFormData(prev => ({ ...prev, [label]: value }));
  }, []);

  if (eventLoading || fieldsLoading || modulesLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <h1 className="text-2xl font-display font-bold mb-2">Event Not Found</h1>
            <p className="text-muted-foreground">This event may have ended or the link is invalid.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (event && event.status !== "live") {
      toast.error("This event isn't published yet. Publish it from the dashboard to accept registrations.");
      return;
    }
    if (!consent) {
      toast.error("Please accept the privacy policy to register.");
      return;
    }
    const missing = formFields?.filter(f => f.required && !formData[f.label]?.trim());
    if (missing && missing.length > 0) {
      toast.error(`Please fill in: ${missing.map(f => f.label).join(", ")}`);
      return;
    }
    if (tickets.length > 0 && !selectedTicketId) {
      toast.error("Please choose a ticket to continue.");
      return;
    }
    const selectedTicket = tickets.find((t) => t.id === selectedTicketId);
    const submitData: Record<string, any> = { ...formData };
    if (selectedTicket) {
      submitData["Ticket"] = selectedTicket.name;
      submitData["ticket_tier_id"] = selectedTicket.id;
      submitData["ticket_price"] = selectedTicket.price;
      submitData["ticket_currency"] = selectedTicket.currency;
      submitData["ticket_quantity"] = quantity;
      submitData["ticket_subtotal"] = selectedTicket.price * quantity;
      if (selectedTicket.is_vip) submitData["is_vip"] = true;
    }
    try {
      const result = await createReg.mutateAsync({ event_id: event.id, data: submitData, utm });
      setWaitlisted(!!result?.waitlisted);
      setSubmitted(true);

      // Redirect confirmed (non-waitlisted) registrants to their ticket page
      if (result?.id && !result.waitlisted) {
        // Small delay so the success state isn't visually jarring during nav
        setTimeout(() => navigate(`/ticket/${result.id}`, { replace: true }), 400);
      }


      // Fire-and-forget confirmation email (only if event opted in)
      const sendConfirm = (event as any).send_confirmation_email !== false;
      if (sendConfirm) {
        const email = (formData["Email Address"] || formData["Email"] || formData["email"] || "").toString().trim().toLowerCase();
        const attendeeName = (formData["Full Name"] || formData["Name"] || formData["name"] || "").toString().trim();
        if (email) {
          const tz = event.timezone || "America/New_York";
          // Email content is now rebuilt server-side from the registration row
          // by the `notify` function. Client only passes the registration id.
          void supabase.functions.invoke("notify", {
            body: { kind: "registration", registration_id: result.id },
          }).catch((e) => console.warn("Confirmation email enqueue failed", e));
          void tz; // silence unused
        }

      }
    } catch (err: any) {
      toast.error(err.message || "Registration failed");
    }
  };

  const brandColor = event.primary_color || "#7C3AED";
  const isDark = (event as any).color_mode === "dark";

  const formProps = {
    formFields,
    formData,
    onFieldChange: handleFieldChange,
    consent,
    onConsentChange: setConsent,
    onSubmit: handleSubmit,
    isPending: createReg.isPending,
    brandColor,
    tickets,
    selectedTicketId,
    onSelectTicket: setSelectedTicketId,
    quantity,
    onQuantityChange: setQuantity,
  };

  const isPreview = event.status !== "live";

  if (submitted) {
    return (
      <div className={isDark ? "dark" : ""}>
        <div className="min-h-screen relative flex items-center justify-center px-4 py-12 text-foreground overflow-hidden bg-background">
          <AuroraBackdrop brandColor={brandColor} isDark={isDark} />
          <SuccessCard brandColor={brandColor} eventName={event.name} waitlisted={waitlisted} isDark={isDark} />
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-hidden">
      {isPreview && (
        <div className="sticky top-0 z-50 w-full bg-foreground text-background text-center text-xs sm:text-sm py-2 px-4 font-medium">
          Preview mode — this event is a {event.status === "draft" ? "draft" : event.status}. Registrations are disabled until you publish.
        </div>
      )}
      <PublicEventPage
        event={event}
        modules={modules}
        brandColor={brandColor}
        isDark={isDark}
        formattedDate={event.event_date ? formatEventDateTime(event) : ""}
        formSlot={<RegistrationForm {...formProps} className="pb-24 sm:pb-0" />}
      />
    </div>
  );
};

export default Register;

