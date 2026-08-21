import { redirect } from 'next/navigation';
import { Sparkline } from '@/components/app/Chart';
import { Badge, EmptyState, PageHeader, Panel, StatTile } from '@/components/app/ui';
import { ExportButton } from '@/components/app/ExportButton';
import { getSession, resolveProject } from '@/lib/auth';
import { getKeywords } from '@/lib/dashboard';
import { getEntitlements } from '@/lib/plan';
import { providerConfigured } from '@/lib/seo/providers/keyword-data';
import { compact, money, pct } from '@/lib/utils';
import { BriefButton } from './BriefButton';
import { DeleteKeyword, KeywordManager } from './KeywordManager';

export const dynamic = 'force-dynamic';

const INTENT_TONE = {
  transactional: 'good', commercial: 'brand', navigational: 'neutral', informational: 'neutral',
} as const;

export default async function KeywordsPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  const project = await resolveProject(session.orgId);
  if (!project) redirect('/app');

  const [{ rows, summary }, entitlements] = await Promise.all([
    getKeywords(project.id),
    getEntitlements(session.orgId),
  ]);

  const estimatedCount = rows.filter((r) => r.dataSource !== 'measured').length;

  return (
    <>
      <PageHeader
        title="Keywords"
        sub="Every tracked term with its difficulty, forecast traffic and eight-factor opportunity score."
        action={<ExportButton resource="keywords" />}
      />

      <div className="mt-6 space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatTile label="Tracked" value={summary.total} sub={`${summary.top100} ranking in top 100`} />
          <StatTile label="Top 3" value={summary.top3} sub={`${summary.top10} in the top 10`} tone="good" />
          <StatTile label="Est. monthly traffic" value={summary.traffic} sub="AI-Overview-aware forecast" />
          <StatTile label="Traffic value" value={money(summary.value)} sub="Equivalent paid-search cost" />
          <StatTile label="Quick wins" value={summary.quickWins} sub="Positions 4-20, low difficulty" tone="good" />
        </div>

        {estimatedCount > 0 && (
          <p className="rounded-xl bg-warn/10 p-4 text-[0.84rem] leading-relaxed text-ink ring-1 ring-warn/25">
            <strong className="font-semibold">
              {estimatedCount === rows.length
                ? 'Volume, difficulty and CPC are modelled, not measured.'
                : `${estimatedCount} of ${rows.length} keywords use modelled metrics.`}
            </strong>{' '}
            {providerConfigured()
              ? 'Your data provider had no figures for these terms, so the in-product model filled the gap. Rows marked "est." are modelled.'
              : 'No keyword data provider is connected, so these come from the in-product model — derived from phrase length and commercial intent. They are internally consistent and fine for ranking work against each other, but they are not search-volume measurements. Connect DataForSEO to replace them.'}
          </p>
        )}

        <KeywordManager projectId={project.id} remaining={entitlements.remaining.keywords} />

        <Panel
          title="All keywords"
          sub={`Sorted by opportunity score · share of voice ${pct(summary.shareOfVoice)}`}
        >
          {rows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[62rem]">
                <caption className="sr-only">Tracked keywords with position, volume, difficulty and opportunity</caption>
                <thead>
                  <tr className="border-b border-line">
                    <th scope="col" className="table-head px-5 py-3 text-left">Keyword</th>
                    <th scope="col" className="table-head px-5 py-3 text-left">Intent</th>
                    <th scope="col" className="table-head px-5 py-3 text-right">Position</th>
                    <th scope="col" className="table-head px-5 py-3 text-right">30d</th>
                    <th scope="col" className="table-head px-5 py-3 text-left">Trend</th>
                    <th scope="col" className="table-head px-5 py-3 text-right">Volume</th>
                    <th scope="col" className="table-head px-5 py-3 text-right">KD</th>
                    <th scope="col" className="table-head px-5 py-3 text-right">Traffic</th>
                    <th scope="col" className="table-head px-5 py-3 text-right">Value</th>
                    <th scope="col" className="table-head px-5 py-3 text-right">Opportunity</th>
                    <th scope="col" className="px-5 py-3"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((k) => (
                    <tr key={k.id} className="hover:bg-surface-alt/60">
                      <td className="px-5 py-3 text-[0.875rem] font-semibold text-ink">
                        {k.phrase}
                        {k.band === 'quick-win' && <span className="ml-2"><Badge tone="good">Quick win</Badge></span>}
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={INTENT_TONE[k.intent as keyof typeof INTENT_TONE] ?? 'neutral'}>
                          {k.intent.slice(0, 4)}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-right text-[0.875rem] font-bold tabular-nums text-ink">
                        {k.position || '—'}
                      </td>
                      <td className="px-5 py-3 text-right text-[0.8rem] tabular-nums">
                        {k.delta === 0 ? (
                          <span className="text-body/50">—</span>
                        ) : (
                          <span className={k.delta > 0 ? 'font-bold text-ok' : 'font-bold text-bad'}>
                            {k.delta > 0 ? '▲' : '▼'} {Math.abs(k.delta)}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <Sparkline points={k.history} invert color={k.delta >= 0 ? '#12A150' : '#E5484D'} />
                      </td>
                      <td className="px-5 py-3 text-right text-[0.85rem] tabular-nums text-body">
                        {compact(k.volume)}
                        {k.dataSource !== 'measured' && (
                          <span
                            className="ml-1 text-[0.65rem] font-bold uppercase text-warn"
                            title="Modelled, not measured"
                          >
                            est.
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right text-[0.85rem] tabular-nums text-body">{k.difficulty}</td>
                      <td className="px-5 py-3 text-right text-[0.85rem] tabular-nums text-body">{compact(k.traffic)}</td>
                      <td className="px-5 py-3 text-right text-[0.85rem] tabular-nums text-body">{money(k.value)}</td>
                      <td className="px-5 py-3 text-right">
                        <span className="font-heading text-[1rem] font-extrabold tabular-nums text-brand">
                          {k.opportunity}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span className="flex items-center justify-end gap-0.5">
                          <BriefButton projectId={project.id} keywordId={k.id} phrase={k.phrase} />
                          <DeleteKeyword id={k.id} phrase={k.phrase} />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No keywords yet" body="Import a keyword list or connect Search Console to populate this view." cta={{ label: 'Settings', href: '/app/settings' }} />
          )}
        </Panel>
      </div>
    </>
  );
}
