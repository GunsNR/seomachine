import { z } from "zod";
import { db, systemDb } from "./db";
import { audit } from "./audit";
import { BrandProfileSchema, FactSchema, ThemeSchema, themeIssues, type BrandProfile, type Fact } from "./brand";
import { CLIENT_STAGES, AGENCY_STAGES, parseStages, StageSchema, type Stage } from "./crm/pipelines";
import { DefinitionSchema, TRIGGERS, type Definition } from "./workflows/definition";
import { templatePage } from "./site/sections";
import { isValidTimeZone } from "./time";
import { randomToken } from "./crypto";
import { slugify } from "./normalize";
import { PLATFORMS } from "./content/variants";

type Actor = { workspaceId: string; userId: string; role: string };

export class SetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError"; // user-facing: shown by runAction
  }
}

const DEFAULT_THEME = { primary: "#1f4f7a", primaryInk: "#ffffff", surface: "#ffffff", ink: "#16202a", muted: "#4a5866", font: "system-sans" as const, radius: "small" as const };

// ─── Client workspaces ─────────────────────────────────────────────────────

export const NewClientSchema = z.object({
  name: z.string().trim().min(2).max(120),
  businessName: z.string().trim().min(2).max(120),
  industry: z.enum(["home_services", "healthcare", "agency", "other"]),
  timezone: z.string().refine(isValidTimeZone, "Unknown time zone"),
  currency: z.string().regex(/^[A-Z]{3}$/),
  serviceAreas: z.array(z.string().trim().min(1).max(80)).max(40),
});

/**
 * Create a client workspace under the agency: default client pipeline, an
 * empty brand profile (v1, nothing approved), a draft home page that is not
 * published, and the standard follow-up workflow switched OFF. The creating
 * owner gets an owner membership; other agency staff are not added silently.
 */
export async function createClientWorkspace(a: Actor, input: z.input<typeof NewClientSchema>) {
  const agency = await systemDb.workspace.findUnique({ where: { id: a.workspaceId } });
  if (!agency || agency.kind !== "agency") throw new SetupError("Create client workspaces from the agency workspace.");
  if (a.role !== "owner" && a.role !== "admin") throw new SetupError("Only agency owners and admins can add clients.");
  const v = NewClientSchema.parse(input);
  const slugBase = slugify(v.name);
  const slug = (await systemDb.workspace.findUnique({ where: { slug: slugBase } })) ? `${slugBase}-${randomToken(3).toLowerCase()}` : slugBase;
  const ws = await systemDb.workspace.create({ data: { kind: "client", name: v.name, slug, parentId: agency.id, timezone: v.timezone, currency: v.currency } });
  await systemDb.membership.create({ data: { userId: a.userId, workspaceId: ws.id, role: "owner" } });
  await db.pipeline.create({ data: { workspaceId: ws.id, name: "Customer leads", kind: "client", stages: CLIENT_STAGES, isDefault: true } });
  const profile: BrandProfile = BrandProfileSchema.parse({
    businessName: v.businessName, industry: v.industry, voice: "", audience: "", offers: [], serviceAreas: v.serviceAreas, prohibitedClaims: ["guaranteed rankings", "guaranteed #1"], phone: "", facts: [], theme: DEFAULT_THEME,
  });
  const brand = await db.brand.create({ data: { workspaceId: ws.id, name: v.businessName, slug: slugify(v.businessName) } });
  const bv = await db.brandVersion.create({ data: { workspaceId: ws.id, brandId: brand.id, version: 1, profile, createdById: a.userId } });
  await db.brand.update({ where: { id: brand.id, workspaceId: ws.id }, data: { currentVersionId: bv.id } });
  const siteSlug = (await systemDb.site.findUnique({ where: { slug } })) ? `${slug}-${randomToken(3).toLowerCase()}` : slug;
  const site = await db.site.create({ data: { workspaceId: ws.id, brandId: brand.id, name: v.businessName, slug: siteSlug, theme: DEFAULT_THEME } });
  const t = templatePage(profile, "home");
  await db.page.create({ data: { workspaceId: ws.id, siteId: site.id, slug: "home", kind: "home", draftVersion: 1, versions: { create: { workspaceId: ws.id, version: 1, sections: t.sections, meta: t.meta, origin: "template", note: "Starter template (not AI). Not published.", createdById: a.userId } } } });
  await db.workflow.create({
    data: {
      workspaceId: ws.id, name: "New lead: reply within the hour", trigger: "form_submitted", enabled: false,
      versions: { create: { workspaceId: ws.id, version: 1, definition: { steps: [{ type: "create_task", title: "Call {{first_name}} back", dueInMinutes: 60 }, { type: "wait", minutes: 1440 }, { type: "draft_message", channel: "email", subject: "Following up on your request", body: "Hi {{first_name}}, it's {{business}}. Do you still need help? Reply and we'll find a time." }] } } },
    },
  });
  await audit(agency.id, a.userId, "client.create", "workspace", ws.id, { name: v.name });
  await audit(ws.id, a.userId, "workspace.created", "workspace", ws.id);
  return ws;
}

// ─── Brand profile ─────────────────────────────────────────────────────────

/**
 * Brand versions are immutable. Every change writes a new version and points
 * the brand at it; cached AI output for the old version is never reused for
 * the new one because cache keys include the version id.
 */
export async function saveBrandVersion(a: Actor, brandId: string, mutate: (p: BrandProfile) => BrandProfile, note: string) {
  const brand = await db.brand.findFirst({ where: { workspaceId: a.workspaceId, id: brandId } });
  if (!brand?.currentVersionId) throw new SetupError("Unknown brand.");
  const cur = await db.brandVersion.findFirst({ where: { workspaceId: a.workspaceId, id: brand.currentVersionId } });
  if (!cur) throw new SetupError("Brand has no current version.");
  const next = BrandProfileSchema.parse(mutate(BrandProfileSchema.parse(cur.profile)));
  const issues = themeIssues(next.theme);
  if (issues.length) throw new SetupError(`Brand colours not saved — ${issues.join(" ")}`);
  const top = await db.brandVersion.findFirst({ where: { workspaceId: a.workspaceId, brandId }, orderBy: { version: "desc" } });
  const bv = await db.brandVersion.create({ data: { workspaceId: a.workspaceId, brandId, version: (top?.version ?? 0) + 1, profile: next, createdById: a.userId, approvedAt: new Date(), approvedBy: a.userId } });
  await db.brand.update({ where: { id: brandId, workspaceId: a.workspaceId }, data: { currentVersionId: bv.id, name: next.businessName } });
  await audit(a.workspaceId, a.userId, "brand.version", "brand", brandId, { version: bv.version, note });
  return bv;
}

export const NewFactSchema = FactSchema.omit({ id: true, review: true }).extend({ text: z.string().trim().min(3).max(500), source: z.string().trim().min(2).max(300) });

/** Client-supplied and document facts can be approved on entry; inferred and website facts always start in review. */
export function initialReview(provenance: Fact["provenance"], approveNow: boolean): Fact["review"] {
  if (provenance === "inferred" || provenance === "website") return "needs_review";
  return approveNow ? "approved" : "needs_review";
}

export async function addFact(a: Actor, brandId: string, input: z.input<typeof NewFactSchema>, approveNow: boolean) {
  const f = NewFactSchema.parse(input);
  if (f.kind === "testimonial" && !f.attribution.trim()) throw new SetupError("A testimonial needs who said it (e.g. “R. P., Toms River”) and where it's published.");
  return saveBrandVersion(a, brandId, (p) => ({ ...p, facts: [...p.facts, { ...f, id: `f_${randomToken(6)}`, review: initialReview(f.provenance, approveNow) }] }), `Added ${f.kind} fact`);
}

export async function reviewFact(a: Actor, brandId: string, factId: string, review: "approved" | "rejected") {
  return saveBrandVersion(a, brandId, (p) => {
    if (!p.facts.some((x) => x.id === factId)) throw new SetupError("That fact no longer exists.");
    return { ...p, facts: p.facts.map((x) => (x.id === factId ? { ...x, review } : x)) };
  }, `Fact ${review}`);
}

// ─── Destinations ──────────────────────────────────────────────────────────

/**
 * Destinations are never "connected" without a verified adapter. Dry-run is
 * only allowed in demo (fixture) workspaces; ContentStudio only when its
 * integration is connected; everything else is a manual hand-off.
 */
export async function addDestination(a: Actor, input: { brandId: string; platform: string; label: string; adapter: "manual" | "dry_run" | "contentstudio"; providerAccountId?: string }) {
  if (!(PLATFORMS as readonly string[]).includes(input.platform)) throw new SetupError("Pick a platform.");
  const brand = await db.brand.findFirst({ where: { workspaceId: a.workspaceId, id: input.brandId } });
  if (!brand) throw new SetupError("Pick a brand in this workspace.");
  const ws = await systemDb.workspace.findUnique({ where: { id: a.workspaceId } });
  let status = "manual_handoff";
  if (input.adapter === "dry_run") {
    if (!ws?.isFixture) throw new SetupError("Dry-run destinations are only for demo workspaces. Use manual hand-off or a connected provider.");
    status = "connected";
  }
  if (input.adapter === "contentstudio") {
    const integ = await db.integration.findFirst({ where: { workspaceId: a.workspaceId, provider: "contentstudio", status: "connected" } });
    if (!integ) throw new SetupError("Connect ContentStudio in Settings → Integrations first.");
    if (!input.providerAccountId?.trim()) throw new SetupError("Enter the ContentStudio account ID for this profile.");
    status = "connected";
  }
  const d = await db.destination.create({ data: { workspaceId: a.workspaceId, brandId: brand.id, platform: input.platform, label: input.label.trim().slice(0, 120) || input.platform, adapter: input.adapter, status, providerAccountId: input.providerAccountId?.trim() ?? "" } });
  await audit(a.workspaceId, a.userId, "destination.add", "destination", d.id, { adapter: input.adapter });
  return d;
}

export async function removeDestination(a: Actor, id: string) {
  const queued = await db.publication.count({ where: { workspaceId: a.workspaceId, destinationId: id, status: { in: ["queued", "ambiguous"] } } });
  if (queued) throw new SetupError("Posts are still queued for this destination. Let them finish or edit those posts first.");
  await db.destination.deleteMany({ where: { workspaceId: a.workspaceId, id } });
  await audit(a.workspaceId, a.userId, "destination.remove", "destination", id);
}

// ─── Pipeline stages ───────────────────────────────────────────────────────

/** Exactly one won and one lost stage; stages holding opportunities can't be removed. */
export async function updateStages(a: Actor, pipelineId: string, stages: Stage[]) {
  const p = await db.pipeline.findFirst({ where: { workspaceId: a.workspaceId, id: pipelineId } });
  if (!p) throw new SetupError("Unknown pipeline.");
  const next = z.array(StageSchema).min(3).max(15).parse(stages.map((s, i) => ({ ...s, name: s.name.trim(), order: i + 1 })));
  if (next.filter((s) => s.type === "won").length !== 1 || next.filter((s) => s.type === "lost").length !== 1) throw new SetupError("Keep exactly one Won and one Lost stage.");
  if (!next.some((s) => s.type === "open")) throw new SetupError("Keep at least one open stage.");
  if (new Set(next.map((s) => s.id)).size !== next.length) throw new SetupError("Stage names must be different.");
  if (next.some((s) => !s.name)) throw new SetupError("Every stage needs a name.");
  const removed = parseStages(p.stages).filter((s) => !next.some((n) => n.id === s.id));
  for (const r of removed) {
    const n = await db.opportunity.count({ where: { workspaceId: a.workspaceId, pipelineId, stageId: r.id } });
    if (n) throw new SetupError(`“${r.name}” still has ${n} deal${n > 1 ? "s" : ""}. Move them before removing the stage.`);
  }
  await db.pipeline.update({ where: { id: p.id, workspaceId: a.workspaceId }, data: { stages: next } });
  await audit(a.workspaceId, a.userId, "pipeline.stages", "pipeline", p.id, { stages: next.map((s) => s.name) });
}

export function defaultStagesFor(kind: string): Stage[] {
  return kind === "agency" ? AGENCY_STAGES : CLIENT_STAGES;
}

// ─── Workflows ─────────────────────────────────────────────────────────────

/** Saving writes a new version; runs already in flight keep the version they started on. */
export async function saveWorkflow(a: Actor, input: { workflowId?: string; name: string; trigger: string; definition: Definition }) {
  if (!(TRIGGERS as readonly string[]).includes(input.trigger)) throw new SetupError("Pick a trigger.");
  const def = DefinitionSchema.parse(input.definition);
  for (const s of def.steps) {
    if (s.type === "assign_owner") {
      const m = await systemDb.membership.findUnique({ where: { userId_workspaceId: { userId: s.userId, workspaceId: a.workspaceId } } });
      if (!m || m.revokedAt) throw new SetupError("“Assign owner” must name a current member of this workspace.");
    }
  }
  const name = input.name.trim().slice(0, 120);
  if (!name) throw new SetupError("Name the workflow.");
  if (!input.workflowId) {
    const w = await db.workflow.create({ data: { workspaceId: a.workspaceId, name, trigger: input.trigger, enabled: false, versions: { create: { workspaceId: a.workspaceId, version: 1, definition: def } } } });
    await audit(a.workspaceId, a.userId, "workflow.create", "workflow", w.id);
    return w;
  }
  const w = await db.workflow.findFirst({ where: { workspaceId: a.workspaceId, id: input.workflowId } });
  if (!w) throw new SetupError("Unknown workflow.");
  const version = w.currentVersion + 1;
  await db.workflowVersion.create({ data: { workspaceId: a.workspaceId, workflowId: w.id, version, definition: def } });
  const updated = await db.workflow.update({ where: { id: w.id, workspaceId: a.workspaceId }, data: { name, trigger: input.trigger, currentVersion: version } });
  await audit(a.workspaceId, a.userId, "workflow.version", "workflow", w.id, { version });
  return updated;
}

export { ThemeSchema };
