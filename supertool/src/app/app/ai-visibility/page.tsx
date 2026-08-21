import { redirect } from 'next/navigation';
import { BarList, LineChart } from '@/components/app/Chart';
import { Badge, EmptyState, PageHeader, Panel, SimulationNotice, StatTile } from '@/components/app/ui';
import { RunCheckButton } from './RunCheckButton';
import { getSession, resolveProject } from '@/lib/auth';
import { getAiVisibility } from '@/lib/dashboard';
import { pct } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function AiVisibilityPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  const project = await resolveProject(session.orgId);
  if (!project) redirect('/app');

  const v = await getAiVisibility(project.id);
  const delta = v.rollup.score - v.previousScore;

  return (
    <>
      <PageHeader
        title="AI Visibility"
        sub={`How often the six answer engines name ${project.name} when buyers ask.`}
        action={<RunCheckButton projectId={project.id} />}
      />

      <div className="mt-6 space-y-6">
        <SimulationNotice show={v.simulated} />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile label="Visibility score" value={v.rollup.score} delta={delta} sub="Blended across all engines"
            tone={v.rollup.score >= 60 ? 'good' : v.rollup.score >= 35 ? 'warn' : 'bad'} />
          <StatTile label="Mention rate" value={pct(v.rollup.mentionRate)} sub="Answers naming your brand" />
          <StatTile label="Citation rate" value={pct(v.rollup.citationRate)} sub="Answers citing your own URLs" />
          <StatTile label="Avg mention rank" value={v.rollup.avgMentionRank || '—'} sub="Position among named vendors" />
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
                    label: e.name, value: e.score, color: e.color,
                    sub: `${e.checks} checks · named ${pct(e.mentionRate)} · cited ${pct(e.citationRate)}`,
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

        <Panel title="Prompt performance" sub="Sorted by mention rate, weakest first — these are your content gaps">
          {v.promptRows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[46rem]">
                <caption className="sr-only">Per-prompt mention and citation rates</caption>
                <thead>
                  <tr className="border-b border-line">
                    <th scope="col" className="table-head px-5 py-3 text-left">Prompt</th>
                    <th scope="col" className="table-head px-5 py-3 text-left">Cluster</th>
                    <th scope="col" className="table-head px-5 py-3 text-right">Engines</th>
                    <th scope="col" className="table-head px-5 py-3 text-right">Mentioned</th>
                    <th scope="col" className="table-head px-5 py-3 text-right">Cited</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {v.promptRows.map((p) => (
                    <tr key={p.id} className="hover:bg-surface-alt/60">
                      <td className="max-w-md px-5 py-3.5 text-[0.875rem] text-ink">{p.text}</td>
                      <td className="px-5 py-3.5"><Badge>{p.cluster}</Badge></td>
                      <td className="px-5 py-3.5 text-right text-[0.85rem] tabular-nums text-body">{p.engines}</td>
                      <td className="px-5 py-3.5 text-right">
                        <span className={`text-[0.85rem] font-bold tabular-nums ${p.mentionRate === 0 ? 'text-bad' : p.mentionRate >= 0.5 ? 'text-ok' : 'text-warn'}`}>
                          {pct(p.mentionRate)}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right text-[0.85rem] tabular-nums text-body">{pct(p.citationRate)}</td>
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
