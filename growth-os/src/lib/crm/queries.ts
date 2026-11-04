import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { parseStages } from "./pipelines";
import { displayName } from "../normalize";
import { parseTouch, sourceLabel } from "../attribution";

export async function pipelineView(workspaceId: string, opts: { q?: string; filter?: string; sort?: string; pipelineId?: string }) {
  const pipelines = await db.pipeline.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" } });
  const pipeline = pipelines.find((p) => p.id === opts.pipelineId) ?? pipelines.find((p) => p.isDefault) ?? pipelines[0];
  if (!pipeline) return null;
  const stages = parseStages(pipeline.stages);
  const where: Prisma.OpportunityWhereInput = { workspaceId, pipelineId: pipeline.id };
  const q = opts.q?.trim();
  if (q) where.OR = [{ title: { contains: q, mode: "insensitive" } }, { contact: { OR: [{ firstName: { contains: q, mode: "insensitive" } }, { lastName: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] } }];
  if (opts.filter === "open") where.status = "open";
  if (opts.filter === "closed") where.status = { in: ["won", "lost"] };
  const opps = await db.opportunity.findMany({
    where, include: { contact: true },
    orderBy: opts.sort === "value" ? { estimatedValueMinor: { sort: "desc", nulls: "last" } } : opts.sort === "oldest" ? { lastActivityAt: "asc" } : { createdAt: "desc" },
    take: 500,
  });
  const contactIds = opps.map((o) => o.contactId);
  const tasks = await db.task.findMany({ where: { workspaceId, status: "open", contactId: { in: contactIds } }, orderBy: { dueAt: "asc" } });
  const now = Date.now();
  const rows = opps.map((o) => {
    const t = tasks.find((x) => x.opportunityId === o.id) ?? tasks.find((x) => x.contactId === o.contactId);
    return {
      id: o.id, contactId: o.contactId, name: displayName(o.contact), company: "", title: o.title, stageId: o.stageId, status: o.status, valueMinor: o.estimatedValueMinor, currency: o.currency,
      source: sourceLabel(parseTouch(o.attribution)), nextTask: t?.title ?? "", nextDue: t?.dueAt ?? null, overdue: !!t?.dueAt && t.dueAt.getTime() < now, createdAt: o.createdAt, lastActivityAt: o.lastActivityAt, qualification: o.qualification, isFixture: o.isFixture,
    };
  });
  const filtered = opts.filter === "overdue" ? rows.filter((r) => r.overdue) : opts.filter === "no_next" ? rows.filter((r) => r.status === "open" && !r.nextTask) : rows;
  return { pipelines, pipeline, stages, rows: filtered };
}

export async function contactDetail(workspaceId: string, contactId: string) {
  const contact = await db.contact.findFirst({ where: { workspaceId, id: contactId }, include: { company: true } });
  if (!contact) return null;
  const [opps, activities, tasks, bookings, consents, proposals, messages, runs, suppression] = await Promise.all([
    db.opportunity.findMany({ where: { workspaceId, contactId }, include: { pipeline: true }, orderBy: { createdAt: "desc" } }),
    db.activity.findMany({ where: { workspaceId, contactId }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.task.findMany({ where: { workspaceId, contactId }, orderBy: [{ status: "asc" }, { dueAt: "asc" }] }),
    db.booking.findMany({ where: { workspaceId, contactId }, orderBy: { startsAt: "desc" } }),
    db.consentEvent.findMany({ where: { workspaceId, contactId }, orderBy: { createdAt: "desc" } }),
    db.proposal.findMany({ where: { workspaceId, opportunityId: { in: (await db.opportunity.findMany({ where: { workspaceId, contactId }, select: { id: true } })).map((o) => o.id) } }, orderBy: { createdAt: "desc" } }),
    db.outboundMessage.findMany({ where: { workspaceId, contactId }, orderBy: { createdAt: "desc" }, take: 10 }),
    db.workflowRun.findMany({ where: { workspaceId, contactId }, orderBy: { createdAt: "desc" }, take: 10 }),
    contact.emailNormalized ? db.suppression.findFirst({ where: { workspaceId, channel: "email", value: contact.emailNormalized } }) : Promise.resolve(null),
  ]);
  const oppIds = opps.map((o) => o.id);
  const [outcomeRows, paymentRows] = await Promise.all([
    db.outcomeEvent.findMany({ where: { workspaceId, opportunityId: { in: oppIds } }, orderBy: { createdAt: "desc" } }),
    db.payment.findMany({ where: { workspaceId, opportunityId: { in: oppIds } }, orderBy: { receivedAt: "desc" } }),
  ]);
  const phoneTwins = contact.phoneNormalized ? await db.contact.findMany({ where: { workspaceId, phoneNormalized: contact.phoneNormalized, id: { not: contact.id } }, take: 5 }) : [];
  const actorIds = [...new Set([...activities.map((a) => a.actorId), ...outcomeRows.map((o) => o.confirmedById), ...paymentRows.map((p) => p.confirmedById)].filter(Boolean) as string[])];
  const { systemDb } = await import("../db");
  const users = await systemDb.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } });
  const team = await systemDb.membership.findMany({ where: { workspaceId, revokedAt: null, role: { not: "client" } }, include: { user: { select: { id: true, name: true } } } });
  return {
    team: team.map((m) => m.user),
    contact, opps: opps.map((o) => ({ ...o, stages: parseStages(o.pipeline.stages) })), activities, tasks, bookings, consents, proposals, outcomes: outcomeRows, payments: paymentRows, messages, runs, suppression, phoneTwins,
    userName: (id: string | null | undefined) => users.find((u) => u.id === id)?.name ?? (id ? "Former member" : "System"),
  };
}
