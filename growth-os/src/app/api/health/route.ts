import { systemDb } from "@/lib/db";
import { aiStatus } from "@/lib/ai/provider";

export const dynamic = "force-dynamic";

/** Liveness + readiness. No secrets, no tenant data: counts and booleans only. */
export async function GET() {
  const started = Date.now();
  let db = false;
  try { await systemDb.$queryRaw`SELECT 1`; db = true; } catch { db = false; }
  const lastJob = db ? await systemDb.job.findFirst({ where: { finishedAt: { not: null } }, orderBy: { finishedAt: "desc" }, select: { finishedAt: true } }) : null;
  const waiting = db ? await systemDb.job.count({ where: { status: "queued", runAfter: { lt: new Date(Date.now() - 5 * 60_000) } } }) : null;
  const dead = db ? await systemDb.job.count({ where: { status: "dead" } }) : null;
  const body = {
    ok: db,
    database: db ? "up" : "down",
    worker: { lastJobFinishedAt: lastJob?.finishedAt ?? null, overdueJobs: waiting, failedJobs: dead, note: waiting ? "Jobs are waiting more than 5 minutes — is `npm run worker` running?" : "" },
    switches: { liveSending: process.env.LIVE_SENDING_ENABLED === "true", livePublishing: process.env.LIVE_PUBLISHING_ENABLED === "true", ai: aiStatus().live },
    ms: Date.now() - started,
  };
  return Response.json(body, { status: db ? 200 : 503, headers: { "cache-control": "no-store" } });
}
