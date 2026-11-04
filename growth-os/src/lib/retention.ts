import { systemDb } from "./db";

/**
 * Retention purge (policy in replica/backend.md). Runs daily from the worker.
 * Never deletes suppression (opt-out) rows: they are what keeps someone from
 * being contacted again. Uses systemDb on purpose: it is a cross-tenant
 * maintenance job with fixed, age-based conditions and no tenant input.
 */
export const RETENTION = { revokedSessionDays: 90, authTokenDays: 30, auditMonths: 24, crawlRunsKeptPerRoot: 10, finishedJobDays: 30 };

export async function purge(now = new Date()) {
  const days = (n: number) => new Date(now.getTime() - n * 86400000);
  const sessions = await systemDb.session.deleteMany({ where: { OR: [{ revokedAt: { lt: days(RETENTION.revokedSessionDays) } }, { expiresAt: { lt: days(RETENTION.revokedSessionDays) } }] } });
  const tokens = await systemDb.authToken.deleteMany({ where: { OR: [{ usedAt: { lt: days(RETENTION.authTokenDays) } }, { expiresAt: { lt: days(RETENTION.authTokenDays) } }] } });
  const audits = await systemDb.auditEvent.deleteMany({ where: { createdAt: { lt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - RETENTION.auditMonths, now.getUTCDate())) } } });
  const jobs = await systemDb.job.deleteMany({ where: { status: { in: ["succeeded", "cancelled"] }, finishedAt: { lt: days(RETENTION.finishedJobDays) } } });
  // Keep the newest N crawl runs per (workspace, root URL); older runs' pages go, findings stay.
  const runs = await systemDb.crawlRun.findMany({ select: { id: true, workspaceId: true, rootUrl: true, createdAt: true }, orderBy: { createdAt: "desc" } });
  const seen = new Map<string, number>();
  const old: string[] = [];
  for (const r of runs) {
    const k = `${r.workspaceId}|${r.rootUrl}`;
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    if (n > RETENTION.crawlRunsKeptPerRoot) old.push(r.id);
  }
  const crawlPages = old.length ? await systemDb.crawlPage.deleteMany({ where: { runId: { in: old } } }) : { count: 0 };
  return { sessions: sessions.count, tokens: tokens.count, audits: audits.count, jobs: jobs.count, crawlPages: crawlPages.count };
}
