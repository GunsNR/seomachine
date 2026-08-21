import { NextResponse } from 'next/server';
import { z } from 'zod';
import { analyzeAnswer, rollUpVisibility } from '@/lib/ai/analysis';
import { ENGINES, liveEngines } from '@/lib/ai/engines';
import { generatePromptSet } from '@/lib/ai/prompts';
import { ask } from '@/lib/ai/providers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const Body = z.object({
  brand: z.string().min(1).max(120),
  domain: z.string().min(3).max(255),
  category: z.string().min(2).max(160).optional(),
  competitors: z.array(z.string().min(1).max(160)).max(5).optional(),
});

/**
 * Free AI visibility check: generates a small prompt set, runs it across all
 * six engines and returns the rolled-up visibility score with per-engine
 * detail. Uses live provider APIs where credentials are configured and clearly
 * flags results that were simulated.
 */
export async function POST(req: Request) {
  let input: z.infer<typeof Body>;
  try {
    input = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Provide { brand, domain } to run a check.' }, { status: 400 });
  }

  const domain = input.domain.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const brand = input.brand.trim();
  const category = input.category?.trim() || 'SEO software';
  const competitorNames = (input.competitors ?? []).map((c) => c.trim()).filter(Boolean);
  const competitors = competitorNames.map((name) => ({
    name,
    domain: `${name.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`,
  }));

  // Keep the free check small enough to complete inside the request budget.
  const prompts = generatePromptSet({ brand, category, competitors: competitorNames, limit: 4 });

  const checks = await Promise.all(
    prompts.flatMap((prompt) =>
      ENGINES.map(async (engine) => {
        const result = await ask({
          prompt: prompt.text,
          engine: engine.id,
          brand,
          domain,
          competitors,
          seed: domain,
        });
        const analysis = analyzeAnswer({
          answer: result.answer,
          brand,
          domain,
          competitors,
          providedCitations: result.citations,
        });
        return { prompt: prompt.text, cluster: prompt.cluster, engine: engine.id, simulated: result.simulated, ...analysis };
      }),
    ),
  );

  const rollup = rollUpVisibility(checks);

  const byEngine = ENGINES.map((engine) => {
    const rows = checks.filter((c) => c.engine === engine.id);
    const r = rollUpVisibility(rows);
    return {
      engine: engine.id,
      name: engine.name,
      color: engine.color,
      score: r.score,
      mentionRate: r.mentionRate,
      citationRate: r.citationRate,
      checks: rows.length,
      live: !rows.some((row) => row.simulated),
    };
  });

  const competitorTally = new Map<string, number>();
  for (const c of checks) {
    for (const comp of c.competitorsMentioned) {
      competitorTally.set(comp, (competitorTally.get(comp) ?? 0) + 1);
    }
  }

  return NextResponse.json({
    brand,
    domain,
    checkedAt: new Date().toISOString(),
    liveEngines: liveEngines(),
    simulated: checks.every((c) => c.simulated),
    rollup,
    byEngine,
    prompts: prompts.map((p) => ({ text: p.text, cluster: p.cluster, intent: p.intent })),
    topCompetitors: [...competitorTally.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, mentions: count })),
    samples: checks
      .filter((c) => c.excerpt)
      .slice(0, 6)
      .map((c) => ({
        engine: c.engine, prompt: c.prompt, excerpt: c.excerpt,
        brandMentioned: c.brandMentioned, brandCited: c.brandCited, sentiment: c.sentiment,
      })),
  });
}
