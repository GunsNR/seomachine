import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { normalizeEmail, normalizePhone, displayName } from "../normalize";
import { sha256 } from "../crypto";
import { parseStages } from "./pipelines";
import type { Touch } from "../attribution";
import { fireTrigger } from "../workflows/engine";

export const LeadInputSchema = z.object({
  firstName: z.string().trim().max(80).default(""),
  lastName: z.string().trim().max(80).default(""),
  email: z.string().trim().max(254).default(""),
  phone: z.string().trim().max(40).default(""),
  service: z.string().trim().max(120).default(""),
  message: z.string().trim().max(4000).default(""),
  consentEmail: z.boolean().default(false),
  consentWording: z.string().max(500).default(""),
});
export type LeadInput = z.input<typeof LeadInputSchema>;

export type IntakeResult = {
  outcome: "created_opportunity" | "attached_existing" | "duplicate" | "rejected";
  submissionId?: string;
  contactId?: string;
  opportunityId?: string;
  reason?: string;
  phoneMatchHint?: string[]; // other contacts sharing the phone — for a human to review
};

/** Window in which an identical message from the same person to the same form is a resubmission, not a new job. */
export const RESUBMIT_WINDOW_MS = 24 * 60 * 60 * 1000;

function messageFingerprint(i: z.infer<typeof LeadInputSchema>): string {
  return sha256(`${i.service.toLowerCase()}|${i.message.toLowerCase().replace(/\s+/g, " ").trim()}`);
}

/**
 * Lead intake: form, manual entry, CSV row, or verified inbound integration.
 *
 * Exactly-one-effect rules (REQ-CRM-02):
 *  1. Same idempotency key → the stored outcome is returned; nothing new is written.
 *  2. Same person + same form + same message within 24h → logged on the existing
 *     open opportunity; no new opportunity, no new task, no new workflow run.
 *  3. Anything else from a known person → a new opportunity on the same contact.
 *  Contacts dedupe on normalized email only; a shared phone is returned as a hint.
 */
export async function intakeLead(args: {
  workspaceId: string;
  formKey: string;
  idempotencyKey: string;
  input: LeadInput;
  touch: Touch;
  channel: "form" | "manual" | "import" | "integration";
  actorId?: string | null;
  isFixture?: boolean;
}): Promise<IntakeResult> {
  const { workspaceId, formKey, idempotencyKey } = args;
  const prior = await db.formSubmission.findUnique({ where: { workspaceId_idempotencyKey: { workspaceId, idempotencyKey } } });
  if (prior) return { outcome: "duplicate", submissionId: prior.id, contactId: prior.contactId ?? undefined, opportunityId: prior.opportunityId ?? undefined };

  const parsed = LeadInputSchema.safeParse(args.input);
  const raw = args.input as Prisma.InputJsonValue;
  const reject = async (reason: string): Promise<IntakeResult> => {
    const s = await db.formSubmission
      .create({ data: { workspaceId, formKey, idempotencyKey, payload: raw, outcome: "rejected", rejectReason: reason, attribution: args.touch } })
      .catch(() => null);
    return { outcome: "rejected", submissionId: s?.id, reason };
  };
  if (!parsed.success) return reject("Some fields are invalid.");
  const input = parsed.data;
  const email = normalizeEmail(input.email);
  const phone = normalizePhone(input.phone);
  if (!email && !phone) return reject("Add an email address or a phone number so the business can reply.");
  if (input.email && !email) return reject("That email address doesn't look complete.");

  const pipeline = await db.pipeline.findFirst({ where: { workspaceId, isDefault: true } });
  if (!pipeline) return reject("This workspace has no default pipeline yet.");
  const firstStage = parseStages(pipeline.stages).find((s) => s.type === "open");
  if (!firstStage) return reject("The default pipeline has no open stage.");

  try {
    const result = await db.$transaction(async (tx) => {
      // Claim the idempotency key first: a concurrent duplicate fails here on the unique index.
      const sub = await tx.formSubmission.create({
        data: { workspaceId, formKey, idempotencyKey, payload: input as unknown as Prisma.InputJsonValue, attribution: args.touch, outcome: "pending" },
      });

      let contact = email ? await tx.contact.findUnique({ where: { workspaceId_emailNormalized: { workspaceId, emailNormalized: email } } }) : null;
      let phoneMatchHint: string[] = [];
      if (!contact && phone) {
        phoneMatchHint = (await tx.contact.findMany({ where: { workspaceId, phoneNormalized: phone }, select: { id: true }, take: 5 })).map((c) => c.id);
      }
      if (!contact) {
        contact = await tx.contact.create({
          data: {
            workspaceId, firstName: input.firstName, lastName: input.lastName, email: input.email, emailNormalized: email, phone: input.phone,
            phoneNormalized: phone, source: args.touch.source, firstTouch: args.touch, lastTouch: args.touch, isFixture: !!args.isFixture,
            nextAction: "First reply", nextActionAt: new Date(Date.now() + 60 * 60 * 1000),
          },
        });
      }

      const fp = messageFingerprint(input);
      const recent = await tx.formSubmission.findMany({
        where: { workspaceId, contactId: contact.id, formKey, receivedAt: { gte: new Date(Date.now() - RESUBMIT_WINDOW_MS) }, outcome: { in: ["created_opportunity", "attached_existing"] } },
        orderBy: { receivedAt: "desc" },
        take: 10,
      });
      const sameMessage = recent.find((r) => messageFingerprint(LeadInputSchema.parse(r.payload)) === fp && r.opportunityId);
      if (sameMessage?.opportunityId) {
        const opp = await tx.opportunity.findFirst({ where: { workspaceId, id: sameMessage.opportunityId, status: "open" } });
        if (opp) {
          await tx.formSubmission.update({ where: { id: sub.id, workspaceId }, data: { outcome: "attached_existing", contactId: contact.id, opportunityId: opp.id } });
          await tx.activity.create({ data: { workspaceId, contactId: contact.id, opportunityId: opp.id, kind: "form_resubmitted", body: "Sent the same inquiry again. No new opportunity created.", actorType: "system" } });
          return { outcome: "attached_existing" as const, submissionId: sub.id, contactId: contact.id, opportunityId: opp.id, phoneMatchHint };
        }
      }

      // The person's name is shown next to the title everywhere, so the title names the job only.
      const title = input.service || (input.message ? input.message.split(/[.!?\n]/)[0]!.slice(0, 80) : "General inquiry");
      const opp = await tx.opportunity.create({
        data: { workspaceId, contactId: contact.id, pipelineId: pipeline.id, stageId: firstStage.id, title: title.slice(0, 160), attribution: args.touch, isFixture: !!args.isFixture },
      });
      await tx.contact.update({ where: { id: contact.id, workspaceId }, data: { lastTouch: args.touch } });
      await tx.task.create({
        data: { workspaceId, contactId: contact.id, opportunityId: opp.id, title: `Reply to ${displayName({ ...input, email })}`, dueAt: new Date(Date.now() + 60 * 60 * 1000), idempotencyKey: `intake:${sub.id}` },
      });
      await tx.activity.create({
        data: { workspaceId, contactId: contact.id, opportunityId: opp.id, kind: args.channel === "manual" ? "lead_entered" : "form_submitted", body: input.message.slice(0, 2000), meta: { formKey, service: input.service }, actorId: args.actorId ?? null, actorType: args.actorId ? "user" : "system" },
      });
      if (input.consentEmail && email) {
        await tx.consentEvent.create({ data: { workspaceId, contactId: contact.id, channel: "email", status: "granted", source: args.channel === "form" ? "form" : "manual", wording: input.consentWording } });
      }
      await tx.formSubmission.update({ where: { id: sub.id, workspaceId }, data: { outcome: "created_opportunity", contactId: contact.id, opportunityId: opp.id } });
      return { outcome: "created_opportunity" as const, submissionId: sub.id, contactId: contact.id, opportunityId: opp.id, phoneMatchHint };
    });
    if (result.outcome === "created_opportunity") {
      await fireTrigger(workspaceId, "form_submitted", { contactId: result.contactId!, opportunityId: result.opportunityId! }, `form:${result.submissionId}`);
    }
    return result;
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "P2002") {
      // Lost a race on the idempotency key or the contact email: the winner's outcome stands.
      const winner = await db.formSubmission.findUnique({ where: { workspaceId_idempotencyKey: { workspaceId, idempotencyKey } } });
      if (winner) return { outcome: "duplicate", submissionId: winner.id, contactId: winner.contactId ?? undefined, opportunityId: winner.opportunityId ?? undefined };
      return intakeLead(args); // email race: retry once now that the contact exists
    }
    throw e;
  }
}

/** Minimal RFC-4180 CSV parser for imports (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  const [header, ...body] = rows;
  if (!header) return [];
  const keys = header.map((h) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_"));
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}

/** CSV cell guard against spreadsheet formula injection on export. */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
