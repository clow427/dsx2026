export const NEW_EVENT_DRAFT_KEY = "eventspark:create-event-draft:new";
export const EVENT_WORKSPACE_LAST_PATH_KEY = "eventspark:event-workspace:last-path";

const EVENT_WORKSPACE_FALLBACK_PATH = "/dashboard/events";
const CREATE_EVENT_PATH = "/dashboard/events/create";

export type EventDraftSnapshot = {
  step?: number;
  savedAt?: number;
  name?: string;
  startDate?: string;
  startTime?: string;
  endDate?: string;
  endTime?: string;
  timezone?: string;
  eventType?: string;
  description?: string;
  locationType?: string;
  locationValue?: string;
  locationAddress?: string;
  isPaid?: boolean;
  ticketPrice?: string;
  ticketTiers?: { id: string; name: string; price: string }[];
  requiresApproval?: boolean;
  capacity?: string;
  selectedTemplate?: string;
  fields?: unknown[];
  flyerUrl?: string | null;
  colorMode?: "light" | "dark";
};

const hasMeaningfulString = (value: unknown) => typeof value === "string" && value.trim().length > 0;

export const hasMeaningfulNewEventDraft = () => {
  try {
    const raw = localStorage.getItem(NEW_EVENT_DRAFT_KEY);
    if (!raw) return false;

    const draft = JSON.parse(raw) as EventDraftSnapshot;
    return Boolean(
      (typeof draft.step === "number" && draft.step > 1) ||
        hasMeaningfulString(draft.name) ||
        hasMeaningfulString(draft.startDate) ||
        hasMeaningfulString(draft.startTime) ||
        hasMeaningfulString(draft.endDate) ||
        hasMeaningfulString(draft.endTime) ||
        hasMeaningfulString(draft.description) ||
        hasMeaningfulString(draft.locationValue) ||
        hasMeaningfulString(draft.locationAddress) ||
        hasMeaningfulString(draft.ticketPrice) ||
        hasMeaningfulString(draft.capacity) ||
        hasMeaningfulString(draft.flyerUrl)
    );
  } catch {
    return false;
  }
};

export const getNewEventDraftSummary = (): EventDraftSnapshot | null => {
  try {
    const raw = localStorage.getItem(NEW_EVENT_DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as EventDraftSnapshot;
    return hasMeaningfulNewEventDraft() ? draft : null;
  } catch {
    return null;
  }
};

export const clearNewEventDraft = () => {
  try {
    localStorage.removeItem(NEW_EVENT_DRAFT_KEY);
    localStorage.removeItem(EVENT_WORKSPACE_LAST_PATH_KEY);
  } catch {}
};

export const getEventWorkspacePath = () => {
  try {
    const lastPath = localStorage.getItem(EVENT_WORKSPACE_LAST_PATH_KEY);
    if (lastPath?.startsWith(`${EVENT_WORKSPACE_FALLBACK_PATH}/`)) return lastPath;
    if (hasMeaningfulNewEventDraft()) return CREATE_EVENT_PATH;
  } catch {}

  return EVENT_WORKSPACE_FALLBACK_PATH;
};