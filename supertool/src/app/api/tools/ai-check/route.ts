import { NextResponse } from 'next/server';
import { clientKey, rateLimit, rateLimitHeaders } from '@/lib/rate-limit';
import { z } from 'zod';
import { analyzeAnswer, rollUpVisibility } from '@/lib/ai/analysis';
import { MEASURABLE_ENGINES, liveEngines, unavailableEngines } from '@/lib/ai/engines';
import { generatePromptSet } from '@/lib/ai/prompts';
import { ask, isObserved } from '@/lib/ai/providers';
import { summarizeProvenance } from '@/lib/provenance';

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
 * Free AI visibility check.
 *
 * Generates a small prompt set and runs it against whichever answer engines
 * this deployment has credentials for. If none are configured the tool refuses
 * rather than producing a plausible-looking simulated score — a fabricated
 * baseline is worse than no baseline, because the visitor cannot tell.
 */
export async function POST(req: Request) {
  // Each check fans out across every connected engine, so the free tool is
  // capped per IP.
  const limited = rateLimit(clientKey(req, 'tools-ai-check'), 5, 10 * 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: `Too many requests. Try again in ${limited.retryAfterSeconds} seconds, or start a trial for unlimited runs.` },
      { status: 429, headers: rateLimitHeaders(limited) },
    );
  }

  let input: z.infer<typeof Body>;
  try {
    input = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Provide { brand, domain } to run a check.' }, { status: 400 });
  }

  // No credential, no measurement. This deliberately fails loudly.
  const live = liveEngines();
  if (!live.length) {
    return NextResponse.json(
      {
        error:
          'No answer engine is connected on this deployment, so there is nothing to measure. ' +
          'This tool will not generate a sample score in place of a real one.',
        liveEngines: [],
        unavailableEngines: unavailableEngines(),
      },
      { status: 503 },
    );
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

  const EMPTY_ANALYSIS = {
    brandMentioned: false, brandCited: false, mentionRank: 0,
    sentiment: 'neutral' as const, shareOfVoice: 0,
    citedUrls: [] as string[], competitorsMentioned: [] as string[], excerpt: '',
  };

  const checks = await Promise.all(
    prompts.flatMap((prompt) =>
      MEASURABLE_ENGINES.map(async (engine) => {
        const result = await ask({
          prompt: prompt.text,
          engine: engine.id,
          brand,
          domain,
          competitors,
          seed: domain,
        });
        const base = {
          prompt: prompt.text,
          cluster: prompt.cluster,
          engine: engine.id as string,
          status: result.status,
          errorCategory: result.errorCategory,
        };
        if (!isObserved(result.status)) return { ...base, ...EMPTY_ANALYSIS };

        return {
          ...base,
          ...analyzeAnswer({
            answer: result.answer,
            brand,
            domain,
            competitors,
            providedCitations: result.citations,
          }),
        };
      }),
    ),
  );

  // Rates are computed over observed checks only. A surface that never
  // answered is a gap in coverage, not a zero.
  const observedChecks = checks.filter((c) => isObserved(c.status as never));
  const provenance = summarizeProvenance(checks);
  const rollup = rollUpVisibility(observedChecks);

  const byEngine = MEASURABLE_ENGINES.map((engine) => {
    const rows = checks.filter((c) => c.engine === engine.id);
    const observed = rows.filter((row) => isObserved(row.status as never));
    const r = rollUpVisibility(observed);
    const enginePro = summarizeProvenance(rows);
    return {
      engine: engine.id,
      name: engine.name,
      color: engine.color,
      score: observed.length ? r.score : null,
      mentionRate: observed.length ? r.mentionRate : null,
      citationRate: observed.length ? r.citationRate : null,
      checks: rows.length,
      observed: observed.length,
      status: enginePro.mode,
      reason: rows.find((row) => row.errorCategory)?.errorCategory ?? '',
    };
  });

  const competitorTally = new Map<string, number>();
  for (const c of observedChecks) {
    for (const comp of c.competitorsMentioned) {
      competitorTally.set(comp, (competitorTally.get(comp) ?? 0) + 1);
    }
  }

  return NextResponse.json({
    brand,
    domain,
    checkedAt: new Date().toISOString(),
    liveEngines: live,
    unavailableEngines: unavailableEngines(),
    provenance,
    rollup,
    byEngine,
    prompts: prompts.map((p) => ({ text: p.text, cluster: p.cluster, intent: p.intent })),
    topCompetitors: [...competitorTally.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, mentions: count })),
    samples: observedChecks
      .filter((c) => c.excerpt)
      .slice(0, 6)
      .map((c) => ({
        engine: c.engine, prompt: c.prompt, excerpt: c.excerpt,
        brandMentioned: c.brandMentioned, brandCited: c.brandCited, sentiment: c.sentiment,
        status: c.status,
      })),
  });
}
