import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { assertEntitled } from '@/lib/plan';
import { startRun } from '@/lib/measurement/run';
import type { DataMode } from '@/lib/ai/providers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const Body = z.object({
  projectId: z.string().min(1).max(64),
  /**
   * Repetitions per (prompt, engine) pair. Answer engines are
   * non-deterministic, so one sample is an anecdote; the default stays at 1 to
   * bound cost, and the caller opts into more.
   */
  samplesPerPair: z.number().int().min(1).max(10).optional(),
});

/**
 * Start one measurement run over the project's prompt set.
 *
 * The run row is created before any provider is contacted, and each observation
 * is persisted as it completes, so an interrupted request leaves an honest
 * partial run rather than nothing.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  let input: z.infer<typeof Body>;
  try {
    input = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Provide a projectId.' }, { status: 400 });
  }

  // Scope the lookup to the caller's org so a guessed id cannot reach another
  // tenant's project.
  const project = await db.project.findFirst({
    where: { id: input.projectId, orgId: session.orgId },
    include: { competitors: true, prompts: true },
  });
  if (!project) return NextResponse.json({ error: 'Project not found.' }, { status: 404 });

  await assertEntitled(session.orgId);

  if (!project.prompts.length) {
    return NextResponse.json({ error: 'This project has no prompts to run yet.' }, { status: 422 });
  }

  const mode: DataMode = project.dataMode === 'demo' ? 'demo' : 'live';

  const result = await startRun({
    orgId: session.orgId,
    projectId: project.id,
    projectName: project.name,
    projectDomain: project.domain,
    prompts: project.prompts.map((p) => ({ id: p.id, text: p.text, cluster: p.cluster })),
    competitors: project.competitors.map((c) => ({ name: c.label, domain: c.domain })),
    dataMode: mode,
    trigger: 'manual',
    samplesPerPair: input.samplesPerPair ?? 1,
  });

  // The caller is told what the run achieved, not merely that it finished. A
  // run where every provider was unreachable is not a successful run.
  return NextResponse.json({
    ok: result.observed > 0,
    runId: result.runId,
    status: result.status,
    prompts: project.prompts.length,
    attempted: result.attempted,
    observed: result.observed,
    failed: result.failed,
    unavailable: result.unavailable,
    coverage: result.coverage,
    skippedExisting: result.skippedExisting,
  });
}
