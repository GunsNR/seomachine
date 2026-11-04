import { db } from "./db";
import { parseStages } from "./crm/pipelines";
import { netCollections } from "./crm/ops";
import { displayName } from "./normalize";

/**
 * Owner home: the queue of things that need a person today, and the next
 * useful action. Every number here is a count of records in this workspace,
 * not an estimate.
 */
export async function todayData(workspaceId: string, now = new Date()) {
  const dayAgo = new Date(now.getTime() - 86400000);
  const weekAhead = new Date(now.getTime() + 7 * 86400000);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [newLeads, overdueTasks, dueToday, bookings, proposals, wonThisMonth, pendingApprovals, failedJobs, stoppedRuns, problemPubs, heldMsgs, pipelines] = await Promise.all([
    db.opportunity.findMany({ where: { workspaceId, createdAt: { gte: dayAgo } }, include: { contact: true }, orderBy: { createdAt: "desc" }, take: 20 }),
    db.task.findMany({ where: { workspaceId, status: "open", dueAt: { lt: now } }, orderBy: { dueAt: "asc" }, take: 50 }),
    db.task.findMany({ where: { workspaceId, status: "open", dueAt: { gte: now, lt: new Date(now.getTime() + 86400000) } }, orderBy: { dueAt: "asc" }, take: 50 }),
    db.booking.findMany({ where: { workspaceId, startsAt: { gte: now, lt: weekAhead }, status: { in: ["scheduled", "rescheduled"] } }, orderBy: { startsAt: "asc" }, take: 20 }),
    db.proposal.findMany({ where: { workspaceId, status: "sent" }, orderBy: { sentAt: "asc" }, take: 20 }),
    db.opportunity.findMany({ where: { workspaceId, status: "won", wonAt: { gte: monthStart } }, include: { contact: true } }),
    db.contentPiece.count({ where: { workspaceId, status: "in_review" } }),
    db.job.count({ where: { workspaceId, status: "dead" } }),
    db.workflowRun.count({ where: { workspaceId, status: "failed" } }),
    db.publication.findMany({ where: { workspaceId, status: { in: ["failed", "ambiguous", "refused"] } }, take: 20 }),
    db.outboundMessage.count({ where: { workspaceId, status: "held" } }),
    db.pipeline.findMany({ where: { workspaceId } }),
  ]);
  const pendingPageChanges = await db.pageChange.count({ where: { workspaceId, status: "proposed" } });
  const collections = await netCollections(workspaceId, monthStart, now);

  const contactIds = [...new Set([...overdueTasks, ...dueToday].map((t) => t.contactId).filter(Boolean) as string[]), ...bookings.map((b) => b.contactId)];
  const contacts = await db.contact.findMany({ where: { workspaceId, id: { in: contactIds } } });
  const cName = (id: string | null) => {
    const c = contacts.find((x) => x.id === id);
    return c ? displayName(c) : "No contact";
  };

  const stageName = (pipelineId: string, stageId: string) => {
    const p = pipelines.find((x) => x.id === pipelineId);
    return p ? parseStages(p.stages).find((s) => s.id === stageId)?.name ?? stageId : stageId;
  };

  // Stale: open opportunities with no activity for 7+ days.
  const stale = await db.opportunity.findMany({ where: { workspaceId, status: "open", lastActivityAt: { lt: new Date(now.getTime() - 7 * 86400000) } }, include: { contact: true }, orderBy: { lastActivityAt: "asc" }, take: 10 });

  const followUps = overdueTasks.map((t) => ({ id: t.id, title: t.title, dueAt: t.dueAt, contactId: t.contactId, contactName: cName(t.contactId), opportunityId: t.opportunityId, overdue: true }))
    .concat(dueToday.map((t) => ({ id: t.id, title: t.title, dueAt: t.dueAt, contactId: t.contactId, contactName: cName(t.contactId), opportunityId: t.opportunityId, overdue: false })));

  const next = followUps[0]
    ? { label: `${followUps[0].title}`, detail: followUps[0].overdue ? "Oldest overdue follow-up" : "Due next", href: followUps[0].contactId ? `/app/crm/contacts/${followUps[0].contactId}?task=${followUps[0].id}` : "/app/crm" }
    : newLeads[0]
      ? { label: `Reply to ${displayName(newLeads[0].contact)}`, detail: "Newest lead", href: `/app/crm/contacts/${newLeads[0].contactId}` }
      : pendingApprovals
        ? { label: "Review content waiting for approval", detail: `${pendingApprovals} waiting`, href: "/app/content" }
        : null;

  return {
    next,
    followUps,
    newLeads: newLeads.map((o) => ({ id: o.id, contactId: o.contactId, name: displayName(o.contact), title: o.title, stage: stageName(o.pipelineId, o.stageId), createdAt: o.createdAt, source: (o.attribution as { source?: string } | null)?.source ?? "unknown" })),
    bookings: bookings.map((b) => ({ ...b, contactName: cName(b.contactId) })),
    proposals,
    won: { count: wonThisMonth.length, items: wonThisMonth.map((o) => ({ id: o.id, name: displayName(o.contact), valueMinor: o.estimatedValueMinor, currency: o.currency })) },
    collections,
    attention: { pendingApprovals, pendingPageChanges, failedJobs, failedRuns: stoppedRuns, problemPubs: problemPubs.length, heldMsgs },
    stale: stale.map((o) => ({ id: o.id, contactId: o.contactId, name: displayName(o.contact), title: o.title, lastActivityAt: o.lastActivityAt, stage: stageName(o.pipelineId, o.stageId) })),
  };
}
