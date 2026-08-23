import { redirect } from 'next/navigation';
import { BarList, LineChart } from '@/components/app/Chart';
import { Badge, EmptyState, PageHeader, Panel, ProvenanceBanner, StatTile } from '@/components/app/ui';
import { RunCheckButton } from './RunCheckButton';
import { getSession, resolveProject } from '@/lib/auth';
import { getAiVisibility } from '@/lib/dashboard';
import { getEntitlements } from '@/lib/plan';
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
  const delta = v.rollup.score - v.previousScore;
  // Nothing observed means nothing to report. Rendering 0% here would state
  // that no assistant named the brand, which is not what happened.
  const observed = v.provenance.observed > 0;

  return (
    <>
      <PageHeader
        title="AI Visibility"
        sub={`How often the connected answer engines name ${project.name} when buyers ask.`}
        action={<RunCheckButton projectId={project.id} />}
      />

      <div className="mt-6 space-y-6">
        <ProvenanceBanner provenance={v.provenance} />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="Visibility score"
            value={observed ? v.rollup.score : '—'}
            delta={observed ? delta : undefined}
            sub={observed ? `Convenience index over ${v.rollup.checks} observed checks` : 'Nothing observed yet'}
            tone={observed ? (v.rollup.score >= 60 ? 'good' : v.rollup.score >= 35 ? 'warn' : 'bad') : 'default'}
          />
          <StatTile label="Mention rate" value={observed ? pct(v.rollup.mentionRate) : '—'} sub="Of answers actually observed" />
          <StatTile label="Citation rate" value={observed ? pct(v.rollup.citationRate) : '—'} sub="Of answers actually observed" />
          <StatTile
            label="Coverage"
            value={v.provenance.total ? pct(v.provenance.coverage) : '—'}
            sub={`${v.provenance.observed} of ${v.provenance.total} checks returned an answer`}
            tone={v.provenance.coverage === 1 ? 'good' : v.provenance.observed ? 'warn' : 'bad'}
          />
        </div>

        <div className="grid items-start gap-6 xl:grid-cols-[1.5fr_1fr]">
          <Panel title="Score over time" sub="One point per scheduled run">
            <div className="p-5">
              <LineChart points={v.trend} label="AI visibility score over time" height={220} />
            </div>
          </Panel>

          <Panel title="Per engine" sub="Latest run">
            <div className="p-5">
              {v.byEngine.length ? (
                <BarList
                  max={100}
                  rows={v.byEngine.map((e) => ({
                    label: e.name,
                    value: e.score ?? 0,
                    color: e.color,
                    sub:
                      e.observed
                        ? `${e.observed}/${e.checks} observed · named ${pct(e.mentionRate ?? 0)} · cited ${pct(e.citationRate ?? 0)}`
                        : `Not measured — ${e.reason || e.status}`,
                  }))}
                />
              ) : (
                <p className="text-[0.85rem] text-body">No checks recorded yet.</p>
              )}
            </div>
          </Panel>
        </div>

        <Panel title="Competitor share of voice" sub="Vendors named alongside you in the latest run">
          <div className="p-5">
            {v.competitorShare.length ? (
              <BarList rows={v.competitorShare.map((c) => ({
                label: c.domain, value: c.mentions, sub: `${pct(c.share)} of all competitor mentions`,
              }))} />
            ) : (
              <p className="text-[0.85rem] text-body">No competitors were named in the latest run.</p>
            )}
          </div>
        </Panel>

        <PromptManager
          projectId={project.id}
          category={project.description || 'SEO software'}
          remaining={entitlements.remaining.prompts}
        />

        <Panel title="Prompt performance" sub="Sorted by mention rate, weakest first. Prompts with no observation are gaps in measurement, not in visibility.">
          {v.promptRows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[46rem]">
                <caption className="sr-only">Per-prompt mention and citation rates</caption>
                <thead>
                  <tr className="border-b border-line">
                    <th scope="col" className="table-head px-5 py-3 text-left">Prompt</th>
                    <th scope="col" className="table-head px-5 py-3 text-left">Cluster</th>
                    <th scope="col" className="table-head px-5 py-3 text-right">Observed</th>
                    <th scope="col" className="table-head px-5 py-3 text-right">Mentioned</th>
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
                        {p.observed}/{p.engines}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {p.mentionRate === null ? (
                          <span className="text-[0.8rem] text-body">Not measured</span>
                        ) : (
                          <span className={`text-[0.85rem] font-bold tabular-nums ${p.mentionRate === 0 ? 'text-bad' : p.mentionRate >= 0.5 ? 'text-ok' : 'text-warn'}`}>
                            {pct(p.mentionRate)}
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
