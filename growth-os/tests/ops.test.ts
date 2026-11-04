import { describe, it, expect, beforeEach } from "vitest";
import { db, systemDb } from "@/lib/db";
import { resetDb, makeWorkspace, touch } from "./helpers";
import { purge, RETENTION } from "@/lib/retention";
import { signFlash, readFlash } from "@/lib/flash";
import { clientIp } from "@/lib/client-ip";
import { intakeLead } from "@/lib/crm/intake";
import { assignOwner } from "@/lib/crm/ops";

beforeEach(resetDb);

describe("retention purge (REQ-OPS-03)", () => {
  it("deletes only aged sessions/tokens and never suppression entries", async () => {
    const W = await makeWorkspace();
    const old = new Date(Date.now() - (RETENTION.revokedSessionDays + 5) * 86400000);
    await systemDb.session.create({ data: { tokenHash: "old", userId: W.user.id, workspaceId: W.ws.id, expiresAt: old, revokedAt: old } });
    await systemDb.session.create({ data: { tokenHash: "fresh", userId: W.user.id, workspaceId: W.ws.id, expiresAt: new Date(Date.now() + 86400000) } });
    await db.suppression.create({ data: { workspaceId: W.ws.id, channel: "email", value: "x@example.test", reason: "opt_out", createdAt: new Date("2020-01-01") } });
    const r = await purge();
    expect(r.sessions).toBe(1);
    expect(await systemDb.session.count()).toBe(1);
    expect(await db.suppression.count({ where: { workspaceId: W.ws.id } })).toBe(1);
  });
});

describe("signed flash messages (G8)", () => {
  it("shows only server-signed text", () => {
    expect(readFlash(signFlash("Saved"))).toBe("Saved");
    expect(readFlash("Your account is locked, call 555-0100")).toBeUndefined();
    const [b64] = signFlash("Saved").split(".");
    expect(readFlash(`${Buffer.from("Forged!").toString("base64url")}.${signFlash("Saved").split(".")[1]}`)).toBeUndefined();
    expect(b64).toBeTruthy();
  });
});

describe("client IP for rate limits (G5)", () => {
  it("ignores X-Forwarded-For unless proxy hops are configured", () => {
    const h = new Headers({ "x-forwarded-for": "6.6.6.6, 1.2.3.4, 10.0.0.1" });
    delete process.env.TRUST_PROXY_HOPS;
    expect(clientIp(h)).toBe("untrusted");
    process.env.TRUST_PROXY_HOPS = "1";
    expect(clientIp(h)).toBe("10.0.0.1");
    process.env.TRUST_PROXY_HOPS = "2";
    expect(clientIp(h)).toBe("1.2.3.4");
    delete process.env.TRUST_PROXY_HOPS;
  });
});

describe("deal assignment fires its trigger (REQ-AUT-01)", () => {
  it("starts an 'opportunity_assigned' workflow and rejects non-members", async () => {
    const W = await makeWorkspace();
    await db.workflow.create({ data: { workspaceId: W.ws.id, name: "On assign", trigger: "opportunity_assigned", enabled: true, versions: { create: { workspaceId: W.ws.id, version: 1, definition: { steps: [{ type: "create_task", title: "Intro call", dueInMinutes: 30 }] } } } } });
    const r = await intakeLead({ workspaceId: W.ws.id, formKey: "f", idempotencyKey: "k", input: { email: "a@example.test", message: "m" }, touch: touch(), channel: "form" });
    await assignOwner(W.actor, r.opportunityId!, W.user.id);
    expect(await db.workflowRun.count({ where: { workspaceId: W.ws.id } })).toBe(1);
    const other = await makeWorkspace();
    await expect(assignOwner(W.actor, r.opportunityId!, other.user.id)).rejects.toThrow(/current team member/);
  });
});
