// Shared helpers for displaying an event's price summary across the app.
// Tier-level "Free" labels (one tier with no price) are still rendered locally,
// but the *event-level* badge should reflect the cheapest paid tier when present.

export type TierLike = { price?: number | string | null; currency?: string | null };

export type EventPriceish = {
  ticket_tiers?: unknown;
  ticket_price?: number | string | null;
};

const toNum = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function getEventPriceLabel(event: EventPriceish): string {
  const tiers: TierLike[] = Array.isArray(event?.ticket_tiers)
    ? (event!.ticket_tiers as TierLike[])
    : [];
  const priced = tiers.filter((t) => toNum(t?.price) > 0);

  if (priced.length > 0) {
    const prices = priced.map((t) => toNum(t.price));
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const cur = (priced[0].currency || "USD") as string;
    const fmt = (n: number) =>
      new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: cur,
        maximumFractionDigits: 0,
      }).format(n);
    return priced.length > 1 && min !== max ? `from ${fmt(min)}` : fmt(min);
  }

  const legacy = toNum(event?.ticket_price);
  if (legacy > 0) {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(legacy);
  }

  return "Free";
}

export function isEventPaid(event: EventPriceish): boolean {
  return getEventPriceLabel(event) !== "Free";
}
