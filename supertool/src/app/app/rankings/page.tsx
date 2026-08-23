import { redirect } from 'next/navigation';
import { LineChart } from '@/components/app/Chart';
import { CapabilityUnavailable, DemoDataNotice, EmptyState, PageHeader, Panel, StatTile } from '@/components/app/ui';
import { getSession, resolveProject } from '@/lib/auth';
import { getKeywords } from '@/lib/dashboard';
import { compact, money, pct } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function RankingsPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  const project = await resolveProject(session.orgId);
  if (!project) redirect('/app');

  const { rows, summary, rankSource } = await getKeywords(project.id, { dataMode: project.dataMode });

  // Without a SERP provider there is nothing to render here. An empty chart
  // with zeroed tiles would read as "you rank for nothing", which is a claim
  // this product has no basis to make.
  if (!rankSource.shown) {
    return (
      <>
        <PageHeader
          title="Rankings"
          sub="Search position tracking."
        />
        <div className="mt-6">
          <CapabilityUnavailable
            title="Rank tracking is not available"
            status="unavailable"
            reason={`${rankSource.reason} When a provider is connected this page will show positions, movement and click forecasts for the ${rows.length} keywords you already track.`}
          />
        </div>
      </>
    );
  }

  // Average position across everything that ranks, per capture date.
  const byDate = new Map<string, number[]>();
  for (const row of rows) {
    for (const point of row.history) {
      if (point.value < 1 || point.value > 100) continue;
      byDate.set(point.date, [...(byDate.get(point.date) ?? []), point.value]);
    }
  }
  const avgTrend = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => ({
      date,
      value: Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10,
    }));

  const movers = [...rows].filter((r) => r.delta !== 0).sort((a, b) => b.delta - a.delta);
  const gainers = movers.slice(0, 8);
  const losers = movers.slice(-8).reverse();

  return (
    <>
      <PageHeader
        title="Rankings"
        sub="Positions with modelled click forecasts that account for AI Overviews, snippets and ads. Forecasts are estimates, not measured traffic."
      />

      <div className="mt-6 space-y-6">
        {rankSource.demo && <DemoDataNotice what="Every position, movement and forecast below" />}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile label="Avg position" value={avgTrend.at(-1)?.value ?? '—'} sub="Across ranking keywords" />
          <StatTile label="Share of voice" value={summary.shareOfVoice === null ? '—' : pct(summary.shareOfVoice)} sub="Volume-weighted" />
          <StatTile label="Est. traffic" value={summary.traffic ?? '—'} sub="Modelled monthly clicks, not measured" />
          <StatTile label="Est. traffic value" value={summary.value === null ? '—' : money(summary.value)} sub="Modelled equivalent paid cost" />
        </div>

        <Panel title="Average position over time" sub="Lower is better — the axis is inverted">
          <div className="p-5">
            <LineChart points={avgTrend} invert label="Average ranking position over time" height={220} color="#12A150" />
          </div>
        </Panel>

        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Biggest gains" sub="Last 30 days">
            {gainers.length ? (
              <ul className="divide-y divide-line">
                {gainers.map((k) => (
                  <li key={k.id} className="flex items-center justify-between gap-4 px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-[0.875rem] font-semibold text-ink">{k.phrase}</p>
                      <p className="text-[0.75rem] text-body">#{k.position} · {compact(k.volume)}/mo</p>
                    </div>
                    <span className="shrink-0 font-bold tabular-nums text-ok">▲ {k.delta}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No movement yet" body="Positions have not changed since the first capture." />
            )}
          </Panel>

          <Panel title="Biggest drops" sub="Last 30 days">
            {losers.length ? (
              <ul className="divide-y divide-line">
                {losers.map((k) => (
                  <li key={k.id} className="flex items-center justify-between gap-4 px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-[0.875rem] font-semibold text-ink">{k.phrase}</p>
                      <p className="text-[0.75rem] text-body">#{k.position} · {compact(k.volume)}/mo</p>
                    </div>
                    <span className="shrink-0 font-bold tabular-nums text-bad">▼ {Math.abs(k.delta)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No drops" body="Nothing has lost ground in the last 30 days." />
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
