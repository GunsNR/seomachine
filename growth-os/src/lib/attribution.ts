import { z } from "zod";

/**
 * A touch is what we know about how someone arrived. Unknown stays unknown —
 * we never infer a source from aggregate GA4/GSC data.
 */
export const TouchSchema = z.object({
  source: z.string().max(100).default("unknown"),
  medium: z.string().max(100).default("unknown"),
  campaign: z.string().max(150).default(""),
  content: z.string().max(150).default(""), // carries our contentKey
  landingPage: z.string().max(500).default(""),
  referrer: z.string().max(500).default(""),
  at: z.string().datetime(),
  model: z.literal("captured").default("captured"),
});
export type Touch = z.infer<typeof TouchSchema>;

const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

/** Build a touch from a landing URL's UTM parameters and the referrer. */
export function touchFromRequest(input: { landingPage?: string; referrer?: string; utm?: Record<string, string | undefined> }, at = new Date()): Touch {
  let params: URLSearchParams | null = null;
  try {
    if (input.landingPage) params = new URL(input.landingPage).searchParams;
  } catch {
    params = null;
  }
  const get = (k: string) => clip(input.utm?.[k] ?? params?.get(`utm_${k}`) ?? "", 150);
  let source = get("source");
  let medium = get("medium");
  if (!source && input.referrer) {
    try {
      source = new URL(input.referrer).hostname.replace(/^www\./, "");
      medium = medium || "referral";
    } catch {
      /* unparseable referrer stays unknown */
    }
  }
  return TouchSchema.parse({
    source: source || "unknown",
    medium: medium || (source ? "unknown" : "unknown"),
    campaign: get("campaign"),
    content: get("content"),
    landingPage: clip(input.landingPage ? input.landingPage.split("?")[0] : "", 500),
    referrer: clip(input.referrer, 500),
    at: at.toISOString(),
  });
}

export function sourceLabel(t: Partial<Touch> | null | undefined): string {
  if (!t || !t.source || t.source === "unknown") return "Unknown source";
  return t.medium && t.medium !== "unknown" ? `${t.source} / ${t.medium}` : t.source;
}

export function parseTouch(v: unknown): Touch | null {
  const r = TouchSchema.safeParse(v);
  return r.success ? r.data : null;
}
