import { approvedFacts, prohibitedHits, type BrandProfile } from "../brand";
import type { Asset, Platform, Variant } from "./variants";

/**
 * Deterministic content drafts from a brief and APPROVED brand facts only.
 * Labelled "Template" in the UI. No invented statistics, testimonials,
 * credentials or growth claims: if a fact isn't approved, it isn't used.
 */
export function templateVariants(p: BrandProfile, brief: { objective: string; audienceQuestion: string; cta: string; destinationUrl: string; contentKey: string; campaignKey: string }, platforms: Platform[]): { variants: Variant[]; asset: Asset; blocked: string[] } {
  const service = approvedFacts(p, "service")[0]?.text ?? p.offers[0] ?? "our services";
  const link = utm(brief.destinationUrl, brief.campaignKey, brief.contentKey);
  const q = brief.audienceQuestion.replace(/\?*$/, "?");
  const base = `${q}\n\nShort answer from ${p.businessName}: it depends on a few things we check on every visit. Here's what to look at before you call anyone.`;
  const variants: Variant[] = platforms.map((platform) => {
    const caption =
      platform === "linkedin" ? `${base}\n\n${brief.cta}: ${link}`
      : platform === "instagram" ? `${q}\n\nSwipe for what we check first. ${brief.cta} — link in bio.`
      : platform === "tiktok" ? `${q} Here's what we check first.`
      : platform === "youtube" ? `${base}\n\n${brief.cta}: ${link}`
      : platform === "google_business" ? `${q} ${p.businessName} serves ${p.serviceAreas.slice(0, 3).join(", ") || "your area"}. ${brief.cta}.`
      : `${base}\n\n${brief.cta}: ${link}`;
    return { platform, caption, hook: q, // Hashtags must come from research, so templates never invent them.
      hashtags: [], mentions: [], internalTags: [brief.campaignKey], title: platform === "youtube" ? q.slice(0, 100) : "" };
  });
  const asset: Asset = {
    kind: "carousel",
    slides: [
      { heading: q.slice(0, 90), body: "" },
      { heading: "What we check first", body: `On every ${service.toLowerCase()} call we look at the cause before quoting a fix.` },
      { heading: brief.cta.slice(0, 90), body: p.phone ? `Call ${p.phone}` : "" },
    ],
    footer: p.businessName,
    license: "Original — generated from brand text only",
  };
  const blocked = variants.flatMap((v) => prohibitedHits(p, v.caption).map((h) => `${v.platform}: contains prohibited claim “${h}”`));
  return { variants, asset, blocked };
}

export function utm(url: string, campaign: string, content: string): string {
  try {
    const u = new URL(url);
    u.searchParams.set("utm_source", "social");
    u.searchParams.set("utm_medium", "organic");
    u.searchParams.set("utm_campaign", campaign);
    u.searchParams.set("utm_content", content);
    return u.toString();
  } catch {
    return url;
  }
}
