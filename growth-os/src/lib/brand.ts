import { z } from "zod";

/**
 * A brand fact is something generators may state. Inferred facts start as
 * "needs_review" and are excluded from generation until a human approves them.
 */
export const FactSchema = z.object({
  id: z.string(),
  kind: z.enum(["service", "credential", "service_area", "offer", "testimonial", "statistic", "contact", "other"]),
  text: z.string().min(1).max(500),
  source: z.string().max(300), // URL, document name, or "client interview 2026-10-12"
  provenance: z.enum(["client_supplied", "website", "document", "inferred"]),
  review: z.enum(["approved", "needs_review", "rejected"]),
  /** Testimonials/proof must name who said it and where it is published. */
  attribution: z.string().max(200).default(""),
});
export type Fact = z.infer<typeof FactSchema>;

export const ThemeSchema = z.object({
  primary: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  primaryInk: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  surface: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  ink: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  muted: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  font: z.enum(["system-sans", "system-serif", "humanist", "geometric"]).default("system-sans"),
  radius: z.enum(["none", "small", "round"]).default("small"),
});
export type Theme = z.infer<typeof ThemeSchema>;

export const BrandProfileSchema = z.object({
  businessName: z.string().min(1),
  industry: z.enum(["home_services", "healthcare", "agency", "other"]),
  voice: z.string().max(600),
  audience: z.string().max(600),
  offers: z.array(z.string().max(200)).max(20),
  serviceAreas: z.array(z.string().max(80)).max(40),
  prohibitedClaims: z.array(z.string().max(200)).max(40),
  phone: z.string().max(40).default(""),
  facts: z.array(FactSchema).max(200),
  theme: ThemeSchema,
});
export type BrandProfile = z.infer<typeof BrandProfileSchema>;

export function approvedFacts(p: BrandProfile, kind?: Fact["kind"]): Fact[] {
  return p.facts.filter((f) => f.review === "approved" && (!kind || f.kind === kind));
}

/** Returns the prohibited phrases a text contains (case-insensitive). Generators refuse output that hits any. */
export function prohibitedHits(p: BrandProfile, text: string): string[] {
  const t = text.toLowerCase();
  const universal = ["guaranteed #1", "guaranteed ranking", "guarantee first page", "100% guaranteed"];
  return [...p.prohibitedClaims, ...universal].filter((c) => c.trim() && t.includes(c.toLowerCase()));
}

/** WCAG relative-luminance contrast ratio between two hex colours. */
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x! + 0.05) / (y! + 0.05);
}

export function themeIssues(t: Theme): string[] {
  const out: string[] = [];
  if (contrastRatio(t.primary, t.primaryInk) < 4.5) out.push(`Button text on the primary colour is ${contrastRatio(t.primary, t.primaryInk).toFixed(1)}:1; it needs 4.5:1.`);
  if (contrastRatio(t.surface, t.ink) < 4.5) out.push(`Body text contrast is ${contrastRatio(t.surface, t.ink).toFixed(1)}:1; it needs 4.5:1.`);
  if (contrastRatio(t.surface, t.muted) < 4.5) out.push(`Secondary text contrast is ${contrastRatio(t.surface, t.muted).toFixed(1)}:1; it needs 4.5:1.`);
  return out;
}
