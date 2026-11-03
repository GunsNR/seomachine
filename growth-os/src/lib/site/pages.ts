import { db } from "../db";
import { audit } from "../audit";
import { MetaSchema, SectionsSchema, type PageMeta, type Section } from "./sections";
import { applyPatch, PatchOpSchema, type PatchOp } from "./patch";
import { z } from "zod";

type Actor = { workspaceId: string; userId: string; role: string };

export class StaleVersionError extends Error {
  constructor(public base: number, public current: number) {
    super(`This change was made against version ${base}, but the page is now at version ${current}. Review the latest version and try again.`);
    this.name = "StaleVersionError";
  }
}

export async function loadPage(workspaceId: string, pageId: string) {
  const page = await db.page.findFirst({ where: { workspaceId, id: pageId }, include: { site: true } });
  if (!page) throw new Error("Unknown page.");
  const draft = await db.pageVersion.findFirst({ where: { workspaceId, pageId, version: page.draftVersion } });
  if (!draft) throw new Error("Page has no draft.");
  return { page, draft, doc: { sections: SectionsSchema.parse(draft.sections), meta: MetaSchema.parse(draft.meta) } };
}

/**
 * Save a new draft version, but only if the caller saw the latest version.
 * The compare-and-set on draftVersion is what rejects a stale write.
 */
export async function saveVersion(a: Actor, pageId: string, baseVersion: number, doc: { sections: Section[]; meta: PageMeta }, origin: "human" | "ai_proposal" | "seo_patch" | "rollback" | "template", note = "") {
  const sections = SectionsSchema.parse(doc.sections);
  const meta = MetaSchema.parse(doc.meta);
  return db.$transaction(async (tx) => {
    const next = baseVersion + 1;
    const moved = await tx.page.updateMany({ where: { workspaceId: a.workspaceId, id: pageId, draftVersion: baseVersion }, data: { draftVersion: next } });
    if (moved.count === 0) {
      const cur = await tx.page.findFirst({ where: { workspaceId: a.workspaceId, id: pageId } });
      throw new StaleVersionError(baseVersion, cur?.draftVersion ?? -1);
    }
    await tx.pageVersion.create({ data: { workspaceId: a.workspaceId, pageId, version: next, sections, meta, origin, note, createdById: a.userId } });
    return next;
  });
}

export async function proposeChange(a: Actor, pageId: string, baseVersion: number, ops: PatchOp[], origin: "ai_edit" | "seo_patch" | "human", rationale: string, findingId?: string) {
  const { page, doc } = await loadPage(a.workspaceId, pageId);
  if (page.draftVersion !== baseVersion) throw new StaleVersionError(baseVersion, page.draftVersion);
  const patch = z.array(PatchOpSchema).parse(ops);
  applyPatch(doc, patch); // validate now so a broken proposal never reaches review
  return db.pageChange.create({ data: { workspaceId: a.workspaceId, pageId, baseVersion, patch: patch as object[], origin, rationale, findingId, createdById: a.userId } });
}

/** Apply an approved change. Refuses (and marks stale) if a newer human revision exists. */
export async function applyChange(a: Actor, changeId: string) {
  const ch = await db.pageChange.findFirst({ where: { workspaceId: a.workspaceId, id: changeId } });
  if (!ch || ch.status !== "proposed") throw new Error("This change is no longer pending.");
  const { page, doc } = await loadPage(a.workspaceId, ch.pageId);
  if (page.draftVersion !== ch.baseVersion) {
    await db.pageChange.update({ where: { id: ch.id, workspaceId: a.workspaceId }, data: { status: "stale" } });
    throw new StaleVersionError(ch.baseVersion, page.draftVersion);
  }
  const next = applyPatch(doc, z.array(PatchOpSchema).parse(ch.patch));
  const version = await saveVersion(a, ch.pageId, ch.baseVersion, next, ch.origin === "seo_patch" ? "seo_patch" : ch.origin === "ai_edit" ? "ai_proposal" : "human", ch.rationale.slice(0, 200));
  await db.pageChange.update({ where: { id: ch.id, workspaceId: a.workspaceId }, data: { status: "applied", appliedVersion: version } });
  await db.approval.create({ data: { workspaceId: a.workspaceId, subjectType: "page_change", subjectId: ch.id, subjectHash: `${ch.pageId}@${ch.baseVersion}`, approverId: a.userId, approverRole: a.role, decision: "approved" } });
  if (ch.findingId) await db.seoFinding.updateMany({ where: { workspaceId: a.workspaceId, id: ch.findingId }, data: { status: "patch_proposed" } });
  await audit(a.workspaceId, a.userId, "page.change.apply", "page", ch.pageId, { changeId: ch.id, version });
  return version;
}

export async function rejectChange(a: Actor, changeId: string) {
  await db.pageChange.updateMany({ where: { workspaceId: a.workspaceId, id: changeId, status: "proposed" }, data: { status: "rejected" } });
}

/** Publishing is separate from saving: it points the public URL at a saved version. */
export async function publishVersion(a: Actor, pageId: string, version: number) {
  const v = await db.pageVersion.findFirst({ where: { workspaceId: a.workspaceId, pageId, version } });
  if (!v) throw new Error("That version doesn't exist.");
  await db.page.update({ where: { id: pageId, workspaceId: a.workspaceId }, data: { publishedVersion: version } });
  await audit(a.workspaceId, a.userId, "page.publish", "page", pageId, { version });
}

/** Roll back by copying an old version forward as a new draft (history is never rewritten), then publishing it. */
export async function rollbackTo(a: Actor, pageId: string, version: number, publish: boolean) {
  const { page } = await loadPage(a.workspaceId, pageId);
  const old = await db.pageVersion.findFirst({ where: { workspaceId: a.workspaceId, pageId, version } });
  if (!old) throw new Error("That version doesn't exist.");
  const next = await saveVersion(a, pageId, page.draftVersion, { sections: SectionsSchema.parse(old.sections), meta: MetaSchema.parse(old.meta) }, "rollback", `Restored version ${version}`);
  if (publish) await publishVersion(a, pageId, next);
  await db.pageChange.updateMany({ where: { workspaceId: a.workspaceId, pageId, status: "applied", appliedVersion: { gt: version } }, data: { status: "rolled_back" } });
  return next;
}
