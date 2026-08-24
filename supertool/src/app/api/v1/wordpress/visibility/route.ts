import { NextResponse } from 'next/server';
import { corsPreflight, requireApiKey } from '@/lib/api-auth';
import { getAiVisibility } from '@/lib/dashboard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function OPTIONS() {
  return corsPreflight();
}

/**
 * Feeds the Elementor "AI Visibility Score" and "Engine Breakdown" widgets.
 *
 * Consumers embed these numbers on public pages, so the payload carries the run
 * identity, coverage and interval alongside every rate. A widget that rendered
 * a rate without its coverage would put a number on a customer's website that
 * the customer could not defend.
 */
export async function GET(req: Request) {
  const { project, response } = await requireApiKey(req);
  if (!project) return response;

  const v = await getAiVisibility(project.id);

  if (!v.report) {
    return NextResponse.json(
      {
        project: { name: project.name, domain: project.domain },
        run: null,
        inclusionRate: null,
        citationRate: null,
        message: 'No measurement run has completed for this project yet.',
        updatedAt: new Date().toISOString(),
      },
      { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300' } },
    );
  }

  const r = v.report;

  return NextResponse.json(
    {
      project: { name: project.name, domain: project.domain },

      // Run identity, so an embedded number can be traced to the measurement
      // that produced it rather than to a date bucket.
      run: {
        id: r.runId,
        startedAt: r.startedAt.toISOString(),
        finishedAt: r.finishedAt?.toISOString() ?? null,
        status: r.status,
        interrupted: r.interrupted,
        trigger: r.trigger,
        dataMode: r.dataMode,
        promptSetVersion: r.promptSetVersion,
        methodologyVersion: r.methodologyVersion,
        samplesPerPair: r.samplesPerPair,
        localeRequested: { tag: r.localeTag, region: r.regionCode },
      },

      // null, not 0, below the minimum-evidence threshold.
      inclusionRate: r.inclusion.rate,
      inclusionInterval: r.inclusion.interval,
      citationRate: r.citation.rate,
      citationInterval: r.citation.interval,
      insufficientEvidence: r.inclusion.insufficientEvidence,

      coverage: {
        attempted: r.attempted,
        observed: r.observed,
        failed: r.failed,
        unavailable: r.unavailable,
        ratio: r.coverage,
      },

      engines: r.byEngine.map((e) => ({
        id: e.id,
        name: e.name,
        color: e.color,
        attempted: e.attempted,
        observed: e.observed,
        inclusionRate: e.inclusionRate,
        citationRate: e.citationRate,
        insufficientEvidence: e.insufficientEvidence,
        groundingConfirmed: e.groundingConfirmed,
        reason: e.reason,
      })),

      trend: v.trend.map((t) => ({
        runId: t.runId,
        startedAt: t.startedAt.toISOString(),
        inclusionRate: t.inclusionRate,
        observed: t.observed,
        attempted: t.attempted,
        promptSetVersion: t.promptSetVersion,
      })),

      updatedAt: new Date().toISOString(),
    },
    {
      // Short cache so a busy page does not hammer the API on every view.
      headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300' },
    },
  );
}
