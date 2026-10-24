import { useState } from "react";
import { toast } from "sonner";
import {
  SiGoogledrive, SiGmail, SiHubspot, SiSlack,
  SiTelegram, SiGooglesheets, SiTwilio, SiGooglecalendar,
} from "react-icons/si";
import { Mail, MessagesSquare, HardDrive, Copy, Check } from "lucide-react";

type Connector = {
  id: string;
  name: string;
  description: string;
  Icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  brand: string;
  category: string;
  /** Tailored Lovable prompt that walks the user through wiring this integration into eventspark. */
  prompt: string;
};

const connectors: Connector[] = [
  // ── Calendar ─────────────────────────────────────────────────────────
  {
    id: "google_calendar",
    name: "Google Calendar",
    description: "Push live events to your calendar and let attendees add events with one click.",
    Icon: SiGooglecalendar, brand: "#4285F4", category: "Calendar",
    prompt: "Connect Google Calendar to eventspark. When I publish an event, automatically create a matching Google Calendar event on my connected account and store the calendar event id back on the event row. On the public registration page, add an 'Add to Google Calendar' button that prefills the event details for the attendee. Keep it simple: only sync events I own, and update the calendar event if I edit the time, title, or location.",
  },

  // ── Email ────────────────────────────────────────────────────────────
  {
    id: "google_mail",
    name: "Gmail",
    description: "Send confirmations and reminders from your own Gmail address instead of the default sender.",
    Icon: SiGmail, brand: "#EA4335", category: "Email",
    prompt: "Connect Gmail to eventspark so my registration confirmations, waitlist notices, and event reminders are sent from my own Gmail address with proper threading. Add a per-event toggle 'Send from my Gmail' in the Settings tab. Fall back to the default eventspark sender if Gmail isn't connected or rate-limited.",
  },
  {
    id: "microsoft_outlook",
    name: "Microsoft Outlook",
    description: "Send transactional emails from your Outlook / Microsoft 365 mailbox.",
    Icon: Mail, brand: "#0072C6", category: "Email",
    prompt: "Connect Microsoft Outlook to eventspark so transactional emails (confirmation, reminder, waitlist) can be sent from my own Outlook mailbox. Add a per-event toggle 'Send from my Outlook' in Settings, with a clear fallback to the default sender on failure.",
  },

  // ── Messaging / Comms ────────────────────────────────────────────────
  {
    id: "slack",
    name: "Slack",
    description: "Drop a message in a channel every time someone registers, hits the waitlist, or checks in.",
    Icon: SiSlack, brand: "#4A154B", category: "Messaging",
    prompt: "Connect Slack to eventspark. In an event's Settings tab, let me pick a Slack channel and choose which events trigger notifications: new registration, waitlist join, check-in, and capacity reached. Include the attendee name, ticket type, and event name in each message, with a link back to the event dashboard.",
  },
  {
    id: "microsoft_teams",
    name: "Microsoft Teams",
    description: "Notify a Teams channel when registrations come in or capacity is reached.",
    Icon: MessagesSquare, brand: "#4B53BC", category: "Messaging",
    prompt: "Connect Microsoft Teams to eventspark. Per event, let me pick a Teams channel and toggle notifications for new registrations, waitlist joins, check-ins, and capacity-reached. Each message should include attendee name, ticket type, event name, and a link back to the event dashboard.",
  },
  {
    id: "telegram",
    name: "Telegram",
    description: "Send live registration alerts to a Telegram chat or channel via a bot.",
    Icon: SiTelegram, brand: "#26A5E4", category: "Messaging",
    prompt: "Connect Telegram to eventspark. Let me paste a chat id (or pick from chats my bot is in) and pick which events send alerts. Trigger messages on new registration, waitlist, and check-in, formatted with attendee name, ticket type, and a deep link to the dashboard.",
  },
  {
    id: "twilio",
    name: "Twilio SMS",
    description: "Send SMS reminders before the event and check-in confirmations on arrival.",
    Icon: SiTwilio, brand: "#F22F46", category: "Messaging",
    prompt: "Connect Twilio to eventspark to send SMS to attendees who provided a phone number. Add per-event toggles for: 24-hour SMS reminder, 1-hour SMS reminder, and SMS check-in confirmation. Respect timezone and only message attendees with status='registered' or 'checked_in'. Show estimated SMS volume before enabling.",
  },

  // ── CRM ──────────────────────────────────────────────────────────────
  {
    id: "hubspot",
    name: "HubSpot",
    description: "Sync attendees into HubSpot as contacts and tag them by event.",
    Icon: SiHubspot, brand: "#FF7A59", category: "CRM",
    prompt: "Connect HubSpot to eventspark. When someone registers, upsert them as a HubSpot contact (email, name, phone, company, job title) and add a tag/list for the event. Also push a 'Registered for {event name}' timeline event. Per-event toggle to enable, plus the ability to map custom registration form fields to HubSpot contact properties.",
  },

  // ── Productivity / Storage ───────────────────────────────────────────
  {
    id: "google_sheets",
    name: "Google Sheets",
    description: "Mirror your attendee list to a live Google Sheet for sharing and reporting.",
    Icon: SiGooglesheets, brand: "#0F9D58", category: "Productivity",
    prompt: "Connect Google Sheets to eventspark. For each event, let me pick or create a Sheet. Mirror the attendee list (name, email, phone, ticket type, status, registered_at, checked_in_at, custom form fields) and keep it in sync on every change. Append-and-update by registration id so manual edits in the sheet aren't clobbered.",
  },
  {
    id: "google_drive",
    name: "Google Drive",
    description: "Auto-save attendee CSV exports and event assets to a Drive folder.",
    Icon: SiGoogledrive, brand: "#1FA463", category: "Productivity",
    prompt: "Connect Google Drive to eventspark. Let me pick a target folder per event. Automatically upload attendee CSV exports (daily and on event close) and any uploaded flyers/assets there. Keep the latest export named consistently and archive previous versions in a /history subfolder.",
  },
  {
    id: "microsoft_onedrive",
    name: "Microsoft OneDrive",
    description: "Auto-save attendee CSV exports and event assets to a OneDrive folder.",
    Icon: HardDrive, brand: "#0364B8", category: "Productivity",
    prompt: "Connect Microsoft OneDrive to eventspark. Let me pick a target folder per event. Automatically upload attendee CSV exports (daily and on event close) and any uploaded flyers/assets there. Keep the latest export named consistently and archive previous versions in a /history subfolder.",
  },
];

const grouped = connectors.reduce<Record<string, Connector[]>>((acc, c) => {
  (acc[c.category] ??= []).push(c);
  return acc;
}, {});

const categoryOrder = ["Calendar", "Email", "Messaging", "CRM", "Productivity"];
const sortedCategories = categoryOrder.filter(c => grouped[c]);

const Integrations = () => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyPrompt = async (c: Connector) => {
    const writeFallback = (text: string) => {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.top = "0";
      ta.style.left = "0";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      let ok = false;
      try {
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }
      document.body.removeChild(ta);
      return ok;
    };

    const onSuccess = () => {
      setCopiedId(c.id);
      toast.success(`Prompt copied — paste it into Lovable to wire up ${c.name}.`);
      setTimeout(() => setCopiedId((curr) => (curr === c.id ? null : curr)), 2000);
    };

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(c.prompt);
        onSuccess();
        return;
      }
      throw new Error("clipboard-api-unavailable");
    } catch {
      if (writeFallback(c.prompt)) {
        onSuccess();
      } else {
        toast.error("Couldn't copy. Try selecting the prompt manually.");
      }
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-display font-bold">Integrations</h1>
        <p className="text-muted-foreground">
          Each integration ships with a ready-to-paste Lovable prompt — copy it, drop it into a chat with Lovable, and it'll guide you through the setup end-to-end.
        </p>
      </div>

      {sortedCategories.map((category) => (
        <div key={category}>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">{category}</h2>
          <div className="rounded-xl divide-y divide-muted">
            {grouped[category].map((c) => {
              const copied = copiedId === c.id;
              return (
                <div
                  key={c.id}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-muted/50 transition-colors first:rounded-t-xl last:rounded-b-xl"
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: `${c.brand}14` }}
                  >
                    <c.Icon className="w-5 h-5" style={{ color: c.brand }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-sm">{c.name}</h3>
                    <p className="text-xs text-muted-foreground truncate">{c.description}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyPrompt(c)}
                    className={`shrink-0 inline-flex items-center gap-1.5 rounded-full text-xs font-medium px-3.5 h-9 transition-colors ${
                      copied
                        ? "bg-foreground text-background"
                        : "bg-muted text-foreground hover:bg-foreground hover:text-background"
                    }`}
                  >
                    {copied ? (
                      <><Check className="w-3.5 h-3.5" /> Copied</>
                    ) : (
                      <><Copy className="w-3.5 h-3.5" /> Copy prompt</>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

export default Integrations;
