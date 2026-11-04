"use server";
import { requirePermission } from "@/lib/auth";
import { runAction, str } from "@/lib/actions";
import { db } from "@/lib/db";
import { applyChange, loadPage, proposeChange, publishVersion, rejectChange, rollbackTo, saveVersion } from "@/lib/site/pages";
import { SectionSchema, templatePage, type Section } from "@/lib/site/sections";
import { BrandProfileSchema, ThemeSchema, themeIssues } from "@/lib/brand";
import type { PatchOp } from "@/lib/site/patch";
import { slugify } from "@/lib/normalize";
import { audit } from "@/lib/audit";
import { aiStatus } from "@/lib/ai/provider";
import { aiPageEdit } from "@/lib/ai/tasks";

const actor = (c: { workspace: { id: string }; userId: string; role: string }) => ({ workspaceId: c.workspace.id, userId: c.userId, role: c.role });

function sectionFromForm(base: Section, f: FormData): Section {
  const o: Record<string, unknown> = { ...base };
  for (const [k, v] of f.entries()) {
    if (!k.startsWith("s_")) continue;
    const key = k.slice(2);
    const m = /^items\.(\d+)\.(\w+)$/.exec(key);
    if (m) {
      const items = [...((o.items as Record<string, unknown>[]) ?? [])];
      const i = Number(m[1]);
      items[i] = { ...(items[i] ?? {}), [m[2]!]: String(v) };
      o.items = items;
    } else if (key === "factIds") o.factIds = f.getAll(k).map(String);
    else if (key === "askService") o.askService = v === "on";
    else o[key] = String(v);
  }
  if (Array.isArray(o.items)) o.items = (o.items as Record<string, string>[]).filter((it) => Object.values(it).some((x) => String(x).trim()));
  if (base.type === "proof" && !f.getAll("s_factIds").length) o.factIds = [];
  return SectionSchema.parse(o);
}

export async function saveSectionAction(f: FormData) {
  const ctx = await requirePermission("site.write");
  const pageId = str(f, "pageId");
  await runAction(`/app/websites/${pageId}`, async () => {
    const base = Number(str(f, "baseVersion"));
    const { doc } = await loadPage(ctx.workspace.id, pageId);
    const id = str(f, "sectionId");
    const cur = doc.sections.find((s) => s.id === id);
    if (!cur) throw new Error("That section was removed in a newer version.");
    const next = { ...doc, sections: doc.sections.map((s) => (s.id === id ? sectionFromForm(s, f) : s)) };
    const v = await saveVersion(actor(ctx), pageId, base, next, "human", `Edited ${id}`);
    return `Saved as version ${v} (draft — not published yet)`;
  });
}

export async function saveMetaAction(f: FormData) {
  const ctx = await requirePermission("site.write");
  const pageId = str(f, "pageId");
  await runAction(`/app/websites/${pageId}`, async () => {
    const { doc } = await loadPage(ctx.workspace.id, pageId);
    const v = await saveVersion(actor(ctx), pageId, Number(str(f, "baseVersion")), { ...doc, meta: { ...doc.meta, title: str(f, "title"), description: str(f, "description"), canonicalPath: str(f, "canonicalPath"), noindex: f.get("noindex") === "on", schemaType: (str(f, "schemaType") || "none") as never } }, "human", "Edited page settings");
    return `Saved as version ${v}`;
  });
}

export async function moveSectionAction(f: FormData) {
  const ctx = await requirePermission("site.write");
  const pageId = str(f, "pageId");
  await runAction(`/app/websites/${pageId}`, async () => {
    const { doc } = await loadPage(ctx.workspace.id, pageId);
    const id = str(f, "sectionId");
    const i = doc.sections.findIndex((s) => s.id === id);
    const j = str(f, "dir") === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= doc.sections.length) return;
    const sections = [...doc.sections];
    [sections[i], sections[j]] = [sections[j]!, sections[i]!];
    const v = await saveVersion(actor(ctx), pageId, Number(str(f, "baseVersion")), { ...doc, sections }, "human", `Moved ${id} ${str(f, "dir")}`);
    return `Moved. Saved as version ${v}`;
  });
}

const BLANK: Record<string, Section> = {
  benefits: { id: "", type: "benefits", heading: "Why choose us", items: [{ title: "", body: "" }] },
  faq: { id: "", type: "faq", heading: "Common questions", items: [{ q: "", a: "" }] },
  booking_cta: { id: "", type: "booking_cta", heading: "Book a time", body: "", label: "Request a visit" },
  proof: { id: "", type: "proof", heading: "Why people choose us", factIds: [] },
};

export async function addSectionAction(f: FormData) {
  const ctx = await requirePermission("site.write");
  const pageId = str(f, "pageId");
  await runAction(`/app/websites/${pageId}`, async () => {
    const type = str(f, "type");
    const blank = BLANK[type];
    if (!blank) throw new Error("Pick a section type.");
    const { doc } = await loadPage(ctx.workspace.id, pageId);
    const id = `${type}-${Date.now().toString(36)}`;
    const footerAt = doc.sections.findIndex((s) => s.type === "footer");
    const sections = [...doc.sections];
    sections.splice(footerAt < 0 ? sections.length : footerAt, 0, { ...blank, id } as Section);
    // Blank items fail validation only once saved empty; give them placeholder text the editor shows.
    const fixed = sections.map((s) => (s.id === id && "items" in s ? { ...s, items: s.items.map((it) => Object.fromEntries(Object.entries(it).map(([k]) => [k, "Edit me"]))) } as Section : s));
    const v = await saveVersion(actor(ctx), pageId, Number(str(f, "baseVersion")), { ...doc, sections: fixed }, "human", `Added ${type}`);
    return `Section added. Saved as version ${v}`;
  });
}

export async function removeSectionAction(f: FormData) {
  const ctx = await requirePermission("site.write");
  const pageId = str(f, "pageId");
  await runAction(`/app/websites/${pageId}`, async () => {
    const { doc } = await loadPage(ctx.workspace.id, pageId);
    const id = str(f, "sectionId");
    if (doc.sections.length <= 1) throw new Error("A page needs at least one section.");
    const v = await saveVersion(actor(ctx), pageId, Number(str(f, "baseVersion")), { ...doc, sections: doc.sections.filter((s) => s.id !== id) }, "human", `Removed ${id}`);
    return `Removed. Saved as version ${v}`;
  });
}

/**
 * Scoped conversational edit. With AI off, a small deterministic command
 * parser proposes the change and it is labelled "Template edit (not AI)".
 * Either way the result is a reviewable proposal against the current version.
 */
function parseCommand(text: string, sections: Section[]): PatchOp[] {
  const ops: PatchOp[] = [];
  for (const raw of text.split(/\n|;/)) {
    const line = raw.trim();
    let m: RegExpExecArray | null;
    if ((m = /^(headline|h1)\s*[:=]\s*(.+)$/i.exec(line))) ops.push({ op: "set", path: `sections.${sections.find((s) => s.type === "hero")?.id ?? "hero"}.headline`, value: m[2]!.trim() });
    else if ((m = /^(subhead|subheading)\s*[:=]\s*(.+)$/i.exec(line))) ops.push({ op: "set", path: `sections.${sections.find((s) => s.type === "hero")?.id ?? "hero"}.subhead`, value: m[2]!.trim() });
    else if ((m = /^(button|cta)\s*[:=]\s*(.+)$/i.exec(line))) ops.push({ op: "set", path: `sections.${sections.find((s) => s.type === "hero")?.id ?? "hero"}.ctaLabel`, value: m[2]!.trim() });
    else if ((m = /^title\s*[:=]\s*(.+)$/i.exec(line))) ops.push({ op: "set", path: "meta.title", value: m[1]!.trim() });
    else if ((m = /^description\s*[:=]\s*(.+)$/i.exec(line))) ops.push({ op: "set", path: "meta.description", value: m[1]!.trim() });
    else if ((m = /^move\s+([\w-]+)\s+(up|down|to top)$/i.exec(line))) {
      const s = sections.find((x) => x.id === m![1] || x.type === m![1]!.replace(" ", "_"));
      const i = s ? sections.indexOf(s) : -1;
      if (s) ops.push({ op: "move", sectionId: s.id, toIndex: m[2]!.toLowerCase() === "to top" ? 0 : Math.max(0, m[2]!.toLowerCase() === "up" ? i - 1 : i + 1) });
    } else if ((m = /^remove\s+([\w-]+)$/i.exec(line))) {
      const s = sections.find((x) => x.id === m![1] || x.type === m![1]);
      if (s) ops.push({ op: "remove", sectionId: s.id });
    } else if (line) throw new Error(`I couldn't read “${line.slice(0, 60)}”. AI editing is off, so use commands like “headline: …”, “button: …”, “title: …”, “description: …”, “move faq up”, “remove proof”.`);
  }
  if (!ops.length) throw new Error("Type a change first.");
  return ops;
}

export async function proposeEditAction(f: FormData) {
  const ctx = await requirePermission("site.write");
  const pageId = str(f, "pageId");
  await runAction(`/app/websites/${pageId}`, async () => {
    const { page, doc } = await loadPage(ctx.workspace.id, pageId);
    const instruction = str(f, "instruction");
    // Commands ("headline: …") always use the deterministic parser. Free text goes to AI when it's on.
    const looksLikeCommand = /^(headline|h1|subhead|subheading|button|cta|title|description|move|remove)\b/i.test(instruction.trim());
    if (!looksLikeCommand && aiStatus().live) {
      const site = await db.site.findFirst({ where: { workspaceId: ctx.workspace.id, id: page.siteId } });
      const brand = site ? await db.brand.findFirst({ where: { workspaceId: ctx.workspace.id, id: site.brandId } }) : null;
      const bv = brand?.currentVersionId ? await db.brandVersion.findFirst({ where: { workspaceId: ctx.workspace.id, id: brand.currentVersionId } }) : null;
      if (bv) {
        const ai = await aiPageEdit({ workspaceId: ctx.workspace.id, brandVersionId: bv.id, profile: BrandProfileSchema.parse(bv.profile), doc, instruction });
        if ("ops" in ai) {
          await proposeChange(actor(ctx), pageId, page.draftVersion, ai.ops, "ai_edit", `AI: ${ai.summary || instruction.slice(0, 200)}`);
          return "AI proposed a change. Review the before/after below — nothing is saved until you apply it.";
        }
        throw new Error(`${ai.error} You can also use commands like “headline: …”.`);
      }
    }
    const ops = parseCommand(instruction, doc.sections);
    await proposeChange(actor(ctx), pageId, page.draftVersion, ops, "human", `Template edit (not AI): ${instruction.slice(0, 300)}`);
    return "Change proposed. Review the before/after below, then apply or reject.";
  });
}

export async function applyChangeAction(f: FormData) {
  const ctx = await requirePermission("site.approve");
  const pageId = str(f, "pageId");
  await runAction(`/app/websites/${pageId}`, async () => { const v = await applyChange(actor(ctx), str(f, "changeId")); return `Applied as draft version ${v}. Publish when ready.`; });
}

export async function rejectChangeAction(f: FormData) {
  const ctx = await requirePermission("site.approve");
  const pageId = str(f, "pageId");
  await runAction(`/app/websites/${pageId}`, async () => { await rejectChange(actor(ctx), str(f, "changeId")); return "Change rejected"; });
}

export async function publishAction(f: FormData) {
  const ctx = await requirePermission("site.publish");
  const pageId = str(f, "pageId");
  await runAction(`/app/websites/${pageId}`, async () => { const v = Number(str(f, "version")); await publishVersion(actor(ctx), pageId, v); return `Version ${v} is now live on the Growth OS preview host.`; });
}

export async function rollbackAction(f: FormData) {
  const ctx = await requirePermission("site.publish");
  const pageId = str(f, "pageId");
  await runAction(`/app/websites/${pageId}`, async () => { const v = await rollbackTo(actor(ctx), pageId, Number(str(f, "version")), f.get("publish") === "on"); return `Restored as version ${v}${f.get("publish") === "on" ? " and published" : " (draft)"}.`; });
}

export async function themeAction(f: FormData) {
  const ctx = await requirePermission("site.write");
  const siteId = str(f, "siteId");
  await runAction(str(f, "returnTo") || "/app/websites", async () => {
    const theme = ThemeSchema.parse({ primary: str(f, "primary"), primaryInk: str(f, "primaryInk"), surface: str(f, "surface"), ink: str(f, "ink"), muted: str(f, "muted"), font: str(f, "font"), radius: str(f, "radius") });
    const issues = themeIssues(theme);
    if (issues.length) throw new Error(`Not saved — ${issues.join(" ")}`);
    await db.site.update({ where: { id: siteId, workspaceId: ctx.workspace.id }, data: { theme } });
    await audit(ctx.workspace.id, ctx.userId, "site.theme", "site", siteId);
    return "Theme saved. It applies to drafts and the live page immediately.";
  });
}

export async function allowedOriginsAction(f: FormData) {
  const ctx = await requirePermission("site.write");
  await runAction(str(f, "returnTo") || "/app/websites", async () => {
    const origins = str(f, "origins").split(/[\s,]+/).filter(Boolean).map((o) => {
      let u: URL;
      try { u = new URL(o); } catch { throw new Error(`“${o}” isn't a web address.`); }
      if (u.protocol !== "https:") throw new Error(`Use https:// for ${o}.`);
      return u.origin;
    });
    const live = str(f, "baseUrl");
    let baseUrl = "";
    if (live) { try { const u = new URL(live); if (u.protocol !== "https:") throw new Error(); baseUrl = u.origin; } catch { throw new Error("The client's live website must be a full https:// address."); } }
    await db.site.update({ where: { id: str(f, "siteId"), workspaceId: ctx.workspace.id }, data: { allowedOrigins: [...new Set(origins)].slice(0, 10), baseUrl } });
    await audit(ctx.workspace.id, ctx.userId, "site.origins", "site", str(f, "siteId"), { origins });
    return origins.length ? `Forms on ${origins.join(", ")} can now send leads here.` : "Only pages served by Growth OS can send leads now.";
  });
}

export async function newPageAction(f: FormData) {
  const ctx = await requirePermission("site.write");
  await runAction("/app/websites", async () => {
    const site = await db.site.findFirst({ where: { workspaceId: ctx.workspace.id, id: str(f, "siteId") } });
    if (!site) throw new Error("Unknown site.");
    const brand = await db.brand.findFirst({ where: { workspaceId: ctx.workspace.id, id: site.brandId } });
    const bv = brand?.currentVersionId ? await db.brandVersion.findFirst({ where: { workspaceId: ctx.workspace.id, id: brand.currentVersionId } }) : null;
    if (!bv) throw new Error("This brand has no approved profile yet.");
    const service = str(f, "service");
    if (!service) throw new Error("Name the service this page is for.");
    const slug = slugify(service);
    if (await db.page.findFirst({ where: { workspaceId: ctx.workspace.id, siteId: site.id, slug } })) throw new Error("A page for that service already exists.");
    const t = templatePage(BrandProfileSchema.parse(bv.profile), "landing", service);
    const page = await db.page.create({ data: { workspaceId: ctx.workspace.id, siteId: site.id, slug, kind: "service", draftVersion: 1, versions: { create: { workspaceId: ctx.workspace.id, version: 1, sections: t.sections, meta: t.meta, origin: "template", note: "Template from brand profile (not AI)", createdById: ctx.userId } } } });
    return { to: `/app/websites/${page.id}`, ok: "Draft page created from the brand template. It isn't public until you publish it." };
  });
}
