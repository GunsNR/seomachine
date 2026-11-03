import { describe, it, expect, beforeEach } from "vitest";
import { db, systemDb } from "@/lib/db";
import { resetDb, makeWorkspace, touch } from "./helpers";
import { intakeLead } from "@/lib/crm/intake";
import { recordInbound, createBooking } from "@/lib/crm/ops";
import { advanceRun } from "@/lib/workflows/engine";
import { runDueJobs } from "@/lib/jobs/queue";
import { handlers } from "@/lib/jobs/handlers";
import { DefinitionSchema, MAX_STEPS } from "@/lib/workflows/definition";

beforeEach(resetDb);

async function withFlow(steps: unknown[]) {
  const W = await makeWorkspace();
  const wf = await db.workflow.create({ data: { workspaceId: W.ws.id, name: "New lead follow-up", trigger: "form_submitted", enabled: true, versions: { create: { workspaceId: W.ws.id, version: 1, definition: { steps } } } } });
  const r = await intakeLead({ workspaceId: W.ws.id, formKey: "f", idempotencyKey: "k", input: { firstName: "Pat", email: "pat@example.test", message: "Leak", consentEmail: true }, touch: touch(), channel: "form" });
  const run = await db.workflowRun.findFirstOrThrow({ where: { workspaceId: W.ws.id } });
  return { ...W, wf, r, run };
}

const followUp = [
  { type: "create_task", title: "Call {{first_name}}", dueInMinutes: 30 },
  { type: "wait", minutes: 60 * 24 },
  { type: "send_message", channel: "email", subject: "Following up", body: "Hi {{first_name}}, checking in." },
];

describe("acceptance 6 — stop rules are checked at dispatch time (REQ-AUT-03)", () => {
  it("an opt-out while waiting prevents the queued follow-up", async () => {
    const S = await withFlow(followUp);
    expect(await advanceRun(S.ws.id, S.run.id, 0)).toEqual({ state: "advanced" });
    expect(await advanceRun(S.ws.id, S.run.id, 1)).toEqual({ state: "waiting" });
    await recordInbound(S.actor, S.r.contactId!, "opt_out");
    const res = await advanceRun(S.ws.id, S.run.id, 2);
    expect(res.state).toBe("inactive");
    expect(await db.outboundMessage.count({ where: { workspaceId: S.ws.id } })).toBe(0);
    expect((await db.workflowRun.findFirstOrThrow({ where: { workspaceId: S.ws.id, id: S.run.id } })).stopReason).toBe("opt_out");
  });

  it("an opt-out recorded only as suppression (no stop call) is still caught before dispatch", async () => {
    const S = await withFlow(followUp);
    await advanceRun(S.ws.id, S.run.id, 0);
    await advanceRun(S.ws.id, S.run.id, 1);
    await db.suppression.create({ data: { workspaceId: S.ws.id, channel: "email", value: "pat@example.test", reason: "bounce" } });
    expect((await advanceRun(S.ws.id, S.run.id, 2)).detail).toBe("opt_out");
    expect(await db.outboundMessage.count({ where: { workspaceId: S.ws.id } })).toBe(0);
  });

  it("a reply or booking stops the run", async () => {
    const S = await withFlow(followUp);
    await advanceRun(S.ws.id, S.run.id, 0);
    await createBooking(S.actor, { contactId: S.r.contactId!, title: "Visit", startsAt: new Date(Date.now() + 86400000), durationMin: 30, timezone: "America/New_York" });
    expect((await db.workflowRun.findFirstOrThrow({ where: { workspaceId: S.ws.id, id: S.run.id } })).stopReason).toBe("booking");
  });

  it("workspace pause holds the step without executing it", async () => {
    const S = await withFlow(followUp);
    await systemDb.workspace.update({ where: { id: S.ws.id }, data: { pausedAt: new Date() } });
    expect((await advanceRun(S.ws.id, S.run.id, 0)).state).toBe("paused");
    expect(await db.task.count({ where: { workspaceId: S.ws.id, workflowRunId: S.run.id } })).toBe(0);
  });

  it("with no verified sender, a send step is held — never marked sent", async () => {
    const S = await withFlow([{ type: "send_message", channel: "email", subject: "Hi", body: "Hi {{first_name}}" }]);
    await advanceRun(S.ws.id, S.run.id, 0);
    const m = await db.outboundMessage.findFirstOrThrow({ where: { workspaceId: S.ws.id } });
    expect(m.status).toBe("held");
    expect(m.body).toBe("Hi Pat");
    expect(m.blockReason).toMatch(/live sending is off/);
  });

  it("overlapping executions of the same step produce one effect", async () => {
    const S = await withFlow(followUp);
    const results = await Promise.all([advanceRun(S.ws.id, S.run.id, 0), advanceRun(S.ws.id, S.run.id, 0), advanceRun(S.ws.id, S.run.id, 0)]);
    expect(results.filter((r) => r.state === "advanced")).toHaveLength(1);
    expect(await db.task.count({ where: { workspaceId: S.ws.id, workflowRunId: S.run.id } })).toBe(1);
  });

  it("the worker runs the same flow end to end through durable jobs", async () => {
    const S = await withFlow([{ type: "create_task", title: "Call {{first_name}}", dueInMinutes: 5 }, { type: "draft_message", channel: "email", subject: "", body: "Draft for {{first_name}}" }]);
    await runDueJobs(handlers);
    expect((await db.workflowRun.findFirstOrThrow({ where: { workspaceId: S.ws.id, id: S.run.id } })).status).toBe("completed");
    expect(await db.task.count({ where: { workspaceId: S.ws.id, workflowRunId: S.run.id } })).toBe(1);
    expect((await db.outboundMessage.findFirstOrThrow({ where: { workspaceId: S.ws.id } })).status).toBe("draft");
  });

  it("definitions are bounded", () => {
    expect(DefinitionSchema.safeParse({ steps: Array.from({ length: MAX_STEPS + 1 }, () => ({ type: "wait", minutes: 1 })) }).success).toBe(false);
    expect(DefinitionSchema.safeParse({ steps: [{ type: "run_shell", cmd: "x" }] }).success).toBe(false);
  });

  it("runs keep the version they started on", async () => {
    const S = await withFlow(followUp);
    await db.workflowVersion.create({ data: { workspaceId: S.ws.id, workflowId: S.wf.id, version: 2, definition: { steps: [{ type: "wait", minutes: 1 }] } } });
    await db.workflow.update({ where: { id: S.wf.id, workspaceId: S.ws.id }, data: { currentVersion: 2 } });
    expect(await advanceRun(S.ws.id, S.run.id, 0)).toEqual({ state: "advanced" });
    expect(await db.task.count({ where: { workspaceId: S.ws.id, workflowRunId: S.run.id } })).toBe(1);
  });
});
