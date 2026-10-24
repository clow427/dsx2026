/**
 * Returns the public origin to use for shareable links (registration URLs,
 * QR codes, social embeds, etc.).
 *
 * Strategy:
 * 1. If VITE_PUBLIC_SITE_URL is set, use it (lets owners pin a custom domain).
 * 2. In Lovable previews/local dev, use the assigned published site URL so
 *    share links, QR codes, and promoter URLs never point at preview hosts.
 * 3. Otherwise use window.location.origin — this is the published site or
 *    the user's custom domain, which is exactly what we want to share.
 */
const ASSIGNED_LIVE_ORIGIN = "https://event-spark-2.lovable.app";

export function getPublicOrigin(): string {
  const envUrl = (import.meta as any).env?.VITE_PUBLIC_SITE_URL as string | undefined;
  if (envUrl) return envUrl.replace(/\/$/, "");

  if (typeof window === "undefined") return "";

  const host = window.location.host;
  const isPreviewOrLocal =
    host.includes("id-preview--") ||
    host.includes("lovableproject.com") ||
    host.includes("localhost") ||
    host.includes("127.0.0.1");

  if (isPreviewOrLocal) return ASSIGNED_LIVE_ORIGIN;

  return window.location.origin;
}

export type RegistrationVariant = "minimal" | "split" | "landing";

export const REGISTRATION_VARIANTS: { id: RegistrationVariant; label: string; description: string }[] = [
  { id: "minimal", label: "Minimal", description: "Compact card — best for paid ads & social posts" },
  { id: "split", label: "Split screen", description: "Flyer + form side-by-side — great for email & newsletters" },
  { id: "landing", label: "Landing page", description: "Full hero with details — best for organic & web traffic" },
];

export function getRegistrationUrl(slug: string, variant?: RegistrationVariant): string {
  const base = `${getPublicOrigin()}/register/${slug}`;
  return variant ? `${base}/${variant}` : base;
}

export function getCompanyUrl(slug: string): string {
  return `${getPublicOrigin()}/company/${slug}`;
}
