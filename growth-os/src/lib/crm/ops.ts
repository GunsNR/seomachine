import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { parseStages } from "./pipelines";
import { audit } from "../audit";
import { fireTrigger, stopRunsFor } from "../workflows/engine";
import { LineItemSchema, sendBlockers, type LineItem } from "../offers";
import { z } from "zod";

type Actor = { workspaceId: string; userId: string; role: string };

export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}

async function oppOrThrow(workspaceId: string, id: string) {
  const o = await db.opportunity.findFirst({ where: { workspaceId, id }, include: { pipeline: true } });
  if (!o) throw new DomainError("That opportunity doesn't exist in this workspace.");
  return o;
}

/** Move to a stage. A won/lost stage closes the opportunity; it does NOT record any payment. */
export async function moveStage(a: Actor, opportunityId: string, stageId: string, lostReason = "") {
  const o = await oppOrThrow(a.workspaceId, opportunityId);
  const stage = parseStages(o.pipeline.stages).find((s) => s.id === stageId);
  if (!stage) throw new DomainError("That stage isn't part of this pipeline.");
  if (o.stageId === stageId) return o;
  const status = stage.type === "open" ? "open" : stage.type;
  if (status === "lost" && !lostReason.trim()) throw new DomainError("Add a short reason before marking this lost.");
  const now = new Date();
  const updated = await db.opportunity.update({
    where: { id: o.id, workspaceId: a.workspaceId },
    data: {
      stageId, status, lastActivityAt: now,
      wonAt: status === "won" ? now : status === "open" ? null : o.wonAt,
      closedAt: status === "open" ? null : now,
      lostReason: status === "lost" ? lostReason.trim() : "",
    },
  });
  await db.activity.create({ data: { workspaceId: a.workspaceId, contactId: o.contactId, opportunityId: o.id, kind: "stage_changed", body: `Moved to ${stage.name}`, meta: { from: o.stageId, to: stageId }, actorId: a.userId } });
  if (status !== "open") {
    await stopRunsFor(a.workspaceId, { opportunityId: o.id }, status === "won" ? "opportunity_won" : "opportunity_lost");
    if (status === "won") await db.contact.update({ where: { id: o.contactId, workspaceId: a.workspaceId }, data: { lifecycle: "customer" } });
  }
  await fireTrigger(a.workspaceId, "stage_changed", { contactId: o.contactId, opportunityId: o.id, stageId }, `stage:${o.id}:${stageId}:${now.getTime()}`);
  await audit(a.workspaceId, a.userId, "opportunity.stage", "opportunity", o.id, { from: o.stageId, to: stageId });
  return updated;
}

export const OutcomeKinds = ["qualified", "unqualified", "appointment", "won", "lost", "job_value"] as const;
export type OutcomeKind = (typeof OutcomeKinds)[number];

/** Record an outcome with who said so. Client confirmations are marked separately from agency entries. */
export async function recordOutcome(a: Actor, opportunityId: string, kind: OutcomeKind, opts: { valueMinor?: number; currency?: string; note?: string } = {}) {
  const o = await oppOrThrow(a.workspaceId, opportunityId);
  const source = a.role === "client" ? "client_manual" : "agency_manual";
  if (kind === "job_value" && (opts.valueMinor === undefined || opts.valueMinor < 0)) throw new DomainError("Enter the job value.");
  const ev = await db.outcomeEvent.create({
    data: { workspaceId: a.workspaceId, opportunityId: o.id, kind, valueMinor: opts.valueMinor, currency: opts.valueMinor !== undefined ? (opts.currency ?? o.currency) : null, note: opts.note ?? "", source, confirmedById: a.userId, confirmedRole: a.role },
  });
  const data: Prisma.OpportunityUpdateInput = { lastActivityAt: new Date() };
  if (kind === "qualified" || kind === "unqualified") data.qualification = kind;
  if (kind === "job_value") data.estimatedValueMinor = opts.valueMinor;
  await db.opportunity.update({ where: { id: o.id, workspaceId: a.workspaceId }, data });
  if (kind === "unqualified") await stopRunsFor(a.workspaceId, { opportunityId: o.id }, "disqualified");
  if (kind === "won" || kind === "lost") {
    const stage = parseStages(o.pipeline.stages).find((s) => s.type === kind);
    if (stage && o.stageId !== stage.id) await moveStage(a, o.id, stage.id, kind === "lost" ? opts.note || "Confirmed lost" : "");
  }
  await db.activity.create({ data: { workspaceId: a.workspaceId, contactId: o.contactId, opportunityId: o.id, kind: "outcome", body: `${kind.replace("_", " ")} confirmed`, meta: { source, valueMinor: opts.valueMinor ?? null }, actorId: a.userId, actorType: a.role === "client" ? "client" : "user" } });
  return ev;
}

/**
 * Record money received or refunded. A provider event id makes replays count
 * once. A won opportunity never implies payment — this is the only place
 * collections come from.
 */
export async function recordPayment(
  a: Actor,
  opportunityId: string,
  p: { kind: "payment" | "refund"; amountMinor: number; currency: string; receivedAt: Date; providerEventId?: string; idempotencyKey?: string; note?: string; source?: "provider" },
) {
  if (!Number.isSafeInteger(p.amountMinor) || p.amountMinor <= 0) throw new DomainError("Enter an amount greater than zero.");
  const o = await oppOrThrow(a.workspaceId, opportunityId);
  if (p.providerEventId) {
    const dup = await db.payment.findUnique({ where: { workspaceId_providerEventId: { workspaceId: a.workspaceId, providerEventId: p.providerEventId } } });
    if (dup) return { payment: dup, duplicate: true };
  }
  if (p.idempotencyKey) {
    const dup = await db.payment.findUnique({ where: { workspaceId_idempotencyKey: { workspaceId: a.workspaceId, idempotencyKey: p.idempotencyKey } } });
    if (dup) return { payment: dup, duplicate: true };
  }
  const source = p.source ?? (a.role === "client" ? "client_manual" : "agency_manual");
  try {
    const payment = await db.payment.create({
      data: { workspaceId: a.workspaceId, opportunityId: o.id, kind: p.kind, amountMinor: p.amountMinor, currency: p.currency.toUpperCase(), receivedAt: p.receivedAt, source, providerEventId: p.providerEventId, idempotencyKey: p.idempotencyKey, confirmedById: source === "provider" ? null : a.userId, confirmedRole: source === "provider" ? "" : a.role, note: p.note ?? "" },
    });
    await db.activity.create({ data: { workspaceId: a.workspaceId, contactId: o.contactId, opportunityId: o.id, kind: p.kind === "payment" ? "payment_recorded" : "refund_recorded", body: "", meta: { amountMinor: p.amountMinor, currency: p.currency, source }, actorId: a.userId, actorType: a.role === "client" ? "client" : "user" } });
    return { payment, duplicate: false };
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      const dup = p.providerEventId
        ? await db.payment.findUnique({ where: { workspaceId_providerEventId: { workspaceId: a.workspaceId, providerEventId: p.providerEventId } } })
        : p.idempotencyKey ? await db.payment.findUnique({ where: { workspaceId_idempotencyKey: { workspaceId: a.workspaceId, idempotencyKey: p.idempotencyKey } } }) : null;
      if (dup) return { payment: dup, duplicate: true };
    }
    throw e;
  }
}

/** Net collections per currency in a period: payments minus refunds. */
export async function netCollections(workspaceId: string, from: Date, to: Date): Promise<Record<string, { gross: number; refunds: number; net: number }>> {
  const rows = await db.payment.findMany({ where: { workspaceId, receivedAt: { gte: from, lt: to } } });
  const out: Record<string, { gross: number; refunds: number; net: number }> = {};
  for (const r of rows) {
    const b = (out[r.currency] ??= { gross: 0, refunds: 0, net: 0 });
    if (r.kind === "payment") b.gross += r.amountMinor;
    else b.refunds += r.amountMinor;
    b.net = b.gross - b.refunds;
  }
  return out;
}

export async function addNote(a: Actor, contactId: string, body: string, opportunityId?: string) {
  const c = await db.contact.findFirst({ where: { workspaceId: a.workspaceId, id: contactId } });
  if (!c) throw new DomainError("That contact doesn't exist in this workspace.");
  if (!body.trim()) throw new DomainError("Write something first.");
  return db.activity.create({ data: { workspaceId: a.workspaceId, contactId, opportunityId: opportunityId ?? null, kind: "note", body: body.trim().slice(0, 4000), actorId: a.userId } });
}

export async function createTask(a: Actor, t: { contactId?: string; opportunityId?: string; title: string; dueAt: Date | null }) {
  if (!t.title.trim()) throw new DomainError("Give the task a title.");
  if (t.contactId && !(await db.contact.findFirst({ where: { workspaceId: a.workspaceId, id: t.contactId } }))) throw new DomainError("Unknown contact.");
  const task = await db.task.create({ data: { workspaceId: a.workspaceId, contactId: t.contactId, opportunityId: t.opportunityId, title: t.title.trim().slice(0, 200), dueAt: t.dueAt, assigneeId: a.userId } });
  if (t.contactId) {
    await db.contact.update({ where: { id: t.contactId, workspaceId: a.workspaceId }, data: { nextAction: task.title, nextActionAt: t.dueAt } });
    await db.activity.create({ data: { workspaceId: a.workspaceId, contactId: t.contactId, opportunityId: t.opportunityId, kind: "task_created", body: task.title, actorId: a.userId } });
  }
  return task;
}

export async function completeTask(a: Actor, taskId: string) {
  const t = await db.task.findFirst({ where: { workspaceId: a.workspaceId, id: taskId } });
  if (!t) throw new DomainError("Unknown task.");
  await db.task.update({ where: { id: t.id, workspaceId: a.workspaceId }, data: { status: "done", completedAt: new Date() } });
  if (t.contactId) {
    const next = await db.task.findFirst({ where: { workspaceId: a.workspaceId, contactId: t.contactId, status: "open" }, orderBy: { dueAt: "asc" } });
    await db.contact.update({ where: { id: t.contactId, workspaceId: a.workspaceId }, data: { nextAction: next?.title ?? "", nextActionAt: next?.dueAt ?? null } });
    await db.activity.create({ data: { workspaceId: a.workspaceId, contactId: t.contactId, opportunityId: t.opportunityId, kind: "task_done", body: t.title, actorId: a.userId } });
  }
}

/** Manual booking. It is a record someone typed in, not a verified calendar reservation. */
export async function createBooking(a: Actor, b: { contactId: string; opportunityId?: string; title: string; startsAt: Date; durationMin: number; timezone: string }) {
  const c = await db.contact.findFirst({ where: { workspaceId: a.workspaceId, id: b.contactId } });
  if (!c) throw new DomainError("Unknown contact.");
  const booking = await db.booking.create({
    data: { workspaceId: a.workspaceId, contactId: c.id, opportunityId: b.opportunityId, title: b.title || "Appointment", startsAt: b.startsAt, endsAt: new Date(b.startsAt.getTime() + b.durationMin * 60000), timezone: b.timezone, source: "manual", verified: false, createdById: a.userId },
  });
  await db.activity.create({ data: { workspaceId: a.workspaceId, contactId: c.id, opportunityId: b.opportunityId, kind: "booking_recorded", body: booking.title, meta: { startsAt: b.startsAt.toISOString(), verified: false }, actorId: a.userId } });
  await stopRunsFor(a.workspaceId, { contactId: c.id }, "booking");
  await fireTrigger(a.workspaceId, "booking_created", { contactId: c.id, opportunityId: b.opportunityId ?? null }, `booking:${booking.id}`);
  return booking;
}

export async function setBookingStatus(a: Actor, bookingId: string, status: "rescheduled" | "cancelled" | "completed" | "no_show", startsAt?: Date) {
  const b = await db.booking.findFirst({ where: { workspaceId: a.workspaceId, id: bookingId } });
  if (!b) throw new DomainError("Unknown booking.");
  const dur = b.endsAt.getTime() - b.startsAt.getTime();
  await db.booking.update({ where: { id: b.id, workspaceId: a.workspaceId }, data: { status, ...(startsAt ? { startsAt, endsAt: new Date(startsAt.getTime() + dur) } : {}) } });
  await db.activity.create({ data: { workspaceId: a.workspaceId, contactId: b.contactId, opportunityId: b.opportunityId, kind: "booking_" + status, body: b.title, actorId: a.userId } });
}

/** Inbound reply or opt-out. Both stop follow-ups; an opt-out also suppresses the address. */
export async function recordInbound(a: Actor, contactId: string, kind: "reply" | "opt_out", body = "") {
  const c = await db.contact.findFirst({ where: { workspaceId: a.workspaceId, id: contactId } });
  if (!c) throw new DomainError("Unknown contact.");
  await db.activity.create({ data: { workspaceId: a.workspaceId, contactId, kind: kind === "reply" ? "reply_received" : "opted_out", body, actorId: a.userId } });
  if (kind === "opt_out") {
    await db.consentEvent.create({ data: { workspaceId: a.workspaceId, contactId, channel: "email", status: "revoked", source: "reply", recordedBy: a.userId } });
    if (c.emailNormalized) {
      await db.suppression.upsert({
        where: { workspaceId_channel_value: { workspaceId: a.workspaceId, channel: "email", value: c.emailNormalized } },
        create: { workspaceId: a.workspaceId, channel: "email", value: c.emailNormalized, reason: "opt_out" },
        update: {},
      });
    }
  }
  await stopRunsFor(a.workspaceId, { contactId }, kind === "reply" ? "reply" : "opt_out");
}

// ─── Proposals ─────────────────────────────────────────────────────────────

export async function createProposal(a: Actor, opportunityId: string, v: { title: string; scope: string; deliverables: string[]; lineItems: LineItem[]; currency: string }) {
  const o = await oppOrThrow(a.workspaceId, opportunityId);
  const items = z.array(LineItemSchema).parse(v.lineItems);
  return db.proposal.create({
    data: {
      workspaceId: a.workspaceId, opportunityId: o.id, title: v.title, currentVersion: 1,
      versions: { create: { workspaceId: a.workspaceId, version: 1, scope: v.scope, deliverables: v.deliverables, lineItems: items, currency: v.currency, createdById: a.userId } },
    },
    include: { versions: true },
  });
}

/** New version of a draft proposal. A sent/accepted proposal is immutable: revise by creating a new draft version after marking it declined/expired. */
export async function reviseProposal(a: Actor, proposalId: string, v: { scope: string; deliverables: string[]; lineItems: LineItem[]; currency: string }) {
  const p = await db.proposal.findFirst({ where: { workspaceId: a.workspaceId, id: proposalId } });
  if (!p) throw new DomainError("Unknown proposal.");
  if (p.status !== "draft") throw new DomainError("This proposal was already sent. Its sent version is kept as-is; duplicate it to revise.");
  const items = z.array(LineItemSchema).parse(v.lineItems);
  const version = p.currentVersion + 1;
  await db.proposalVersion.create({ data: { workspaceId: a.workspaceId, proposalId: p.id, version, scope: v.scope, deliverables: v.deliverables, lineItems: items, currency: v.currency, createdById: a.userId } });
  return db.proposal.update({ where: { id: p.id, workspaceId: a.workspaceId }, data: { currentVersion: version } });
}

export async function setProposalStatus(a: Actor, proposalId: string, status: "sent" | "accepted" | "declined" | "expired") {
  const p = await db.proposal.findFirst({ where: { workspaceId: a.workspaceId, id: proposalId }, include: { versions: true } });
  if (!p) throw new DomainError("Unknown proposal.");
  if (status === "sent") {
    const cur = p.versions.find((x) => x.version === p.currentVersion);
    const blockers = sendBlockers(z.array(LineItemSchema).parse(cur?.lineItems ?? []));
    if (blockers.length) throw new DomainError(blockers.join(" "));
  }
  const now = new Date();
  await db.proposal.update({ where: { id: p.id, workspaceId: a.workspaceId }, data: { status, ...(status === "sent" ? { sentAt: now } : { respondedAt: now }) } });
  const o = await oppOrThrow(a.workspaceId, p.opportunityId);
  await db.activity.create({ data: { workspaceId: a.workspaceId, contactId: o.contactId, opportunityId: o.id, kind: `proposal_${status}`, body: `${p.title} (v${p.currentVersion})`, actorId: a.userId } });
}
