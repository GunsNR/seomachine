import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db, systemDb } from "../db";
import { enqueue } from "../jobs/queue";
import { audit } from "../audit";
import { redact } from "../crypto";
import { adapterFor } from "./adapters";
import { AssetSchema, VariantSchema, approvalHash, contentHash, variantIssues, type Asset, type Variant } from "./variants";

type Actor = { workspaceId: string; userId: string; role: string };

export class ContentError extends Error {}

export async function createPiece(a: Actor, p: { brandId: string; briefId?: string; title: string; variants: Variant[]; asset: Asset | null; generator: "human" | "template" | "ai"; isFixture?: boolean }) {
  const brand = await db.brand.findFirst({ where: { workspaceId: a.workspaceId, id: p.brandId } });
  if (!brand) throw new ContentError("Pick a brand in this workspace.");
  const variants = z.array(VariantSchema).parse(p.variants);
  const asset = p.asset ? AssetSchema.parse(p.asset) : null;
  return db.contentPiece.create({
    data: {
      workspaceId: a.workspaceId, brandId: brand.id, briefId: p.briefId, title: p.title, isFixture: !!p.isFixture,
      versions: { create: { workspaceId: a.workspaceId, version: 1, variants, asset: asset ?? undefined, generator: p.generator, contentHash: contentHash(p.title, variants, asset), createdById: a.userId } },
    },
  });
}

async function currentVersion(workspaceId: string, pieceId: string) {
  const piece = await db.contentPiece.findFirst({ where: { workspaceId, id: pieceId } });
  if (!piece) throw new ContentError("Unknown content.");
  const version = await db.contentVersion.findFirst({ where: { workspaceId, pieceId, version: piece.currentVersion } });
  if (!version) throw new ContentError("Content has no current version.");
  return { piece, version };
}

/**
 * Editing creates a new version and revokes every active approval: approval
 * binds to the exact version that was reviewed.
 */
export async function editPiece(a: Actor, pieceId: string, p: { title: string; variants: Variant[]; asset: Asset | null }) {
  const { piece, version } = await currentVersion(a.workspaceId, pieceId);
  if (["publishing", "published", "partial"].includes(piece.status)) throw new ContentError("This post already went out to at least one destination, so it can't be changed. Start a new post instead.");
  const variants = z.array(VariantSchema).parse(p.variants);
  const asset = p.asset ? AssetSchema.parse(p.asset) : null;
  const hash = contentHash(p.title, variants, asset);
  if (hash === version.contentHash) return { changed: false };
  const next = piece.currentVersion + 1;
  await db.$transaction(async (tx) => {
    await tx.contentVersion.create({ data: { workspaceId: a.workspaceId, pieceId, version: next, variants, asset: asset ?? undefined, generator: "human", contentHash: hash, createdById: a.userId } });
    await tx.contentPiece.update({ where: { id: pieceId, workspaceId: a.workspaceId }, data: { currentVersion: next, title: p.title, status: "draft" } });
    await tx.approval.updateMany({ where: { workspaceId: a.workspaceId, subjectType: "content", subjectId: pieceId, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: "content edited" } });
    await tx.publication.updateMany({ where: { workspaceId: a.workspaceId, pieceId, status: "queued" }, data: { status: "cancelled", lastError: "Content was edited after approval." } });
  });
  await audit(a.workspaceId, a.userId, "content.edit", "content", pieceId, { version: next });
  return { changed: true };
}

export async function submitForReview(a: Actor, pieceId: string) {
  const { version } = await currentVersion(a.workspaceId, pieceId);
  const issues = z.array(VariantSchema).parse(version.variants).flatMap((v) => variantIssues(v).map((i) => `${v.platform}: ${i}`));
  if (issues.length) throw new ContentError(issues.join(" "));
  await db.contentPiece.update({ where: { id: pieceId, workspaceId: a.workspaceId }, data: { status: "in_review" } });
}

/** Approve (or reject) the current version for specific destinations and a specific time. */
export async function decide(a: Actor, pieceId: string, d: { decision: "approved" | "rejected"; destinationIds: string[]; scheduleAt: Date | null; note?: string }) {
  const { piece, version } = await currentVersion(a.workspaceId, pieceId);
  if (d.decision === "approved") {
    if (d.destinationIds.length === 0) throw new ContentError("Choose at least one destination.");
    const dests = await db.destination.findMany({ where: { workspaceId: a.workspaceId, id: { in: d.destinationIds }, brandId: piece.brandId } });
    if (dests.length !== d.destinationIds.length) throw new ContentError("A destination doesn't belong to this brand.");
  }
  // Any new decision supersedes earlier ones: a "send back" must never leave an older approval usable.
  await db.approval.updateMany({ where: { workspaceId: a.workspaceId, subjectType: "content", subjectId: pieceId, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: `superseded by ${d.decision} decision` } });
  if (d.decision === "rejected") await db.publication.updateMany({ where: { workspaceId: a.workspaceId, pieceId, status: "queued" }, data: { status: "cancelled", lastError: "Sent back by an approver." } });
  const approval = await db.approval.create({
    data: {
      workspaceId: a.workspaceId, subjectType: "content", subjectId: pieceId, subjectHash: approvalHash(version.contentHash, d.destinationIds, d.scheduleAt),
      destinationIds: d.destinationIds, scheduleAt: d.scheduleAt, approverId: a.userId, approverRole: a.role, decision: d.decision, note: d.note ?? "",
    },
  });
  await db.contentPiece.update({ where: { id: pieceId, workspaceId: a.workspaceId }, data: { status: d.decision === "approved" ? "approved" : "rejected", scheduledFor: d.scheduleAt } });
  await audit(a.workspaceId, a.userId, `content.${d.decision}`, "content", pieceId, { version: version.version, destinations: d.destinationIds });
  return approval;
}

/** Queue one publication per approved destination. Idempotent per (version, destination). */
export async function schedule(a: Actor, pieceId: string) {
  const { piece, version } = await currentVersion(a.workspaceId, pieceId);
  const approval = await db.approval.findFirst({ where: { workspaceId: a.workspaceId, subjectType: "content", subjectId: pieceId, decision: "approved", revokedAt: null }, orderBy: { createdAt: "desc" } });
  if (!approval) throw new ContentError("Approve this version first.");
  if (approval.subjectHash !== approvalHash(version.contentHash, approval.destinationIds, approval.scheduleAt)) throw new ContentError("The approval is for an older version. Ask for approval again.");
  const ids: string[] = [];
  for (const destinationId of approval.destinationIds) {
    const idempotencyKey = `pub:${version.id}:${destinationId}`;
    const pub = await db.publication.upsert({
      where: { workspaceId_idempotencyKey: { workspaceId: a.workspaceId, idempotencyKey } },
      create: { workspaceId: a.workspaceId, pieceId, versionId: version.id, destinationId, approvalId: approval.id, idempotencyKey },
      update: {},
    });
    await enqueue("publication.dispatch", a.workspaceId, { id: pub.id }, { runAfter: approval.scheduleAt ?? new Date(), idempotencyKey: `job:${idempotencyKey}` });
    ids.push(pub.id);
  }
  await db.contentPiece.update({ where: { id: piece.id, workspaceId: a.workspaceId }, data: { status: "scheduled" } });
  return ids;
}

async function rollUpStatus(workspaceId: string, pieceId: string) {
  const pubs = await db.publication.findMany({ where: { workspaceId, pieceId, status: { not: "cancelled" } } });
  if (pubs.length === 0) return;
  const done = (s: string) => ["published", "accepted", "manual_handoff"].includes(s);
  const bad = (s: string) => ["failed", "refused"].includes(s);
  let status = "publishing";
  if (pubs.every((p) => done(p.status))) status = "published";
  else if (pubs.some((p) => done(p.status)) && pubs.some((p) => bad(p.status))) status = "partial";
  else if (pubs.every((p) => bad(p.status))) status = "failed";
  await db.contentPiece.update({ where: { id: pieceId, workspaceId }, data: { status } });
}

/**
 * Worker step. Re-verifies everything at execution time: workspace pause,
 * approval not revoked, approval hash still matches the CURRENT version,
 * destination still in the approval, and the publication not already done.
 */
export async function dispatchPublication(workspaceId: string, publicationId: string) {
  const pub = await db.publication.findFirst({ where: { workspaceId, id: publicationId } });
  if (!pub || !["queued", "ambiguous"].includes(pub.status)) return pub?.status ?? "missing";
  if (pub.status === "ambiguous") return reconcilePublication(workspaceId, publicationId);
  const refuse = async (reason: string) => {
    await db.publication.update({ where: { id: pub.id, workspaceId }, data: { status: "refused", lastError: reason } });
    await rollUpStatus(workspaceId, pub.pieceId);
    return "refused";
  };
  const ws = await systemDb.workspace.findUnique({ where: { id: workspaceId } });
  if (ws?.pausedAt) {
    await enqueue("publication.dispatch", workspaceId, { id: pub.id }, { runAfter: new Date(Date.now() + 15 * 60000), idempotencyKey: `job:${pub.idempotencyKey}:pause:${Math.floor(Date.now() / 900000)}` });
    return "paused";
  }
  const { piece, version } = await currentVersion(workspaceId, pub.pieceId);
  if (version.id !== pub.versionId) return refuse("Content changed after approval. This queued version is stale.");
  const approval = await db.approval.findFirst({ where: { workspaceId, id: pub.approvalId } });
  if (!approval || approval.revokedAt || approval.decision !== "approved") return refuse("Approval was revoked.");
  if (approval.subjectHash !== approvalHash(version.contentHash, approval.destinationIds, approval.scheduleAt)) return refuse("Approval does not match this version.");
  if (!approval.destinationIds.includes(pub.destinationId)) return refuse("Destination was not approved.");
  const dest = await db.destination.findFirst({ where: { workspaceId, id: pub.destinationId, brandId: piece.brandId } });
  if (!dest) return refuse("Destination no longer exists for this brand.");

  const variants = z.array(VariantSchema).parse(version.variants);
  const variant = variants.find((v) => v.platform === dest.platform);
  if (!variant) return refuse(`No ${dest.platform} version of this post.`);

  const adapter = adapterFor(dest.adapter);
  if (!adapter) {
    await db.publication.update({ where: { id: pub.id, workspaceId }, data: { status: "manual_handoff", lastError: "No verified publishing connection. Download the post package and publish by hand." } });
    await rollUpStatus(workspaceId, pub.pieceId);
    return "manual_handoff";
  }
  await db.publication.update({ where: { id: pub.id, workspaceId }, data: { attempts: { increment: 1 } } });
  const caption = [variant.caption, variant.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")].filter(Boolean).join("\n\n");
  let res;
  try {
    res = await adapter.publish({ idempotencyKey: pub.idempotencyKey, platform: dest.platform, caption });
  } catch (e) {
    res = { kind: "timeout" as const, error: redact(String(e)) };
  }
  if (res.kind === "accepted") {
    await db.publication.update({ where: { id: pub.id, workspaceId }, data: { status: res.publishedUrl ? "published" : "accepted", providerRef: res.providerRef, publishedUrl: res.publishedUrl ?? "", acceptedAt: new Date(), publishedAt: res.publishedUrl ? new Date() : null, lastError: "" } });
  } else if (res.kind === "rejected") {
    await db.publication.update({ where: { id: pub.id, workspaceId }, data: { status: "failed", lastError: redact(res.reason) } });
  } else {
    // Unknown whether the provider accepted it. Never resend blindly: reconcile first.
    await db.publication.update({ where: { id: pub.id, workspaceId }, data: { status: "ambiguous", lastError: "Provider did not answer. Checking whether it was posted before any retry." } });
    await enqueue("publication.reconcile", workspaceId, { id: pub.id }, { runAfter: new Date(Date.now() + 60000), idempotencyKey: `reconcile:${pub.id}:${pub.attempts + 1}` });
  }
  await rollUpStatus(workspaceId, pub.pieceId);
  return res.kind;
}

/** After an ambiguous result: ask the provider before resending. */
export async function reconcilePublication(workspaceId: string, publicationId: string) {
  const pub = await db.publication.findFirst({ where: { workspaceId, id: publicationId } });
  if (!pub || pub.status !== "ambiguous") return pub?.status ?? "missing";
  const dest = await db.destination.findFirst({ where: { workspaceId, id: pub.destinationId } });
  const adapter = dest ? adapterFor(dest.adapter) : null;
  if (!adapter) return "manual_handoff";
  const found = await adapter.lookup(pub.idempotencyKey);
  if (found.found) {
    await db.publication.update({ where: { id: pub.id, workspaceId }, data: { status: found.publishedUrl ? "published" : "accepted", providerRef: found.providerRef ?? "", publishedUrl: found.publishedUrl ?? "", acceptedAt: new Date(), publishedAt: found.publishedUrl ? new Date() : null, lastError: "Confirmed by reconciliation; not resent." } });
  } else if (pub.attempts < 3) {
    await db.publication.update({ where: { id: pub.id, workspaceId }, data: { status: "queued", lastError: "Not found at provider; safe to retry." } });
    await enqueue("publication.dispatch", workspaceId, { id: pub.id }, { idempotencyKey: `job:${pub.idempotencyKey}:retry:${pub.attempts}` });
  } else {
    await db.publication.update({ where: { id: pub.id, workspaceId }, data: { status: "failed", lastError: "Could not confirm after 3 attempts. Check the account by hand." } });
  }
  await rollUpStatus(workspaceId, pub.pieceId);
  return "reconciled";
}

export type PubJson = Prisma.JsonValue;
