import { redirect } from 'next/navigation';
import { Sparkline } from '@/components/app/Chart';
import { Badge, CapabilityUnavailable, DemoDataNotice, EmptyState, PageHeader, Panel, SourceTag, StatTile } from '@/components/app/ui';
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

  const [{ rows, summary, rankSource, keywordSource }, entitlements] = await Promise.all([
    getKeywords(project.id, { dataMode: project.dataMode }),
    getEntitlements(session.orgId),
  ]);

  const estimatedCount = rows.filter((r) => r.dataSource !== 'measured').length;
  const ranksShown = rankSource.shown;

  return (
    <>
      <PageHeader
        title="Keywords"
        sub="Every tracked term with its difficulty and eight-factor opportunity score. Each figure is labelled with where it came from."
        action={<ExportButton resource="keywords" />}
      />

      <div className="mt-6 space-y-6">
        {rankSource.demo && <DemoDataNotice what="Every keyword, position and forecast below" />}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatTile label="Tracked" value={summary.total} sub={ranksShown ? `${summary.top100} ranking in top 100` : 'No position data'} />
          <StatTile
            label="Top 3"
            value={summary.top3 ?? '—'}
            sub={ranksShown ? `${summary.top10} in the top 10` : 'Needs a SERP provider'}
            tone={ranksShown ? 'good' : 'default'}
          />
          <StatTile
            label="Est. monthly traffic"
            value={summary.traffic ?? '—'}
            sub={ranksShown ? 'Modelled from position and volume — an estimate, not measured traffic' : 'Needs a position to forecast from'}
          />
          <StatTile
            label="Traffic value"
            value={summary.value === null ? '—' : money(summary.value)}
            sub={ranksShown ? 'Estimated equivalent paid-search cost' : 'Needs a position to forecast from'}
          />
          <StatTile label="Quick wins" value={summary.quickWins} sub="Low difficulty, high opportunity" tone="good" />
        </div>

        {!ranksShown && (
          <CapabilityUnavailable
            title="Search positions are not tracked"
            status="unavailable"
            reason={rankSource.reason}
          />
        )}

        {estimatedCount > 0 && (
          <p className="rounded-xl bg-warn/10 p-4 text-[0.84rem] leading-relaxed text-ink ring-1 ring-warn/25">
            <strong className="font-semibold">
              {estimatedCount === rows.length
                ? 'Volume, difficulty and CPC are modelled, not measured.'
                : `${estimatedCount} of ${rows.length} keywords use modelled metrics.`}
            </strong>{' '}
            {providerConfigured()
              ? 'Your data provider had no figures for these terms, so the in-product model filled the gap. Every column below is tagged with its own source.'
              : keywordSource.reason +
                ' The model derives figures from phrase length and commercial intent. They are internally consistent and fine for ranking terms against each other, but they are not search-volume measurements. Connect DataForSEO to replace them.'}
            {' '}Difficulty is never fully measured: no provider publishes organic difficulty, so where a provider is connected it is blended with the in-product model and tagged as part-modelled.
          </p>
        )}

        <KeywordManager projectId={project.id} remaining={entitlements.remaining.keywords} />

        <Panel
          title="All keywords"
          sub={
            summary.shareOfVoice === null
              ? 'Sorted by opportunity score'
              : `Sorted by opportunity score · share of voice ${pct(summary.shareOfVoice)}`
          }
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
                    <th scope="col" className="table-head px-5 py-3 text-right">Est. traffic</th>
                    <th scope="col" className="table-head px-5 py-3 text-right">Est. value</th>
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
                        {k.position === null ? (
                          <span className="text-[0.75rem] font-normal text-body/60" title={rankSource.reason}>
                            not tracked
                          </span>
                        ) : (
                          k.position || '—'
                        )}
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
                        <SourceTag source={k.sources.volume} />
                      </td>
                      <td className="px-5 py-3 text-right text-[0.85rem] tabular-nums text-body">
                        {k.difficulty}
                        <SourceTag source={k.sources.difficulty} />
                      </td>
                      <td className="px-5 py-3 text-right text-[0.85rem] tabular-nums text-body">
                        {k.traffic === null ? '—' : `~${compact(k.traffic)}`}
                      </td>
                      <td className="px-5 py-3 text-right text-[0.85rem] tabular-nums text-body">
                        {k.value === null ? '—' : `~${money(k.value)}`}
                      </td>
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
            <EmptyState title="No keywords yet" body="Add a keyword list to populate this view." cta={{ label: 'Settings', href: '/app/settings' }} />
          )}
        </Panel>
      </div>
    </>
  );
}
