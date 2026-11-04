import { describe, it, expect, beforeEach } from "vitest";
import { db, systemDb } from "@/lib/db";
import { resetDb, makeWorkspace, touch, makeBrand } from "./helpers";
import { intakeLead } from "@/lib/crm/intake";
import { addNote, moveStage, recordPayment } from "@/lib/crm/ops";
import { createSession, resolveSession, switchSessionWorkspace } from "@/lib/session";
import { createPiece, decide, dispatchPublication } from "@/lib/content/publish";
import { buildRender } from "@/lib/site/public";
import { templatePage } from "@/lib/site/sections";
import { profile } from "./helpers";
import { can } from "@/lib/rbac";

beforeEach(resetDb);

describe("acceptance 4 — clients cannot reach each other's records (REQ-SEC-02)", () => {
  it("domain operations refuse cross-workspace ids", async () => {
    const A = await makeWorkspace();
    const B = await makeWorkspace();
    const r = await intakeLead({ workspaceId: A.ws.id, formKey: "f", idempotencyKey: "k", input: { email: "x@example.test", message: "hi" }, touch: touch(), channel: "form" });
    await expect(moveStage(B.actor, r.opportunityId!, "won")).rejects.toThrow(/doesn't exist in this workspace/);
    await expect(recordPayment(B.actor, r.opportunityId!, { kind: "payment", amountMinor: 1, currency: "USD", receivedAt: new Date() })).rejects.toThrow();
    await expect(addNote(B.actor, r.contactId!, "peek")).rejects.toThrow();
    expect(await db.opportunity.findFirst({ where: { workspaceId: B.ws.id, id: r.opportunityId } })).toBeNull();
  });

  it("content approval and background publishing stay inside the workspace", async () => {
    const A = await makeWorkspace();
    const B = await makeWorkspace();
    const { brand } = await makeBrand(A.ws.id, A.user.id);
    const destA = await db.destination.create({ data: { workspaceId: A.ws.id, brandId: brand.id, platform: "linkedin", label: "LI", adapter: "dry_run", status: "connected" } });
    const piece = await createPiece(A.actor, { brandId: brand.id, title: "Post", variants: [{ platform: "linkedin", caption: "Hello", hook: "", hashtags: [], mentions: [], internalTags: [], title: "" }], asset: null, generator: "human" });
    await expect(decide(B.actor, piece.id, { decision: "approved", destinationIds: [destA.id], scheduleAt: null })).rejects.toThrow(/Unknown content/);
    const pub = await db.publication.create({ data: { workspaceId: A.ws.id, pieceId: piece.id, versionId: "v", destinationId: destA.id, approvalId: "a", idempotencyKey: "x" } });
    expect(await dispatchPublication(B.ws.id, pub.id)).toBe("missing");
  });

  it("a page render scoped to another workspace returns nothing", async () => {
    const A = await makeWorkspace();
    const B = await makeWorkspace();
    const { brand } = await makeBrand(A.ws.id, A.user.id);
    const t = templatePage(profile(), "home");
    const site = await db.site.create({ data: { workspaceId: A.ws.id, brandId: brand.id, name: "A", slug: "a-site", theme: profile().theme } });
    const page = await db.page.create({ data: { workspaceId: A.ws.id, siteId: site.id, slug: "home", kind: "home", draftVersion: 1, publishedVersion: 1 } });
    await db.pageVersion.create({ data: { workspaceId: A.ws.id, pageId: page.id, version: 1, sections: t.sections, meta: t.meta, origin: "template", createdById: A.user.id } });
    expect(await buildRender({ siteSlug: "a-site", pageSlug: "home", which: "draft", origin: "http://x", mode: "preview", workspaceId: B.ws.id })).toBeNull();
    expect(await buildRender({ siteSlug: "a-site", pageSlug: "home", which: "draft", origin: "http://x", mode: "preview", workspaceId: A.ws.id })).not.toBeNull();
  });

  it("sessions cannot switch into, or survive revocation from, a workspace", async () => {
    const A = await makeWorkspace();
    const B = await makeWorkspace();
    const { token } = await createSession(A.user.id, A.ws.id);
    const ctx = await resolveSession(token);
    expect(ctx?.workspace.id).toBe(A.ws.id);
    await expect(switchSessionWorkspace(ctx!.sessionId, A.user.id, B.ws.id)).rejects.toThrow(/not a member/);
    await systemDb.membership.updateMany({ where: { userId: A.user.id, workspaceId: A.ws.id }, data: { revokedAt: new Date() } });
    expect(await resolveSession(token)).toBeNull();
    expect(await resolveSession("short")).toBeNull();
  });

  it("client role sees the portal only", () => {
    expect(can("client", "crm.read")).toBe(false);
    expect(can("client", "settings.manage")).toBe(false);
    expect(can("client", "outcome.confirm")).toBe(true);
    expect(can("member", "live.toggle")).toBe(false);
  });
});
