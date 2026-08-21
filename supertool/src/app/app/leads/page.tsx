import { redirect } from 'next/navigation';
import { BarList, LineChart } from '@/components/app/Chart';
import { Badge, EmptyState, PageHeader, Panel, StatTile } from '@/components/app/ui';
import { engineName } from '@/lib/ai/engines';
import { getSession, resolveProject } from '@/lib/auth';
import { getLeads } from '@/lib/dashboard';
import { money, pct } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const STATUS_TONE = {
  won: 'good', demo: 'brand', qualified: 'brand', new: 'neutral', lost: 'bad',
} as const;

const SOURCE_TONE = { ai: 'brand', organic: 'good', direct: 'neutral' } as const;

export default async function LeadsPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  const project = await resolveProject(session.orgId);
  if (!project) redirect('/app');

  const { leads, summary, byEngine, weekly } = await getLeads(project.id);
  const aiShare = summary.total ? summary.ai / summary.total : 0;

  return (
    <>
      <PageHeader
        title="Leads"
        sub="Enquiries attributed back to the channel and the page that earned them — including the AI referrals analytics buckets as direct."
      />

      <div className="mt-6 space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatTile label="Total leads" value={summary.total} sub="All sources, last 60 days" />
          <StatTile label="From AI assistants" value={summary.ai} sub={`${pct(aiShare)} of all leads`} tone="good" />
          <StatTile label="AI pipeline value" value={money(summary.aiValue)} sub="Attributed to answer engines" tone="good" />
          <StatTile label="Total pipeline" value={money(summary.value)} sub="All sources" />
          <StatTile label="Closed won" value={summary.won} sub={`${pct(summary.total ? summary.won / summary.total : 0)} win rate`} />
        </div>

        <div className="grid items-start gap-6 xl:grid-cols-[1.5fr_1fr]">
          <Panel title="Leads per week" sub="Last 8 weeks, all sources">
            <div className="p-5">
              <LineChart points={weekly} label="Leads captured per week" height={210} color="#12A150" />
            </div>
          </Panel>

          <Panel title="AI leads by engine" sub="Which assistant sent them">
            <div className="p-5">
              {byEngine.length ? (
                <BarList rows={byEngine.map((e) => ({ label: e.name, value: e.count, color: e.color }))} />
              ) : (
                <p className="text-[0.85rem] text-body">No AI-attributed leads recorded yet.</p>
              )}
            </div>
          </Panel>
        </div>

        <Panel title="All leads" sub="Newest first">
          {leads.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[52rem]">
                <caption className="sr-only">Captured leads with source, engine, landing page and value</caption>
                <thead>
                  <tr className="border-b border-line">
                    <th scope="col" className="table-head px-5 py-3 text-left">Lead</th>
                    <th scope="col" className="table-head px-5 py-3 text-left">Source</th>
                    <th scope="col" className="table-head px-5 py-3 text-left">Engine</th>
                    <th scope="col" className="table-head px-5 py-3 text-left">Landing page</th>
                    <th scope="col" className="table-head px-5 py-3 text-left">Status</th>
                    <th scope="col" className="table-head px-5 py-3 text-right">Value</th>
                    <th scope="col" className="table-head px-5 py-3 text-left">Captured</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {leads.slice(0, 60).map((l) => (
                    <tr key={l.id} className="hover:bg-surface-alt/60">
                      <td className="px-5 py-3">
                        <p className="text-[0.875rem] font-semibold text-ink">{l.name || '—'}</p>
                        <p className="text-[0.75rem] text-body">{l.email}</p>
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={SOURCE_TONE[l.source as keyof typeof SOURCE_TONE] ?? 'neutral'}>{l.source}</Badge>
                      </td>
                      <td className="px-5 py-3 text-[0.82rem] text-body">
                        {l.engine ? engineName(l.engine) : '—'}
                      </td>
                      <td className="max-w-xs px-5 py-3">
                        <p className="truncate text-[0.8rem] text-body">
                          {l.landingUrl ? new URL(l.landingUrl).pathname : '—'}
                        </p>
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={STATUS_TONE[l.status as keyof typeof STATUS_TONE] ?? 'neutral'}>{l.status}</Badge>
                      </td>
                      <td className="px-5 py-3 text-right text-[0.85rem] tabular-nums text-body">
                        {l.value ? money(l.value) : '—'}
                      </td>
                      <td className="px-5 py-3 text-[0.8rem] text-body">
                        {l.capturedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="No leads captured yet"
              body="Install the WordPress plugin and enable AI referral tracking to start attributing leads."
              cta={{ label: 'Set up tracking', href: '/app/settings' }}
            />
          )}
        </Panel>
      </div>
    </>
  );
}
