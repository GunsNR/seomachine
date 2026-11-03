import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { resetDb, makeWorkspace, touch } from "./helpers";
import { intakeLead } from "@/lib/crm/intake";
import { createBooking, moveStage, netCollections, recordOutcome, recordPayment } from "@/lib/crm/ops";
import { parseTouch } from "@/lib/attribution";

beforeEach(resetDb);

const lead = { firstName: "Dana", lastName: "Reyes", email: "Dana.Reyes@example.test", phone: "732-555-0101", service: "Water heater", message: "No hot water since Sunday." };

describe("acceptance 1 — one effect per submission (REQ-CRM-02)", () => {
  it("a replayed submission (same key) has exactly one effect", async () => {
    const { ws } = await makeWorkspace();
    const a = await intakeLead({ workspaceId: ws.id, formKey: "site:home", idempotencyKey: "k1", input: lead, touch: touch("post-1"), channel: "form" });
    const b = await intakeLead({ workspaceId: ws.id, formKey: "site:home", idempotencyKey: "k1", input: lead, touch: touch("post-1"), channel: "form" });
    expect(a.outcome).toBe("created_opportunity");
    expect(b.outcome).toBe("duplicate");
    expect(b.opportunityId).toBe(a.opportunityId);
    expect(await db.contact.count({ where: { workspaceId: ws.id } })).toBe(1);
    expect(await db.opportunity.count({ where: { workspaceId: ws.id } })).toBe(1);
    expect(await db.task.count({ where: { workspaceId: ws.id } })).toBe(1);
  });

  it("concurrent double-submits with one key still produce one effect", async () => {
    const { ws } = await makeWorkspace();
    const rs = await Promise.all([1, 2, 3].map(() => intakeLead({ workspaceId: ws.id, formKey: "f", idempotencyKey: "same", input: lead, touch: touch(), channel: "form" })));
    expect(rs.filter((r) => r.outcome === "created_opportunity")).toHaveLength(1);
    expect(await db.opportunity.count({ where: { workspaceId: ws.id } })).toBe(1);
    expect(await db.task.count({ where: { workspaceId: ws.id } })).toBe(1);
  });

  it("the same message re-sent with a new key attaches to the open opportunity", async () => {
    const { ws } = await makeWorkspace();
    await intakeLead({ workspaceId: ws.id, formKey: "f", idempotencyKey: "k1", input: lead, touch: touch(), channel: "form" });
    const again = await intakeLead({ workspaceId: ws.id, formKey: "f", idempotencyKey: "k2", input: { ...lead, email: "dana.reyes@EXAMPLE.test " }, touch: touch(), channel: "form" });
    expect(again.outcome).toBe("attached_existing");
    expect(await db.opportunity.count({ where: { workspaceId: ws.id } })).toBe(1);
    expect(await db.task.count({ where: { workspaceId: ws.id } })).toBe(1);
  });

  it("a genuinely separate inquiry creates a second opportunity on the same contact", async () => {
    const { ws } = await makeWorkspace();
    const a = await intakeLead({ workspaceId: ws.id, formKey: "f", idempotencyKey: "k1", input: lead, touch: touch(), channel: "form" });
    const b = await intakeLead({ workspaceId: ws.id, formKey: "f", idempotencyKey: "k2", input: { ...lead, service: "Kitchen repipe", message: "Planning a remodel in spring." }, touch: touch(), channel: "form" });
    expect(b.outcome).toBe("created_opportunity");
    expect(b.contactId).toBe(a.contactId);
    expect(b.opportunityId).not.toBe(a.opportunityId);
  });

  it("a shared phone number is a hint, never a merge", async () => {
    const { ws } = await makeWorkspace();
    const a = await intakeLead({ workspaceId: ws.id, formKey: "f", idempotencyKey: "k1", input: { firstName: "Sam", phone: "732-555-0199", message: "a" }, touch: touch(), channel: "form" });
    const b = await intakeLead({ workspaceId: ws.id, formKey: "f", idempotencyKey: "k2", input: { firstName: "Alex", phone: "(732) 555-0199", message: "b" }, touch: touch(), channel: "form" });
    expect(b.contactId).not.toBe(a.contactId);
    expect(b.phoneMatchHint).toContain(a.contactId);
  });

  it("rejects unusable submissions with a recoverable reason (acceptance 9)", async () => {
    const { ws } = await makeWorkspace();
    const r = await intakeLead({ workspaceId: ws.id, formKey: "f", idempotencyKey: "k1", input: { firstName: "No contact" }, touch: touch(), channel: "form" });
    expect(r.outcome).toBe("rejected");
    expect(r.reason).toMatch(/email address or a phone/);
    expect(await db.contact.count({ where: { workspaceId: ws.id } })).toBe(0);
  });
});

describe("acceptance 2 & 3 — attribution and money stay honest", () => {
  it("traces source/campaign/content from form to booking, win and payment", async () => {
    const { ws, actor } = await makeWorkspace();
    const r = await intakeLead({ workspaceId: ws.id, formKey: "f", idempotencyKey: "k1", input: lead, touch: touch("carousel-oct-2", "instagram", "social"), channel: "form" });
    await createBooking(actor, { contactId: r.contactId!, opportunityId: r.opportunityId, title: "Estimate visit", startsAt: new Date(Date.now() + 86400000), durationMin: 60, timezone: "America/New_York" });
    await moveStage(actor, r.opportunityId!, "won");
    await recordPayment(actor, r.opportunityId!, { kind: "payment", amountMinor: 185000, currency: "USD", receivedAt: new Date() });
    const opp = await db.opportunity.findFirstOrThrow({ where: { workspaceId: ws.id, id: r.opportunityId } });
    const t = parseTouch(opp.attribution)!;
    expect([t.source, t.medium, t.campaign, t.content]).toEqual(["instagram", "social", "fall", "carousel-oct-2"]);
    const booking = await db.booking.findFirstOrThrow({ where: { workspaceId: ws.id, opportunityId: r.opportunityId } });
    expect(booking.verified).toBe(false); // manual record, not a calendar reservation
    const pay = await db.payment.findFirstOrThrow({ where: { workspaceId: ws.id, opportunityId: r.opportunityId } });
    expect(pay.source).toBe("agency_manual");
    expect(pay.confirmedById).toBe(actor.userId);
  });

  it("winning does not create collected revenue; replays count once; refunds reduce net", async () => {
    const { ws, actor } = await makeWorkspace();
    const r = await intakeLead({ workspaceId: ws.id, formKey: "f", idempotencyKey: "k1", input: lead, touch: touch(), channel: "form" });
    const from = new Date(Date.now() - 3600000), to = new Date(Date.now() + 3600000);
    await recordOutcome(actor, r.opportunityId!, "won");
    const opp = await db.opportunity.findFirstOrThrow({ where: { workspaceId: ws.id, id: r.opportunityId } });
    expect(opp.status).toBe("won");
    expect(await netCollections(ws.id, from, to)).toEqual({});

    const p1 = await recordPayment(actor, r.opportunityId!, { kind: "payment", amountMinor: 100000, currency: "USD", receivedAt: new Date(), providerEventId: "evt_1", source: "provider" });
    const p2 = await recordPayment(actor, r.opportunityId!, { kind: "payment", amountMinor: 100000, currency: "USD", receivedAt: new Date(), providerEventId: "evt_1", source: "provider" });
    expect(p1.duplicate).toBe(false);
    expect(p2.duplicate).toBe(true);
    await recordPayment(actor, r.opportunityId!, { kind: "refund", amountMinor: 25000, currency: "USD", receivedAt: new Date() });
    expect(await netCollections(ws.id, from, to)).toEqual({ USD: { gross: 100000, refunds: 25000, net: 75000 } });
  });

  it("client confirmations are marked separately from agency entries", async () => {
    const { ws } = await makeWorkspace("client", "client");
    const r = await intakeLead({ workspaceId: ws.id, formKey: "f", idempotencyKey: "k1", input: lead, touch: touch(), channel: "form" });
    const clientUser = await db.opportunity.findFirstOrThrow({ where: { workspaceId: ws.id } });
    const m = await (await import("@/lib/db")).systemDb.membership.findFirstOrThrow({ where: { workspaceId: ws.id } });
    const ev = await recordOutcome({ workspaceId: ws.id, userId: m.userId, role: "client" }, clientUser.id, "job_value", { valueMinor: 420000 });
    expect(ev.source).toBe("client_manual");
    expect(ev.confirmedRole).toBe("client");
    expect(r.outcome).toBe("created_opportunity");
  });

  it("marking lost needs a reason", async () => {
    const { ws, actor } = await makeWorkspace();
    const r = await intakeLead({ workspaceId: ws.id, formKey: "f", idempotencyKey: "k1", input: lead, touch: touch(), channel: "form" });
    await expect(moveStage(actor, r.opportunityId!, "lost")).rejects.toThrow(/reason/);
  });
});
