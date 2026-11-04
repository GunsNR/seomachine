"use server";
import { requirePermission } from "@/lib/auth";
import { runAction, str, bool, back } from "@/lib/actions";
import { assignOwner, completeTask, createTask, addNote, moveStage, recordOutcome, recordPayment, createBooking, setBookingStatus, recordInbound, createProposal, reviseProposal, setProposalStatus, OutcomeKinds, type OutcomeKind, DomainError } from "@/lib/crm/ops";
import { intakeLead, parseCsv } from "@/lib/crm/intake";
import { touchFromRequest } from "@/lib/attribution";
import { parseLocalInput } from "@/lib/time";
import { parseMoney } from "@/lib/money";
import { randomToken } from "@/lib/crypto";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import type { LineItem } from "@/lib/offers";

const actor = (c: { workspace: { id: string }; userId: string; role: string }) => ({ workspaceId: c.workspace.id, userId: c.userId, role: c.role });

export async function completeTaskAction(f: FormData) {
  const ctx = await requirePermission("crm.write");
  await runAction(back(f, "/app"), async () => { await completeTask(actor(ctx), str(f, "taskId")); return "Marked done"; });
}

export async function createTaskAction(f: FormData) {
  const ctx = await requirePermission("crm.write");
  await runAction(back(f, "/app/crm"), async () => {
    const due = str(f, "dueAt");
    await createTask(actor(ctx), { contactId: str(f, "contactId") || undefined, opportunityId: str(f, "opportunityId") || undefined, title: str(f, "title"), dueAt: due ? parseLocalInput(due, ctx.workspace.timezone) : null });
    return "Follow-up added";
  });
}

export async function addNoteAction(f: FormData) {
  const ctx = await requirePermission("crm.write");
  await runAction(back(f, "/app/crm"), async () => { await addNote(actor(ctx), str(f, "contactId"), str(f, "body"), str(f, "opportunityId") || undefined); return "Note saved"; });
}

export async function moveStageAction(f: FormData) {
  const ctx = await requirePermission("crm.write");
  await runAction(back(f, "/app/crm"), async () => { await moveStage(actor(ctx), str(f, "opportunityId"), str(f, "stageId"), str(f, "lostReason")); return "Stage updated"; });
}

export async function assignOwnerAction(f: FormData) {
  const ctx = await requirePermission("crm.write");
  await runAction(back(f, "/app/crm"), async () => { await assignOwner(actor(ctx), str(f, "opportunityId"), str(f, "ownerId")); return "Owner assigned"; });
}

export async function outcomeAction(f: FormData) {
  const ctx = await requirePermission("outcome.confirm");
  await runAction(back(f, "/app/crm"), async () => {
    const kind = str(f, "kind") as OutcomeKind;
    if (!OutcomeKinds.includes(kind)) throw new DomainError("Pick an outcome.");
    const value = str(f, "value");
    await recordOutcome(actor(ctx), str(f, "opportunityId"), kind, { valueMinor: value ? parseMoney(value, ctx.workspace.currency) : undefined, currency: ctx.workspace.currency, note: str(f, "note") });
    return "Outcome recorded";
  });
}

export async function paymentAction(f: FormData) {
  const ctx = await requirePermission("outcome.confirm");
  await runAction(back(f, "/app/crm"), async () => {
    const received = str(f, "receivedAt");
    await recordPayment(actor(ctx), str(f, "opportunityId"), {
      kind: str(f, "kind") === "refund" ? "refund" : "payment",
      amountMinor: parseMoney(str(f, "amount"), ctx.workspace.currency),
      currency: ctx.workspace.currency,
      receivedAt: received ? parseLocalInput(`${received}T12:00`, ctx.workspace.timezone) : new Date(),
      note: str(f, "note"),
      idempotencyKey: str(f, "idempotencyKey") || undefined,
    });
    return str(f, "kind") === "refund" ? "Refund recorded" : "Payment recorded";
  });
}

export async function bookingAction(f: FormData) {
  const ctx = await requirePermission("crm.write");
  await runAction(back(f, "/app/crm"), async () => {
    await createBooking(actor(ctx), { contactId: str(f, "contactId"), opportunityId: str(f, "opportunityId") || undefined, title: str(f, "title"), startsAt: parseLocalInput(str(f, "startsAt"), ctx.workspace.timezone), durationMin: Number(str(f, "duration") || 60), timezone: ctx.workspace.timezone });
    return "Booking recorded (manual — not a calendar reservation)";
  });
}

export async function bookingStatusAction(f: FormData) {
  const ctx = await requirePermission("crm.write");
  await runAction(back(f, "/app/crm"), async () => {
    const s = str(f, "status") as "rescheduled" | "cancelled" | "completed" | "no_show";
    const when = str(f, "startsAt");
    await setBookingStatus(actor(ctx), str(f, "bookingId"), s, when ? parseLocalInput(when, ctx.workspace.timezone) : undefined);
    return "Booking updated";
  });
}

export async function inboundAction(f: FormData) {
  const ctx = await requirePermission("crm.write");
  await runAction(back(f, "/app/crm"), async () => {
    const kind = str(f, "kind") === "opt_out" ? "opt_out" : "reply";
    await recordInbound(actor(ctx), str(f, "contactId"), kind, str(f, "body"));
    return kind === "opt_out" ? "Opt-out recorded. Follow-ups stopped and the address is suppressed." : "Reply logged. Automated follow-ups stopped.";
  });
}

export async function takeoverAction(f: FormData) {
  const ctx = await requirePermission("crm.write");
  await runAction(back(f, "/app/crm"), async () => {
    const on = bool(f, "on");
    const id = str(f, "contactId");
    await db.contact.update({ where: { id, workspaceId: ctx.workspace.id }, data: { manualTakeover: on } });
    if (on) {
      const { stopRunsFor } = await import("@/lib/workflows/engine");
      await stopRunsFor(ctx.workspace.id, { contactId: id }, "manual_takeover");
    }
    await audit(ctx.workspace.id, ctx.userId, on ? "contact.takeover" : "contact.release", "contact", id);
    return on ? "You've taken over. Automations for this contact are stopped." : "Automations may run again for new triggers.";
  });
}

export async function manualLeadAction(f: FormData) {
  const ctx = await requirePermission("crm.write");
  await runAction("/app/crm/new", async () => {
    const r = await intakeLead({
      workspaceId: ctx.workspace.id, formKey: "manual", idempotencyKey: str(f, "idempotencyKey") || randomToken(12), channel: "manual", actorId: ctx.userId,
      input: { firstName: str(f, "firstName"), lastName: str(f, "lastName"), email: str(f, "email"), phone: str(f, "phone"), service: str(f, "service"), message: str(f, "message"), consentEmail: bool(f, "consentEmail"), consentWording: bool(f, "consentEmail") ? "Verbal consent recorded by staff" : "" },
      touch: { ...touchFromRequest({}), source: str(f, "source") || "unknown", medium: str(f, "medium") || "unknown", campaign: str(f, "campaign") },
    });
    if (r.outcome === "rejected") throw new DomainError(r.reason ?? "Couldn't add that lead.");
    return { to: `/app/crm/contacts/${r.contactId}`, ok: r.outcome === "created_opportunity" ? "Lead added" : "That person already had this inquiry open — nothing was duplicated." };
  });
}

export async function importCsvAction(f: FormData) {
  const ctx = await requirePermission("crm.write");
  await runAction("/app/crm/new", async () => {
    const file = f.get("file");
    if (!(file instanceof File) || file.size === 0) throw new DomainError("Choose a CSV file.");
    if (file.size > 2_000_000) throw new DomainError("That file is over 2 MB. Split it into smaller files.");
    if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") throw new DomainError("Only .csv files can be imported.");
    const rows = parseCsv(await file.text()).slice(0, 2000);
    const tally = { created: 0, existing: 0, rejected: 0 };
    const batch = randomToken(6);
    for (const [i, r] of rows.entries()) {
      const res = await intakeLead({
        workspaceId: ctx.workspace.id, formKey: "import", idempotencyKey: `import:${batch}:${i}`, channel: "import", actorId: ctx.userId,
        input: { firstName: r.first_name ?? r.firstname ?? "", lastName: r.last_name ?? r.lastname ?? "", email: r.email ?? "", phone: r.phone ?? "", service: r.service ?? "", message: r.notes ?? r.message ?? "" },
        touch: { ...touchFromRequest({}), source: r.source || "import", medium: r.medium || "unknown", campaign: r.campaign ?? "" },
      });
      if (res.outcome === "created_opportunity") tally.created++;
      else if (res.outcome === "rejected") tally.rejected++;
      else tally.existing++;
    }
    return `Imported ${rows.length} rows: ${tally.created} new, ${tally.existing} already known, ${tally.rejected} skipped (no email or phone).`;
  });
}

function itemsFromForm(f: FormData, currency: string): LineItem[] {
  const out: LineItem[] = [];
  for (let i = 0; i < 6; i++) {
    const kind = str(f, `li${i}_kind`);
    const label = str(f, `li${i}_label`);
    if (!kind || !label) continue;
    const amt = str(f, `li${i}_amount`);
    if (kind === "retainer") out.push({ kind, label, amountMinor: parseMoney(amt || "0", currency), interval: str(f, `li${i}_interval`) === "quarter" ? "quarter" : "month", termMonths: Number(str(f, `li${i}_term`) || 6) });
    else if (kind === "one_time") out.push({ kind, label, amountMinor: parseMoney(amt || "0", currency) });
    else if (kind === "performance") {
      const cap = str(f, `li${i}_cap`);
      const win = str(f, `li${i}_window`);
      out.push({
        kind, label, unitAmountMinor: parseMoney(amt || "0", currency), unit: str(f, `li${i}_unit`) || "unit",
        terms: { metric: str(f, `li${i}_metric`) || undefined, baseline: str(f, `li${i}_baseline`) || undefined, source: str(f, `li${i}_source`) || undefined, attributionWindowDays: win ? Number(win) : undefined, capMinor: cap ? parseMoney(cap, currency) : undefined, exclusions: str(f, `li${i}_exclusions`) || undefined, approvalRule: str(f, `li${i}_approval`) || undefined },
      });
    }
  }
  return out;
}

export async function proposalCreateAction(f: FormData) {
  const ctx = await requirePermission("crm.write");
  await runAction(back(f, "/app/crm"), async () => {
    const p = await createProposal(actor(ctx), str(f, "opportunityId"), { title: str(f, "title") || "Proposal", scope: "", deliverables: [], lineItems: [], currency: ctx.workspace.currency });
    return { to: `/app/crm/proposals/${p.id}`, ok: "Draft proposal created" };
  });
}

export async function proposalSaveAction(f: FormData) {
  const ctx = await requirePermission("crm.write");
  const id = str(f, "proposalId");
  await runAction(`/app/crm/proposals/${id}`, async () => {
    await reviseProposal(actor(ctx), id, { scope: str(f, "scope"), deliverables: str(f, "deliverables").split("\n").map((s) => s.trim()).filter(Boolean), lineItems: itemsFromForm(f, ctx.workspace.currency), currency: ctx.workspace.currency });
    return "Saved as a new version";
  });
}

export async function proposalStatusAction(f: FormData) {
  const ctx = await requirePermission("crm.write");
  const id = str(f, "proposalId");
  await runAction(`/app/crm/proposals/${id}`, async () => {
    const s = str(f, "status") as "sent" | "accepted" | "declined" | "expired";
    await setProposalStatus(actor(ctx), id, s);
    return s === "sent" ? "Marked as sent. Send the exported document yourself — nothing was emailed." : `Marked ${s}`;
  });
}
