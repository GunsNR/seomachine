import { NextResponse } from 'next/server';
import { corsPreflight, requireApiKey } from '@/lib/api-auth';
import { getAiVisibility } from '@/lib/dashboard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function OPTIONS() {
  return corsPreflight();
}

/** Feeds the Elementor "AI Visibility Score" and "Engine Breakdown" widgets. */
export async function GET(req: Request) {
  const { project, response } = await requireApiKey(req);
  if (!project) return response;

  const v = await getAiVisibility(project.id);

  return NextResponse.json({
    project: { name: project.name, domain: project.domain },
    score: v.rollup.score,
    previousScore: v.previousScore,
    delta: v.rollup.score - v.previousScore,
    mentionRate: v.rollup.mentionRate,
    citationRate: v.rollup.citationRate,
    shareOfVoice: v.rollup.shareOfVoice,
    checks: v.rollup.checks,
    simulated: v.simulated,
    engines: v.byEngine.map((e) => ({
      id: e.id, name: e.name, color: e.color,
      score: e.score, mentionRate: e.mentionRate, citationRate: e.citationRate,
    })),
    trend: v.trend,
    updatedAt: new Date().toISOString(),
  }, {
    // Short cache so a busy page does not hammer the API on every view.
    headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300' },
  });
}
