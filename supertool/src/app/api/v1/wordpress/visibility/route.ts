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
    // null rather than 0 when nothing was observed.
    score: v.provenance.observed ? v.rollup.score : null,
    previousScore: v.previousScore,
    delta: v.rollup.score - v.previousScore,
    mentionRate: v.rollup.mentionRate,
    citationRate: v.rollup.citationRate,
    shareOfVoice: v.rollup.shareOfVoice,
    checks: v.rollup.checks,
    // Consumers embed these numbers on public pages, so they get the same
    // provenance the dashboard shows. A widget rendering a demo score as if it
    // were live would put a fabricated number on a customer's website.
    provenance: v.provenance,
    engines: v.byEngine.map((e) => ({
      id: e.id, name: e.name, color: e.color,
      score: e.score, mentionRate: e.mentionRate, citationRate: e.citationRate,
      status: e.status, observed: e.observed,
    })),
    trend: v.trend,
    updatedAt: new Date().toISOString(),
  }, {
    // Short cache so a busy page does not hammer the API on every view.
    headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300' },
  });
}
