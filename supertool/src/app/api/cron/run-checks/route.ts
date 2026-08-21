import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { analyzeAnswer } from '@/lib/ai/analysis';
import { ENGINES } from '@/lib/ai/engines';
import { ask } from '@/lib/ai/providers';
import { db } from '@/lib/db';
import { getPlan } from '@/lib/plan';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Scheduled visibility runs.
 *
 * Point a scheduler at this once an hour (Vercel Cron, GitHub Actions, or a
 * plain crontab curl). It works out which projects are actually due based on
 * their plan's frequency and when they last ran, so an hourly trigger does not
 * mean hourly checks.
 *
 * Protected by CRON_SECRET. Without that set the endpoint refuses to run
 * rather than defaulting open — an unauthenticated caller could otherwise
 * burn a customer's provider quota.
 */
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const presented =
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    req.headers.get('x-cron-secret') ??
    '';

  const a = Buffer.from(presented);
  const b = Buffer.from(secret);
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

const DAY_MS = 86_400_000;

export async function GET(req: Request) {
  return run(req);
}

export async function POST(req: Request) {
  return run(req);
}

async function run(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json(
      {
        error: process.env.CRON_SECRET
          ? 'Invalid cron secret.'
          : 'CRON_SECRET is not configured, so scheduled runs are disabled.',
      },
      { status: 401 },
    );
  }

  const url = new URL(req.url);
  const force = url.searchParams.get('force') === 'true';
  // Bound the work per invocation so one call cannot run indefinitely.
  const maxProjects = Math.min(20, Math.max(1, Number(url.searchParams.get('limit') ?? 5)));

  const projects = await db.project.findMany({
    include: {
      org: true,
      competitors: true,
      prompts: { include: { checks: { orderBy: { runAt: 'desc' }, take: 1 } } },
    },
  });

  const now = Date.now();
  const results: Array<{ project: string; status: string; checks?: number; reason?: string }> = [];
  let processed = 0;

  for (const project of projects) {
    if (processed >= maxProjects) {
      results.push({ project: project.name, status: 'deferred', reason: 'Batch limit reached' });
      continue;
    }

    if (!project.prompts.length) {
      results.push({ project: project.name, status: 'skipped', reason: 'No prompts configured' });
      continue;
    }

    const plan = getPlan(project.org.plan);
    const intervalMs = plan.frequency === 'daily' ? DAY_MS : 7 * DAY_MS;

    const lastRun = project.prompts
      .flatMap((p) => p.checks)
      .reduce<number>((latest, c) => Math.max(latest, c.runAt.getTime()), 0);

    if (!force && lastRun && now - lastRun < intervalMs) {
      const hours = Math.ceil((intervalMs - (now - lastRun)) / 3_600_000);
      results.push({ project: project.name, status: 'not-due', reason: `Due in ~${hours}h` });
      continue;
    }

    processed++;

    const competitors = project.competitors.map((c) => ({ name: c.label, domain: c.domain }));
    const runAt = new Date();
    const rows: Array<Record<string, unknown>> = [];

    try {
      for (const prompt of project.prompts) {
        const engineResults = await Promise.all(
          ENGINES.map(async (engine) => {
            const answer = await ask({
              prompt: prompt.text,
              engine: engine.id,
              brand: project.name,
              domain: project.domain,
              competitors,
              seed: `${project.id}|${runAt.toISOString().slice(0, 10)}`,
            });
            const a = analyzeAnswer({
              answer: answer.answer,
              brand: project.name,
              domain: project.domain,
              competitors,
              providedCitations: answer.citations,
            });
            return {
              promptId: prompt.id,
              engine: engine.id,
              brandMentioned: a.brandMentioned,
              brandCited: a.brandCited,
              mentionRank: a.mentionRank,
              sentiment: a.sentiment,
              shareOfVoice: a.shareOfVoice,
              citedUrls: JSON.stringify(a.citedUrls),
              competitors: JSON.stringify(a.competitorsMentioned),
              excerpt: a.excerpt,
              simulated: answer.simulated,
              runAt,
            };
          }),
        );
        rows.push(...engineResults);
      }

      await db.aiCheck.createMany({ data: rows as never });
      results.push({ project: project.name, status: 'ran', checks: rows.length });
    } catch (err) {
      // One project failing must not abort the rest of the batch.
      console.error(`cron: project ${project.id} failed`, err);
      results.push({
        project: project.name,
        status: 'failed',
        reason: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  return NextResponse.json({
    ok: true,
    ranAt: new Date().toISOString(),
    projectsConsidered: projects.length,
    projectsRun: results.filter((r) => r.status === 'ran').length,
    totalChecks: results.reduce((s, r) => s + (r.checks ?? 0), 0),
    results,
  });
}
