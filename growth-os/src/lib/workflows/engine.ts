import type { Prisma } from "@prisma/client";
import { db, systemDb } from "../db";
import { enqueue } from "../jobs/queue";
import { DefinitionSchema, MAX_EXECUTIONS_PER_RUN, renderTemplate, type StopRule, type Trigger } from "./definition";
import { parseStages } from "../crm/pipelines";
import { displayName } from "../normalize";

type Subject = { contactId: string; opportunityId?: string | null; stageId?: string };

/** Start a run for every enabled workflow on this trigger. Idempotent per (workflow, triggerKey). */
export async function fireTrigger(workspaceId: string, trigger: Trigger, subject: Subject, triggerKey: string): Promise<string[]> {
  const flows = await db.workflow.findMany({ where: { workspaceId, trigger, enabled: true }, include: { versions: true } });
  const started: string[] = [];
  for (const f of flows) {
    const v = f.versions.find((x) => x.version === f.currentVersion);
    if (!v) continue;
    const def = DefinitionSchema.safeParse(v.definition);
    if (!def.success) continue;
    if (def.data.filter.stageIds?.length && subject.stageId && !def.data.filter.stageIds.includes(subject.stageId)) continue;
    const idempotencyKey = `${f.id}:${triggerKey}`;
    const existing = await db.workflowRun.findUnique({ where: { workspaceId_idempotencyKey: { workspaceId, idempotencyKey } } });
    if (existing) continue;
    try {
      const run = await db.workflowRun.create({
        data: { workspaceId, workflowVersionId: v.id, contactId: subject.contactId, opportunityId: subject.opportunityId ?? null, idempotencyKey, status: "running", nextStepAt: new Date() },
      });
      await enqueue("workflow.step", workspaceId, { runId: run.id, stepIndex: 0 }, { idempotencyKey: `wfstep:${run.id}:0` });
      started.push(run.id);
    } catch (e) {
      if ((e as { code?: string }).code !== "P2002") throw e;
    }
  }
  return started;
}

/** Stop active runs for a contact/opportunity. Called on reply, opt-out, booking, disqualification, close. */
export async function stopRunsFor(workspaceId: string, s: { contactId?: string; opportunityId?: string }, reason: StopRule | "opportunity_won" | "opportunity_lost" | "workspace_paused" | "manual"): Promise<number> {
  const where: Prisma.WorkflowRunWhereInput = { workspaceId, status: { in: ["running", "waiting"] } };
  if (s.opportunityId) where.opportunityId = s.opportunityId;
  else if (s.contactId) where.contactId = s.contactId;
  else return 0;
  const runs = await db.workflowRun.findMany({ where });
  let n = 0;
  for (const r of runs) {
    const v = await db.workflowVersion.findFirst({ where: { workspaceId, id: r.workflowVersionId } });
    const def = DefinitionSchema.safeParse(v?.definition);
    const rule = reason === "opportunity_won" || reason === "opportunity_lost" ? "closed" : reason;
    if (def.success && (STOP_ALWAYS.has(rule) || def.data.stopOn.includes(rule as StopRule))) {
      await db.workflowRun.update({ where: { id: r.id, workspaceId }, data: { status: "stopped", stopReason: reason } });
      n++;
    }
  }
  return n;
}
// Opt-out and manual stops cannot be configured away.
const STOP_ALWAYS = new Set<string>(["opt_out", "manual", "manual_takeover"]);

/**
 * Evaluated immediately before every step executes — not only at enqueue — so
 * an opt-out, reply, booking or close that happened while a run was waiting
 * takes effect before anything is created or sent.
 */
export async function stopReasonNow(workspaceId: string, run: { contactId: string | null; opportunityId: string | null; createdAt: Date }, stopOn: StopRule[]): Promise<string | null> {
  if (!run.contactId) return "missing_contact";
  const contact = await db.contact.findFirst({ where: { workspaceId, id: run.contactId } });
  if (!contact) return "missing_contact";
  if (contact.manualTakeover) return "manual_takeover";
  if (contact.emailNormalized) {
    const sup = await db.suppression.findFirst({ where: { workspaceId, channel: "email", value: contact.emailNormalized } });
    if (sup) return "opt_out";
  }
  const lastConsent = await db.consentEvent.findFirst({ where: { workspaceId, contactId: contact.id, channel: "email" }, orderBy: { createdAt: "desc" } });
  if (lastConsent?.status === "revoked") return "opt_out";
  const since = { gte: run.createdAt };
  if (stopOn.includes("reply") && (await db.activity.findFirst({ where: { workspaceId, contactId: contact.id, kind: "reply_received", createdAt: since } }))) return "reply";
  if (stopOn.includes("booking") && (await db.booking.findFirst({ where: { workspaceId, contactId: contact.id, createdAt: since, status: { not: "cancelled" } } }))) return "booking";
  if (run.opportunityId) {
    const o = await db.opportunity.findFirst({ where: { workspaceId, id: run.opportunityId } });
    if (!o) return "missing_opportunity";
    if (stopOn.includes("closed") && o.status !== "open") return o.status === "won" ? "opportunity_won" : "opportunity_lost";
    if (stopOn.includes("disqualified") && o.qualification === "unqualified") return "disqualified";
  }
  return null;
}

export const PAUSE_RECHECK_MS = 15 * 60 * 1000;

/**
 * Execute one step of a run. Safe to call twice for the same step: the step
 * index is advanced with compare-and-set, and every effect carries an
 * idempotency key derived from (run, step).
 */
export async function advanceRun(workspaceId: string, runId: string, stepIndex: number): Promise<{ state: string; detail?: string }> {
  const ws = await systemDb.workspace.findUnique({ where: { id: workspaceId } });
  if (!ws) return { state: "missing_workspace" };
  const run = await db.workflowRun.findFirst({ where: { workspaceId, id: runId } });
  if (!run) return { state: "missing_run" };
  if (run.status !== "running" && run.status !== "waiting") return { state: "inactive", detail: run.status };
  if (run.stepIndex !== stepIndex) return { state: "already_advanced" };
  if (ws.pausedAt) {
    await enqueue("workflow.step", workspaceId, { runId, stepIndex }, { runAfter: new Date(Date.now() + PAUSE_RECHECK_MS), idempotencyKey: `wfstep:${runId}:${stepIndex}:pause:${Math.floor(Date.now() / PAUSE_RECHECK_MS)}` });
    return { state: "paused" };
  }
  const version = await db.workflowVersion.findFirst({ where: { workspaceId, id: run.workflowVersionId } });
  const def = DefinitionSchema.parse(version?.definition);
  const stop = await stopReasonNow(workspaceId, run, def.stopOn);
  if (stop) {
    await db.workflowRun.update({ where: { id: run.id, workspaceId }, data: { status: "stopped", stopReason: stop } });
    return { state: "stopped", detail: stop };
  }
  if (run.stepsExecuted >= MAX_EXECUTIONS_PER_RUN) {
    await db.workflowRun.update({ where: { id: run.id, workspaceId }, data: { status: "failed", stopReason: "step_limit" } });
    return { state: "failed", detail: "step_limit" };
  }
  const step = def.steps[stepIndex];
  if (!step) {
    await db.workflowRun.update({ where: { id: run.id, workspaceId }, data: { status: "completed" } });
    return { state: "completed" };
  }

  // Claim the step: only one concurrent executor can move stepIndex from N to N+1.
  const claimed = await db.workflowRun.updateMany({ where: { workspaceId, id: run.id, stepIndex }, data: { stepIndex: stepIndex + 1, stepsExecuted: { increment: 1 }, status: "running" } });
  if (claimed.count === 0) return { state: "already_advanced" };

  const contact = await db.contact.findFirst({ where: { workspaceId, id: run.contactId! } });
  const vars = { first_name: contact?.firstName ?? "", full_name: contact ? displayName(contact) : "", business: ws.name };
  const key = `run:${run.id}:step:${stepIndex}`;
  let nextAt = new Date();

  switch (step.type) {
    case "wait":
      nextAt = new Date(Date.now() + step.minutes * 60000);
      await db.workflowRun.update({ where: { id: run.id, workspaceId }, data: { status: "waiting", nextStepAt: nextAt } });
      break;
    case "create_task":
      await db.task.upsert({
        where: { workspaceId_idempotencyKey: { workspaceId, idempotencyKey: key } },
        create: { workspaceId, contactId: run.contactId, opportunityId: run.opportunityId, title: renderTemplate(step.title, vars), dueAt: new Date(Date.now() + step.dueInMinutes * 60000), workflowRunId: run.id, idempotencyKey: key },
        update: {},
      });
      break;
    case "draft_message":
    case "send_message": {
      const msg = await db.outboundMessage.upsert({
        where: { workspaceId_idempotencyKey: { workspaceId, idempotencyKey: key } },
        create: { workspaceId, contactId: run.contactId!, opportunityId: run.opportunityId, workflowRunId: run.id, channel: step.channel, subject: renderTemplate(step.subject, vars), body: renderTemplate(step.body, vars), status: step.type === "draft_message" ? "draft" : "queued", idempotencyKey: key },
        update: {},
      });
      if (step.type === "send_message") await dispatchMessage(workspaceId, msg.id);
      break;
    }
    case "require_stage": {
      if (run.opportunityId) {
        const o = await db.opportunity.findFirst({ where: { workspaceId, id: run.opportunityId }, include: { pipeline: true } });
        const st = o ? parseStages(o.pipeline.stages).find((s) => s.id === o.stageId) : undefined;
        if (!st || !step.stageTypes.includes(st.type)) {
          await db.workflowRun.update({ where: { id: run.id, workspaceId }, data: { status: "stopped", stopReason: "stage_condition" } });
          return { state: "stopped", detail: "stage_condition" };
        }
      }
      break;
    }
    case "assign_owner": {
      const m = await systemDb.membership.findUnique({ where: { userId_workspaceId: { userId: step.userId, workspaceId } } });
      if (m && !m.revokedAt && run.opportunityId) await db.opportunity.update({ where: { id: run.opportunityId, workspaceId }, data: { ownerId: step.userId } });
      break;
    }
  }

  if (stepIndex + 1 >= def.steps.length) {
    await db.workflowRun.updateMany({ where: { workspaceId, id: run.id, status: { in: ["running", "waiting"] } }, data: { status: "completed" } });
    return { state: "completed" };
  }
  await enqueue("workflow.step", workspaceId, { runId: run.id, stepIndex: stepIndex + 1 }, { runAfter: nextAt, idempotencyKey: `wfstep:${run.id}:${stepIndex + 1}` });
  return { state: step.type === "wait" ? "waiting" : "advanced" };
}

export function liveSendingEnabled(): boolean {
  return process.env.LIVE_SENDING_ENABLED === "true";
}

/**
 * Final gate for any outbound message. Re-checks pause, suppression, consent
 * and the run's stop rules at the moment of dispatch. With no verified sender
 * the message is held with a plain reason — it is never marked sent.
 */
export async function dispatchMessage(workspaceId: string, messageId: string): Promise<{ status: string; reason: string }> {
  const ws = await systemDb.workspace.findUnique({ where: { id: workspaceId } });
  const msg = await db.outboundMessage.findFirst({ where: { workspaceId, id: messageId } });
  if (!ws || !msg) return { status: "failed", reason: "missing" };
  if (msg.status === "sent" || msg.status === "held" || msg.status === "blocked") return { status: msg.status, reason: msg.blockReason };
  const block = async (status: "blocked" | "held", reason: string) => {
    await db.outboundMessage.update({ where: { id: msg.id, workspaceId }, data: { status, blockReason: reason } });
    return { status, reason };
  };
  if (ws.pausedAt) return block("held", "Workspace is paused. Resume it in Settings to continue.");
  const contact = await db.contact.findFirst({ where: { workspaceId, id: msg.contactId } });
  if (!contact) return block("blocked", "Contact no longer exists.");
  if (msg.channel === "email") {
    if (!contact.emailNormalized) return block("blocked", "Contact has no email address.");
    if (await db.suppression.findFirst({ where: { workspaceId, channel: "email", value: contact.emailNormalized } })) return block("blocked", "This address opted out or is suppressed.");
    const consent = await db.consentEvent.findFirst({ where: { workspaceId, contactId: contact.id, channel: "email" }, orderBy: { createdAt: "desc" } });
    if (consent?.status === "revoked") return block("blocked", "Email consent was withdrawn.");
  }
  if (msg.workflowRunId) {
    const run = await db.workflowRun.findFirst({ where: { workspaceId, id: msg.workflowRunId } });
    if (run && run.status === "stopped") return block("blocked", `Follow-up stopped: ${run.stopReason.replace(/_/g, " ")}.`);
  }
  const provider = await db.integration.findFirst({ where: { workspaceId, provider: msg.channel === "email" ? "email_sender" : "sms_sender", status: "connected" } });
  if (!liveSendingEnabled() || !provider) {
    return block("held", "Not sent: live sending is off and no verified sender is connected. Copy the draft and send it yourself, or finish sender setup in Settings.");
  }
  // A verified provider adapter would be called here. None is live-verified in this MVP.
  return block("held", "Sender adapter not implemented in this build.");
}
