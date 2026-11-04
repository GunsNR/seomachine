import { describe, it, expect, beforeEach, vi } from "vitest";
import { db, systemDb } from "@/lib/db";
import { resetDb, makeWorkspace, makeBrand } from "./helpers";
import { createPiece, decide, editPiece, schedule, dispatchPublication, reconcilePublication } from "@/lib/content/publish";
import { dryRunAdapter } from "@/lib/content/adapters";
import { runDueJobs } from "@/lib/jobs/queue";
import { handlers } from "@/lib/jobs/handlers";
import type { Variant } from "@/lib/content/variants";

beforeEach(resetDb);

const v = (platform: Variant["platform"], caption: string): Variant => ({ platform, caption, hook: "", hashtags: [], mentions: [], internalTags: [], title: "" });

async function setup() {
  const W = await makeWorkspace();
  const { brand } = await makeBrand(W.ws.id, W.user.id);
  const li = await db.destination.create({ data: { workspaceId: W.ws.id, brandId: brand.id, platform: "linkedin", label: "LinkedIn page", adapter: "dry_run", status: "connected" } });
  const fb = await db.destination.create({ data: { workspaceId: W.ws.id, brandId: brand.id, platform: "facebook", label: "Facebook page", adapter: "dry_run", status: "connected" } });
  const ig = await db.destination.create({ data: { workspaceId: W.ws.id, brandId: brand.id, platform: "instagram", label: "Instagram", adapter: "manual", status: "manual_handoff" } });
  return { ...W, brand, li, fb, ig };
}

describe("acceptance 5 — approval binds to the exact version (REQ-CON-04)", () => {
  it("editing approved content revokes approval and the queued worker refuses the stale version", async () => {
    const S = await setup();
    const piece = await createPiece(S.actor, { brandId: S.brand.id, title: "Tip", variants: [v("linkedin", "Version one")], asset: null, generator: "human" });
    await decide(S.actor, piece.id, { decision: "approved", destinationIds: [S.li.id], scheduleAt: null });
    const [pubId] = await schedule(S.actor, piece.id);
    // Edit after scheduling: approval is revoked, queued publication cancelled.
    await editPiece(S.actor, piece.id, { title: "Tip", variants: [v("linkedin", "Version two, unreviewed")], asset: null });
    const approval = await db.approval.findFirstOrThrow({ where: { workspaceId: S.ws.id, subjectId: piece.id } });
    expect(approval.revokedAt).not.toBeNull();
    // Even if the worker picks it up (e.g. the cancel raced), it re-checks and refuses.
    await db.publication.update({ where: { id: pubId!, workspaceId: S.ws.id }, data: { status: "queued" } });
    expect(await dispatchPublication(S.ws.id, pubId!)).toBe("refused");
    const pub = await db.publication.findFirstOrThrow({ where: { workspaceId: S.ws.id, id: pubId } });
    expect(pub.lastError).toMatch(/stale|changed/i);
    await expect(schedule(S.actor, piece.id)).rejects.toThrow(/Approve this version first/);
  });

  it("approval for one brand's destination cannot target another brand", async () => {
    const S = await setup();
    const other = await makeBrand(S.ws.id, S.user.id);
    const piece = await createPiece(S.actor, { brandId: other.brand.id, title: "T", variants: [v("linkedin", "x")], asset: null, generator: "human" });
    await expect(decide(S.actor, piece.id, { decision: "approved", destinationIds: [S.li.id], scheduleAt: null })).rejects.toThrow(/doesn't belong to this brand/);
  });
});

describe("acceptance 7 — ambiguous provider results reconcile before any resend", () => {
  it("timeout after acceptance → ambiguous → reconciled as published, provider called once", async () => {
    const S = await setup();
    const spy = vi.spyOn(dryRunAdapter, "publish");
    const piece = await createPiece(S.actor, { brandId: S.brand.id, title: "T", variants: [v("linkedin", "Post [[timeout]]")], asset: null, generator: "human" });
    await decide(S.actor, piece.id, { decision: "approved", destinationIds: [S.li.id], scheduleAt: null });
    const [id] = await schedule(S.actor, piece.id);
    await runDueJobs(handlers);
    let pub = await db.publication.findFirstOrThrow({ where: { workspaceId: S.ws.id, id } });
    expect(pub.status).toBe("ambiguous");
    await reconcilePublication(S.ws.id, id!);
    pub = await db.publication.findFirstOrThrow({ where: { workspaceId: S.ws.id, id } });
    expect(pub.status).toBe("published");
    expect(pub.lastError).toMatch(/not resent/);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("partial multi-platform success stays visible per destination", async () => {
    const S = await setup();
    const piece = await createPiece(S.actor, { brandId: S.brand.id, title: "T", variants: [v("linkedin", "Works"), v("facebook", "Broken [[fail]]"), v("instagram", "Hand off")], asset: null, generator: "human" });
    await decide(S.actor, piece.id, { decision: "approved", destinationIds: [S.li.id, S.fb.id, S.ig.id], scheduleAt: null });
    await schedule(S.actor, piece.id);
    await runDueJobs(handlers);
    const pubs = await db.publication.findMany({ where: { workspaceId: S.ws.id, pieceId: piece.id } });
    const by = Object.fromEntries(pubs.map((p) => [p.destinationId, p.status]));
    expect(by[S.li.id]).toBe("published");
    expect(by[S.fb.id]).toBe("failed");
    expect(by[S.ig.id]).toBe("manual_handoff");
    expect((await db.contentPiece.findFirstOrThrow({ where: { workspaceId: S.ws.id, id: piece.id } })).status).toBe("partial");
  });

  it("scheduling twice never queues a second publication per destination", async () => {
    const S = await setup();
    const piece = await createPiece(S.actor, { brandId: S.brand.id, title: "T", variants: [v("linkedin", "x")], asset: null, generator: "human" });
    await decide(S.actor, piece.id, { decision: "approved", destinationIds: [S.li.id], scheduleAt: null });
    await schedule(S.actor, piece.id);
    await schedule(S.actor, piece.id);
    expect(await db.publication.count({ where: { workspaceId: S.ws.id, pieceId: piece.id } })).toBe(1);
  });

  it("workspace pause holds a due publication", async () => {
    const S = await setup();
    const piece = await createPiece(S.actor, { brandId: S.brand.id, title: "T", variants: [v("linkedin", "x")], asset: null, generator: "human" });
    await decide(S.actor, piece.id, { decision: "approved", destinationIds: [S.li.id], scheduleAt: null });
    const [id] = await schedule(S.actor, piece.id);
    await systemDb.workspace.update({ where: { id: S.ws.id }, data: { pausedAt: new Date() } });
    expect(await dispatchPublication(S.ws.id, id!)).toBe("paused");
    expect((await db.publication.findFirstOrThrow({ where: { workspaceId: S.ws.id, id } })).status).toBe("queued");
  });
});
