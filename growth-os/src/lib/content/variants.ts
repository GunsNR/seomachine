import { z } from "zod";
import { hashOf } from "../crypto";

export const PLATFORMS = ["facebook", "instagram", "linkedin", "tiktok", "youtube", "google_business"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABEL: Record<Platform, string> = {
  facebook: "Facebook Page", instagram: "Instagram", linkedin: "LinkedIn", tiktok: "TikTok", youtube: "YouTube", google_business: "Google Business Profile",
};

/** Caption limits as stated in platform docs; checked, not assumed safe. */
export const CAPTION_LIMIT: Record<Platform, number> = { facebook: 63206, instagram: 2200, linkedin: 3000, tiktok: 2200, youtube: 5000, google_business: 1500 };

export const VariantSchema = z.object({
  platform: z.enum(PLATFORMS),
  caption: z.string().max(63206),
  hook: z.string().max(300).default(""),
  /** Researched discovery keywords/hashtags. */
  hashtags: z.array(z.string().max(80)).max(30).default([]),
  /** Account handles a human has validated exist. */
  mentions: z.array(z.string().max(80)).max(20).default([]),
  /** Internal organizing tags. Never published. */
  internalTags: z.array(z.string().max(40)).max(20).default([]),
  /** YouTube only. */
  title: z.string().max(100).default(""),
});
export type Variant = z.infer<typeof VariantSchema>;

export const SlideSchema = z.object({ heading: z.string().max(90), body: z.string().max(280).default("") });
export const AssetSchema = z.object({
  kind: z.enum(["single", "carousel"]),
  slides: z.array(SlideSchema).min(1).max(10),
  footer: z.string().max(80).default(""),
  /** Where any imagery came from; required before export of third-party art. */
  license: z.string().max(200).default("Original — generated from brand text only"),
});
export type Asset = z.infer<typeof AssetSchema>;

export function variantIssues(v: Variant): string[] {
  const issues: string[] = [];
  if (!v.caption.trim()) issues.push("Caption is empty.");
  if (v.caption.length > CAPTION_LIMIT[v.platform]) issues.push(`Caption is ${v.caption.length} characters; ${PLATFORM_LABEL[v.platform]} allows ${CAPTION_LIMIT[v.platform]}.`);
  if (v.platform === "youtube" && !v.title.trim()) issues.push("YouTube needs a title.");
  if (v.platform === "instagram" && v.hashtags.length > 30) issues.push("Instagram allows up to 30 hashtags.");
  return issues;
}

/** Everything an approval binds to for the content itself. */
export function contentHash(title: string, variants: Variant[], asset: Asset | null): string {
  return hashOf({ title, variants, asset });
}

/** Approval binding: content + exact destinations + schedule instant. */
export function approvalHash(contentHashValue: string, destinationIds: string[], scheduleAt: Date | null): string {
  return hashOf({ c: contentHashValue, d: [...destinationIds].sort(), s: scheduleAt ? scheduleAt.toISOString() : null });
}
