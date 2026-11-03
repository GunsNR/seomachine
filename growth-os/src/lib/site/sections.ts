import { z } from "zod";
import { approvedFacts, type BrandProfile } from "../brand";

const id = z.string().min(1).max(40);

export const SectionSchema = z.discriminatedUnion("type", [
  z.object({ id, type: z.literal("hero"), headline: z.string().min(1).max(120), subhead: z.string().max(300).default(""), ctaLabel: z.string().min(1).max(40), ctaTarget: z.enum(["lead_form", "booking", "phone"]).default("lead_form"), proofFactId: z.string().default("") }),
  z.object({ id, type: z.literal("benefits"), heading: z.string().max(120), items: z.array(z.object({ title: z.string().max(80), body: z.string().max(300) })).min(1).max(6) }),
  z.object({ id, type: z.literal("services"), heading: z.string().max(120), items: z.array(z.object({ name: z.string().max(80), body: z.string().max(300) })).min(1).max(12) }),
  /** Proof may only reference approved brand facts. Nothing else renders. */
  z.object({ id, type: z.literal("proof"), heading: z.string().max(120), factIds: z.array(z.string()).max(6) }),
  z.object({ id, type: z.literal("faq"), heading: z.string().max(120), items: z.array(z.object({ q: z.string().max(200), a: z.string().max(1000) })).min(1).max(12) }),
  z.object({ id, type: z.literal("lead_form"), heading: z.string().max(120), body: z.string().max(300).default(""), submitLabel: z.string().max(40).default("Send request"), askService: z.boolean().default(true), consentText: z.string().max(400).default("") }),
  z.object({ id, type: z.literal("booking_cta"), heading: z.string().max(120), body: z.string().max(300).default(""), label: z.string().max(40) }),
  z.object({ id, type: z.literal("footer"), text: z.string().max(300).default("") }),
]);
export type Section = z.infer<typeof SectionSchema>;
export const SectionsSchema = z.array(SectionSchema).min(1).max(20);

export const MetaSchema = z.object({
  title: z.string().max(70),
  description: z.string().max(170),
  canonicalPath: z.string().max(200).default(""),
  noindex: z.boolean().default(false),
  ogTitle: z.string().max(90).default(""),
  /** Structured-data type consistent with the visible content. */
  schemaType: z.enum(["none", "LocalBusiness", "MedicalBusiness", "ProfessionalService"]).default("none"),
});
export type PageMeta = z.infer<typeof MetaSchema>;

export const SECTION_LABEL: Record<Section["type"], string> = {
  hero: "Hero", benefits: "Benefits", services: "Services", proof: "Verified proof", faq: "FAQ", lead_form: "Lead form", booking_cta: "Booking call-to-action", footer: "Footer",
};

/**
 * Deterministic page template from a brand profile. This is a template, not
 * AI generation, and the editor labels it that way.
 */
export function templatePage(p: BrandProfile, kind: "home" | "landing", focusService?: string): { sections: Section[]; meta: PageMeta } {
  const services = approvedFacts(p, "service").map((f) => f.text);
  const areas = p.serviceAreas.slice(0, 3).join(", ");
  const focus = focusService ?? services[0] ?? p.offers[0] ?? "our services";
  const proof = [...approvedFacts(p, "credential"), ...approvedFacts(p, "testimonial")].slice(0, 3);
  const healthcare = p.industry === "healthcare";
  const sections: Section[] = [
    { id: "hero", type: "hero", headline: kind === "home" ? `${focus} for ${areas || "your area"}` : `${focus} in ${p.serviceAreas[0] ?? "your area"}`, subhead: p.offers[0] ?? "", ctaLabel: healthcare ? "Request an appointment" : "Get a free estimate", ctaTarget: "lead_form", proofFactId: proof[0]?.id ?? "" },
    { id: "services", type: "services", heading: "What we do", items: (services.length ? services : [focus]).slice(0, 6).map((s) => ({ name: s, body: "" })) },
    ...(proof.length ? [{ id: "proof", type: "proof" as const, heading: "Why people choose us", factIds: proof.map((f) => f.id) }] : []),
    { id: "faq", type: "faq", heading: "Common questions", items: [{ q: `Which areas do you serve?`, a: p.serviceAreas.length ? `We serve ${p.serviceAreas.join(", ")}.` : "Ask us about your location." }] },
    {
      id: "form", type: "lead_form", heading: healthcare ? "Request an appointment" : "Tell us about your project",
      body: healthcare ? "Please don't include medical history here. We'll call you to talk through details." : "We usually reply within one business day.",
      submitLabel: "Send request", askService: true, consentText: "You can email me about this request.",
    },
    { id: "footer", type: "footer", text: `© ${p.businessName}` },
  ];
  return {
    sections,
    meta: { title: `${focus} | ${p.businessName}`.slice(0, 70), description: `${p.businessName}: ${focus}${areas ? ` in ${areas}` : ""}. ${p.offers[0] ?? ""}`.slice(0, 170), canonicalPath: "", noindex: false, ogTitle: "", schemaType: healthcare ? "MedicalBusiness" : "LocalBusiness" },
  };
}

/**
 * Conversion checks for the hero, adapted from the hero-cro-auditor skill's
 * binary evals. Each returns pass/fail with a plain reason.
 */
export function heroChecks(sections: Section[], p: BrandProfile): { label: string; pass: boolean; detail: string }[] {
  const hero = sections.find((s) => s.type === "hero");
  if (!hero || hero.type !== "hero") return [{ label: "Page has a hero", pass: false, detail: "Add a hero section first." }];
  const words = hero.headline.trim().split(/\s+/).length;
  const vague = /\b(welcome|best|quality|solutions|leading|world.class)\b/i.test(hero.headline);
  const proof = hero.proofFactId ? approvedFacts(p).find((f) => f.id === hero.proofFactId) : undefined;
  return [
    { label: "Headline names the service", pass: !vague && words >= 3 && words <= 12, detail: vague ? "Replace generic words like “best” or “welcome” with the actual service." : words > 12 ? "Shorten to 12 words or fewer." : words < 3 ? "Say what you do and where." : "Specific and short." },
    { label: "Headline names a place", pass: p.serviceAreas.some((a) => hero.headline.toLowerCase().includes(a.toLowerCase().split(",")[0]!)), detail: "Local searchers look for their town in the first line." },
    { label: "Action says what happens", pass: !/^(submit|click here|learn more|go)$/i.test(hero.ctaLabel.trim()), detail: "Use a label like “Get a free estimate”." },
    { label: "Proof is verified", pass: !!proof, detail: proof ? `Uses approved fact: “${proof.text.slice(0, 60)}”` : "Link one approved credential or attributed testimonial. Unverified proof is never shown." },
    { label: "Form is on the page", pass: sections.some((s) => s.type === "lead_form"), detail: "The hero button scrolls to it." },
  ];
}
