import { db } from "./db";
import { netCollections } from "./crm/ops";
import { revenueToCostRatio } from "./money";
import { parseTouch, sourceLabel } from "./attribution";

/**
 * Outcome report for one workspace and period. Distinct events are counted
 * separately — submissions, opportunities, qualified, appointments, won,
 * payments — and attribution coverage is reported next to them.
 * Revenue is never summed across currencies or across attribution models.
 */
export async function outcomeReport(workspaceId: string, from: Date, to: Date, marketingCost: { amountMinor: number; currency: string } | null) {
  const range = { gte: from, lt: to };
  const [subs, opps, outcomes, bookings, payments] = await Promise.all([
    db.formSubmission.findMany({ where: { workspaceId, receivedAt: range } }),
    db.opportunity.findMany({ where: { workspaceId, createdAt: range } }),
    db.outcomeEvent.findMany({ where: { workspaceId, createdAt: range } }),
    db.booking.count({ where: { workspaceId, createdAt: range, status: { not: "cancelled" } } }),
    db.payment.findMany({ where: { workspaceId, receivedAt: range } }),
  ]);
  const won = await db.opportunity.findMany({ where: { workspaceId, status: "won", wonAt: range } });
  const collections = await netCollections(workspaceId, from, to);

  const bySource = new Map<string, { opportunities: number; won: number; collectedNet: Record<string, number> }>();
  const touchOf = (o: { attribution: unknown }) => sourceLabel(parseTouch(o.attribution));
  for (const o of opps) {
    const k = touchOf(o);
    const row = bySource.get(k) ?? { opportunities: 0, won: 0, collectedNet: {} };
    row.opportunities++;
    bySource.set(k, row);
  }
  for (const o of won) {
    const k = touchOf(o);
    const row = bySource.get(k) ?? { opportunities: 0, won: 0, collectedNet: {} };
    row.won++;
    bySource.set(k, row);
  }
  // Collections attributed by the opportunity's first-touch snapshot (model: "first touch on opportunity").
  const oppIds = [...new Set(payments.map((p) => p.opportunityId))];
  const payOpps = await db.opportunity.findMany({ where: { workspaceId, id: { in: oppIds } } });
  for (const p of payments) {
    const o = payOpps.find((x) => x.id === p.opportunityId);
    const k = o ? touchOf(o) : "Unknown source";
    const row = bySource.get(k) ?? { opportunities: 0, won: 0, collectedNet: {} };
    row.collectedNet[p.currency] = (row.collectedNet[p.currency] ?? 0) + (p.kind === "payment" ? p.amountMinor : -p.amountMinor);
    bySource.set(k, row);
  }

  const known = opps.filter((o) => parseTouch(o.attribution)?.source && parseTouch(o.attribution)?.source !== "unknown").length;
  const lastPayment = payments.reduce<Date | null>((m, p) => (!m || p.createdAt > m ? p.createdAt : m), null);
  const lastSubmission = subs.reduce<Date | null>((m, s) => (!m || s.receivedAt > m ? s.receivedAt : m), null);
  const cur = marketingCost?.currency ?? Object.keys(collections)[0] ?? "USD";
  const revenue = collections[cur] ? { amountMinor: collections[cur]!.net, currency: cur } : null;

  return {
    period: { from, to },
    counts: {
      submissions: subs.filter((s) => s.outcome !== "rejected" && s.outcome !== "duplicate").length,
      duplicatesIgnored: subs.filter((s) => s.outcome === "duplicate" || s.outcome === "attached_existing").length,
      opportunities: opps.length,
      qualified: outcomes.filter((o) => o.kind === "qualified").length,
      appointments: bookings,
      won: won.length,
      paymentsRecorded: payments.filter((p) => p.kind === "payment").length,
      refunds: payments.filter((p) => p.kind === "refund").length,
    },
    confirmations: {
      client: outcomes.filter((o) => o.source === "client_manual").length + payments.filter((p) => p.source === "client_manual").length,
      agency: outcomes.filter((o) => o.source === "agency_manual").length + payments.filter((p) => p.source === "agency_manual").length,
      provider: outcomes.filter((o) => o.source === "provider").length + payments.filter((p) => p.source === "provider").length,
    },
    collections,
    bySource: [...bySource.entries()].map(([source, v]) => ({ source, ...v })).sort((a, b) => b.opportunities - a.opportunities),
    attributionCoverage: opps.length ? known / opps.length : null,
    freshness: { lastPayment, lastSubmission },
    revenueToCost: { ratio: revenueToCostRatio(revenue, marketingCost), revenue, cost: marketingCost, label: "Collected revenue ÷ marketing cost you entered (not profit ROI)" },
    profitRoi: { value: null as number | null, reason: "Unavailable: needs your profit margin and complete cost figures." },
  };
}
