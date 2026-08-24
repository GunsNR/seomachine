import { redirect } from 'next/navigation';
import { BarList, LineChart } from '@/components/app/Chart';
import { Badge, CapabilityUnavailable, EmptyState, PageHeader, Panel, StatTile } from '@/components/app/ui';
import { LegacyNote, RateTile, RunHeader, VariationNote } from '@/components/app/RunEvidence';
import { RunCheckButton } from './RunCheckButton';
import { getSession, resolveProject } from '@/lib/auth';
import { getAiVisibility } from '@/lib/dashboard';
import { getEntitlements } from '@/lib/plan';
import { MEASURABLE_ENGINES, blockedOnGrounding, unavailableEngines } from '@/lib/ai/engines';
import { pct } from '@/lib/utils';
import { DeletePrompt, PromptManager } from './PromptManager';

export const dynamic = 'force-dynamic';

export default async function AiVisibilityPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  const project = await resolveProject(session.orgId);
  if (!project) redirect('/app');

  const [v, entitlements] = await Promise.all([
    getAiVisibility(project.id),
    getEntitlements(session.orgId),
  ]);

  const noMeasurableEngines = MEASURABLE_ENGINES.length === 0;
  const ungrounded = blockedOnGrounding();

  return (
    <>
      <PageHeader
        title="AI Visibility"
        sub={`How often the connected answer engines name ${project.name}, measured one run at a time.`}
        action={<RunCheckButton projectId={project.id} />}
      />

      <div className="mt-6 space-y-6">
        {noMeasurableEngines && (
          <CapabilityUnavailable
            title="No answer engine is currently measurable"
            status="unavailable"
            reason={
              `Every engine adapter is blocked. ${ungrounded.length} of them (${ungrounded.join(', ')}) ` +
              'do not enable the vendor’s web-retrieval tool, so an answer would come from the model’s ' +
              'training data rather than a search — that is not AI search visibility and is not reported ' +
              'as if it were. The remainder could not have their model identifier verified against official ' +
              'vendor documentation. See docs/release-truth-audit.md for the per-engine reason.'
            }
          />
        )}

        {v.report ? (
          <>
            <RunHeader
              run={{
                runId: v.report.runId,
                startedAt: v.report.startedAt,
                finishedAt: v.report.finishedAt,
                status: v.report.status,
                interrupted: v.report.interrupted,
                trigger: v.report.trigger,
                dataMode: v.report.dataMode,
                promptSetVersion: v.report.promptSetVersion,
                methodologyVersion: v.report.methodologyVersion,
                samplesPerPair: v.report.samplesPerPair,
                localeTag: v.report.localeTag,
                regionCode: v.report.regionCode,
                attempted: v.report.attempted,
                observed: v.report.observed,
                failed: v.report.failed,
                unavailable: v.report.unavailable,
                coverage: v.report.coverage,
              }}
            />

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <RateTile
                label="Inclusion rate"
                result={v.report.inclusion}
                sub="Share of observed answers naming your brand."
              />
              <RateTile
                label="Citation rate"
                result={v.report.citation}
                sub="Share of observed answers citing one of your URLs."
              />
              <StatTile
                label="Coverage"
                value={v.report.attempted ? pct(v.report.coverage) : '—'}
                sub={`${v.report.observed} of ${v.report.attempted} checks returned an answer`}
                tone={v.report.coverage === 1 ? 'good' : v.report.observed ? 'warn' : 'bad'}
              />
              <StatTile
                label="Estimated run cost"
                value={`$${v.report.totalCostUsd.toFixed(2)}`}
                sub={
                  v.report.usageReportedCount
                    ? `${v.report.usageReportedCount} of ${v.report.attempted} checks reported usage · estimate only`
                    : 'No provider reported token usage in this run'
                }
              />
            </div>

            <Panel title="Run-to-run variation" sub="Measured spread, not a modelled interval">
              <div className="p-5">
                <VariationNote variation={v.variation?.inclusion ?? null} />
              </div>
            </Panel>

            <div className="grid items-start gap-6 xl:grid-cols-[1.5fr_1fr]">
              <Panel title="Inclusion rate by run" sub="One point per run — never one point per day">
                <div className="p-5">
                  <LineChart
                    points={v.trend
                      .filter((t) => t.inclusionRate !== null)
                      .map((t) => ({
                        date: t.startedAt.toISOString().slice(0, 10),
                        value: Math.round((t.inclusionRate ?? 0) * 100),
                      }))}
                    label="Inclusion rate per measurement run"
                    height={220}
                  />
                  <p className="mt-3 text-[0.75rem] leading-relaxed text-body">
                    Runs with insufficient evidence are omitted rather than plotted as zero. Points
                    from a different prompt-set version measure a different instrument and are not
                    directly comparable.
                  </p>
                </div>
              </Panel>

              <Panel title="Per engine" sub="This run">
                <div className="p-5">
                  {v.report.byEngine.length ? (
                    <BarList
                      max={100}
                      rows={v.report.byEngine.map((e) => ({
                        label: e.name,
                        value: Math.round((e.inclusionRate ?? 0) * 100),
                        color: e.color,
                        sub: e.observed
                          ? `${e.observed}/${e.attempted} observed${
                              e.insufficientEvidence ? ' · insufficient evidence' : ''
                            }${e.groundingConfirmed ? ' · grounded' : ' · no retrieval evidence'}`
                          : `Not measured — ${e.reason.slice(0, 90)}`,
                      }))}
                    />
                  ) : (
                    <p className="text-[0.85rem] text-body">No engine produced an observation.</p>
                  )}
                </div>
              </Panel>
            </div>

            <Panel title="Competitor share of voice" sub="Vendors named alongside you in this run">
              <div className="p-5">
                {v.competitorShare.length ? (
                  <BarList
                    rows={v.competitorShare.map((c) => ({
                      label: c.domain,
                      value: c.mentions,
                      sub: `${pct(c.share)} of all competitor mentions`,
                    }))}
                  />
                ) : (
                  <p className="text-[0.85rem] text-body">
                    No competitors were named in the observed answers of this run.
                  </p>
                )}
              </div>
            </Panel>
          </>
        ) : (
          <CapabilityUnavailable
            title="No measurement run yet"
            reason={
              `This project has ${v.totalPrompts} prompts configured. ` +
              (noMeasurementPossible(unavailableEngines().length)
                ? 'No engine is currently measurable, so a run would record only unavailable observations.'
                : 'Start a run to collect the first observations.')
            }
          />
        )}

        <LegacyNote legacy={v.legacy} />

        <PromptManager
          projectId={project.id}
          category={project.description || 'SEO software'}
          remaining={entitlements.remaining.prompts}
        />

        <Panel
          title="Prompt performance"
          sub="Sorted by inclusion rate, weakest first. A prompt with no observation is a gap in measurement, not in visibility."
        >
          {v.promptRows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[46rem]">
                <caption className="sr-only">Per-prompt inclusion and citation rates for this run</caption>
                <thead>
                  <tr className="border-b border-line">
                    <th scope="col" className="table-head px-5 py-3 text-left">Prompt</th>
                    <th scope="col" className="table-head px-5 py-3 text-left">Cluster</th>
                    <th scope="col" className="table-head px-5 py-3 text-right">Observed</th>
                    <th scope="col" className="table-head px-5 py-3 text-right">Included</th>
                    <th scope="col" className="table-head px-5 py-3 text-right">Cited</th>
                    <th scope="col" className="px-5 py-3"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {v.promptRows.map((p) => (
                    <tr key={p.id} className="hover:bg-surface-alt/60">
                      <td className="max-w-md px-5 py-3.5 text-[0.875rem] text-ink">{p.text}</td>
                      <td className="px-5 py-3.5"><Badge>{p.cluster}</Badge></td>
                      <td className="px-5 py-3.5 text-right text-[0.85rem] tabular-nums text-body">
                        {p.observed}/{p.attempted}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {p.inclusionRate === null ? (
                          <span className="text-[0.78rem] text-body/60">
                            {p.observed === 0 ? 'Not measured' : 'Insufficient'}
                          </span>
                        ) : (
                          <span
                            className={`text-[0.85rem] font-bold tabular-nums ${
                              p.inclusionRate === 0 ? 'text-bad' : p.inclusionRate >= 0.5 ? 'text-ok' : 'text-warn'
                            }`}
                          >
                            {pct(p.inclusionRate)}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right text-[0.85rem] tabular-nums text-body">
                        {p.citationRate === null ? '—' : pct(p.citationRate)}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <DeletePrompt id={p.id} text={p.text} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="No prompts yet"
              body="A prompt set is the instrument your visibility is measured against. Generate one to begin."
              cta={{ label: 'Go to settings', href: '/app/settings' }}
            />
          )}
        </Panel>
      </div>
    </>
  );
}

/** True when every known surface is unavailable. */
function noMeasurementPossible(unavailableCount: number): boolean {
  return MEASURABLE_ENGINES.length === 0 && unavailableCount > 0;
}
