import { redirect } from 'next/navigation';
import { BarList, LineChart } from '@/components/app/Chart';
import { Badge, CapabilityUnavailable, EmptyState, PageHeader, Panel, StatTile } from '@/components/app/ui';
import { engineName } from '@/lib/ai/engines';
import { ExportButton } from '@/components/app/ExportButton';
import { getSession, resolveProject } from '@/lib/auth';
import { getLeads } from '@/lib/dashboard';
import { CAPABILITIES } from '@/lib/capabilities';
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
        title="Referral events"
        sub="Visits the WordPress plugin saw arriving from an assistant. These are unverified page views, not confirmed leads."
        action={<ExportButton resource="leads" />}
      />

      <div className="mt-6 space-y-6">
        <CapabilityUnavailable
          title="Referral telemetry is not a verified lead source"
          status={CAPABILITIES.lead_attribution.status}
          reason={CAPABILITIES.lead_attribution.source}
        />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatTile label="Referral events" value={summary.total} sub="All sources, last 60 days" />
          <StatTile label="From AI assistants" value={summary.ai} sub={`${pct(aiShare)} of all events`} />
          <StatTile label="Attributed value" value={money(summary.aiValue)} sub="Entered by hand — not measured revenue" />
          <StatTile label="Total attributed value" value={money(summary.value)} sub="Entered by hand — not measured revenue" />
          <StatTile label="Marked won" value={summary.won} sub={`${pct(summary.total ? summary.won / summary.total : 0)} of events`} />
        </div>

        <div className="grid items-start gap-6 xl:grid-cols-[1.5fr_1fr]">
          <Panel title="Referral events per week" sub="Last 8 weeks, all sources">
            <div className="p-5">
              <LineChart points={weekly} label="Referral events captured per week" height={210} color="#12A150" />
            </div>
          </Panel>

          <Panel title="Referral events by engine" sub="Referrer the plugin reported — caller-supplied and forgeable">
            <div className="p-5">
              {byEngine.length ? (
                <BarList rows={byEngine.map((e) => ({ label: e.name, value: e.count, color: e.color }))} />
              ) : (
                <p className="text-[0.85rem] text-body">No assistant referral events recorded yet.</p>
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
