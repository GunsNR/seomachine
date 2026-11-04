import { z } from "zod";
import { generateStructured } from "./provider";
import { approvedFacts, prohibitedHits, type BrandProfile } from "../brand";
import { VariantSchema, type Platform, type Variant } from "../content/variants";
import { PatchOpSchema, type PatchOp } from "../site/patch";
import type { PageDoc } from "../site/patch";
import { utm } from "../content/templates";

/**
 * Task-specific AI calls. Each returns null when AI is off, over budget,
 * refused or invalid — callers then fall back to templates and label the
 * output "Template (not AI)". Only approved brand facts are given to the
 * model; prohibited claims in the output make the result unusable.
 */

const PROMPT_VERSION = { caption: "caption@2026-11-04", pageEdit: "page-edit@2026-11-04" };

const CaptionOut = z.object({ variants: z.array(z.object({ platform: z.string(), caption: z.string().min(1).max(3000), hook: z.string().max(300) })).min(1).max(6) });
const CaptionJsonSchema = {
  type: "object", additionalProperties: false, required: ["variants"],
  properties: { variants: { type: "array", items: { type: "object", additionalProperties: false, required: ["platform", "caption", "hook"], properties: { platform: { type: "string" }, caption: { type: "string" }, hook: { type: "string" } } } } },
};

export async function aiCaptions(args: { workspaceId: string; brandVersionId: string; profile: BrandProfile; brief: { objective: string; audienceQuestion: string; cta: string; destinationUrl: string; contentKey: string; campaignKey: string }; platforms: Platform[]; sources: { url: string; excerpt: string }[] }): Promise<{ variants: Variant[] } | { error: string }> {
  const facts = approvedFacts(args.profile).map((f) => `- (${f.kind}) ${f.text}${f.attribution ? ` — ${f.attribution}` : ""}`).join("\n") || "- (none approved yet)";
  const r = await generateStructured({
    workspaceId: args.workspaceId, brandVersionId: args.brandVersionId, promptVersion: PROMPT_VERSION.caption, operation: "content.captions",
    system: `You write social posts for ${args.profile.businessName}, a ${args.profile.industry.replace("_", " ")} business. Voice: ${args.profile.voice || "plain and helpful"}. Audience: ${args.profile.audience || "local customers"}.
Use ONLY these approved facts; never invent statistics, testimonials, credentials, prices, guarantees or popularity:
${facts}
Never use these phrases: ${args.profile.prohibitedClaims.join("; ") || "(none)"}.
Write natural, platform-appropriate copy. No hashtags (they are researched separately). No guaranteed outcomes.`,
    instruction: `Answer this customer question for each platform: "${args.brief.audienceQuestion}". Goal: ${args.brief.objective}. Call to action: "${args.brief.cta}" pointing to ${utm(args.brief.destinationUrl, args.brief.campaignKey, args.brief.contentKey)} (keep the link exactly as given where links are allowed; Instagram and TikTok say "link in bio"). Platforms: ${args.platforms.join(", ")}.`,
    untrustedSources: args.sources.map((s) => `${s.url}\n${s.excerpt}`),
    schema: CaptionOut, jsonSchema: CaptionJsonSchema, estimateOutputTokens: 1500,
  });
  if (!r.ok) return { error: r.message };
  const variants: Variant[] = [];
  for (const p of args.platforms) {
    const v = r.output.variants.find((x) => x.platform === p);
    if (!v) return { error: `The AI skipped ${p}.` };
    const hits = prohibitedHits(args.profile, v.caption);
    if (hits.length) return { error: `The AI draft used a prohibited claim (“${hits[0]}”), so it was discarded.` };
    variants.push(VariantSchema.parse({ platform: p, caption: v.caption, hook: v.hook, hashtags: [], mentions: [], internalTags: [args.brief.campaignKey], title: p === "youtube" ? args.brief.audienceQuestion.slice(0, 100) : "" }));
  }
  return { variants };
}

const EditOut = z.object({ ops: z.array(z.object({ path: z.string(), value: z.string().max(1000) })).min(1).max(8), summary: z.string().max(300) });
const EditJsonSchema = {
  type: "object", additionalProperties: false, required: ["ops", "summary"],
  properties: { summary: { type: "string" }, ops: { type: "array", items: { type: "object", additionalProperties: false, required: ["path", "value"], properties: { path: { type: "string" }, value: { type: "string" } } } } },
};

/** AI proposes text edits only (op "set" on existing text fields); structure changes stay manual. */
export async function aiPageEdit(args: { workspaceId: string; brandVersionId: string; profile: BrandProfile; doc: PageDoc; instruction: string }): Promise<{ ops: PatchOp[]; summary: string } | { error: string }> {
  const editable: Record<string, string> = { "meta.title": args.doc.meta.title, "meta.description": args.doc.meta.description };
  for (const s of args.doc.sections) for (const [k, v] of Object.entries(s)) if (typeof v === "string" && !["id", "type", "ctaTarget", "proofFactId"].includes(k)) editable[`sections.${s.id}.${k}`] = v;
  const r = await generateStructured({
    workspaceId: args.workspaceId, brandVersionId: args.brandVersionId, promptVersion: PROMPT_VERSION.pageEdit, operation: "site.edit",
    system: `You edit website copy for ${args.profile.businessName}. Only change the fields listed. Use only approved facts: ${approvedFacts(args.profile).map((f) => f.text).join("; ") || "(none)"}. Never add guarantees, reviews, statistics or offices that aren't approved. Never use: ${args.profile.prohibitedClaims.join("; ") || "(none)"}. Titles ≤ 60 characters, descriptions ≤ 160.`,
    instruction: `Fields (path → current text):\n${Object.entries(editable).map(([k, v]) => `${k} → ${v}`).join("\n")}\n\nRequested change: ${args.instruction}\nReturn only the fields that should change.`,
    schema: EditOut, jsonSchema: EditJsonSchema, estimateOutputTokens: 800,
  });
  if (!r.ok) return { error: r.message };
  const ops: PatchOp[] = [];
  for (const o of r.output.ops) {
    if (!(o.path in editable)) return { error: `The AI tried to change a field it wasn't given (${o.path}); nothing was proposed.` };
    const hits = prohibitedHits(args.profile, o.value);
    if (hits.length) return { error: `The AI used a prohibited claim (“${hits[0]}”); nothing was proposed.` };
    ops.push(PatchOpSchema.parse({ op: "set", path: o.path, value: o.value }));
  }
  return { ops, summary: r.output.summary };
}
