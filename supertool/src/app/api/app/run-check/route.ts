import { NextResponse } from 'next/server';
import { z } from 'zod';
import { analyzeAnswer } from '@/lib/ai/analysis';
import { MEASURABLE_ENGINES } from '@/lib/ai/engines';
import { ask, isObserved, type DataMode } from '@/lib/ai/providers';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { assertEntitled } from '@/lib/plan';
import { summarizeProvenance } from '@/lib/provenance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const Body = z.object({ projectId: z.string().min(1).max(64) });

/** Run the project's whole prompt set across every engine and store the results. */
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

  const competitors = project.competitors.map((c) => ({ name: c.label, domain: c.domain }));
  const runAt = new Date();
  // A demo project simulates and never calls a provider; a live project calls
  // providers and never simulates. There is no path between the two.
  const mode: DataMode = project.dataMode === 'demo' ? 'demo' : 'live';

  // Sequential per prompt, parallel across engines: bounded concurrency that
  // still finishes a 24-prompt set well inside the timeout.
  const created: Array<Record<string, unknown>> = [];
  for (const prompt of project.prompts) {
    const results = await Promise.all(
      MEASURABLE_ENGINES.map(async (engine) => {
        const result = await ask({
          prompt: prompt.text,
          engine: engine.id,
          brand: project.name,
          domain: project.domain,
          competitors,
          seed: `${project.id}|${runAt.toISOString().slice(0, 10)}`,
          mode,
        });

        const base = {
          promptId: prompt.id,
          engine: engine.id as string,
          status: result.status,
          errorCategory: result.errorCategory,
          errorDetail: result.error ?? '',
          model: result.model,
          latencyMs: result.latencyMs,
          runAt,
        };

        // A failed or unavailable check produced no answer. Storing zeroed
        // metrics for it would make "we never asked" indistinguishable from
        // "the assistant did not name you", so the metrics stay at their
        // defaults and the status is what the aggregation reads.
        if (!isObserved(result.status)) return base;

        const a = analyzeAnswer({
          answer: result.answer,
          brand: project.name,
          domain: project.domain,
          competitors,
          providedCitations: result.citations,
        });
        return {
          ...base,
          brandMentioned: a.brandMentioned,
          brandCited: a.brandCited,
          mentionRank: a.mentionRank,
          sentiment: a.sentiment,
          shareOfVoice: a.shareOfVoice,
          citedUrls: JSON.stringify(a.citedUrls),
          competitors: JSON.stringify(a.competitorsMentioned),
          excerpt: a.excerpt,
        };
      }),
    );
    created.push(...results);
  }

  await db.aiCheck.createMany({ data: created as never });

  const provenance = summarizeProvenance(created as Array<{ status: string }>);

  return NextResponse.json({
    ok: true,
    prompts: project.prompts.length,
    checks: created.length,
    runAt: runAt.toISOString(),
    // The caller is told what the run actually achieved, not just that it
    // finished. A run where every provider failed is not a successful run.
    provenance,
  });
}
