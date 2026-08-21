import { NextResponse } from 'next/server';
import { z } from 'zod';
import { analyzeAnswer } from '@/lib/ai/analysis';
import { ENGINES } from '@/lib/ai/engines';
import { ask } from '@/lib/ai/providers';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { assertEntitled } from '@/lib/plan';

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

  // Sequential per prompt, parallel across engines: bounded concurrency that
  // still finishes a 24-prompt set well inside the timeout.
  const created: Array<Record<string, unknown>> = [];
  for (const prompt of project.prompts) {
    const results = await Promise.all(
      ENGINES.map(async (engine) => {
        const result = await ask({
          prompt: prompt.text,
          engine: engine.id,
          brand: project.name,
          domain: project.domain,
          competitors,
          seed: `${project.id}|${runAt.toISOString().slice(0, 10)}`,
        });
        const a = analyzeAnswer({
          answer: result.answer,
          brand: project.name,
          domain: project.domain,
          competitors,
          providedCitations: result.citations,
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
          simulated: result.simulated,
          runAt,
        };
      }),
    );
    created.push(...results);
  }

  await db.aiCheck.createMany({ data: created as never });

  return NextResponse.json({
    ok: true,
    prompts: project.prompts.length,
    checks: created.length,
    runAt: runAt.toISOString(),
  });
}
