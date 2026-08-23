import { redirect } from 'next/navigation';
import { BarList } from '@/components/app/Chart';
import { ExportButton } from '@/components/app/ExportButton';
import { Badge, CapabilityUnavailable, DemoDataNotice, EmptyState, PageHeader, Panel, StatTile } from '@/components/app/ui';
import { getSession, resolveProject } from '@/lib/auth';
import { backlinkSource } from '@/lib/data-sources';
import { db } from '@/lib/db';
import { domainAuthority } from '@/lib/seo/metrics';
import { pct } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function BacklinksPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  const project = await resolveProject(session.orgId);
  if (!project) redirect('/app');

  // SuperTool has no backlink provider and no link index of its own. Seeded
  // rows exist only in the demo workspace; a real project is told the truth
  // rather than shown an empty table that reads as "you have no backlinks".
  const source = backlinkSource();
  const showBacklinks = source.connected || project.dataMode === 'demo';

  if (!showBacklinks) {
    return (
      <>
        <PageHeader title="Backlinks" sub="Referring domains and link authority." />
        <div className="mt-6">
          <CapabilityUnavailable
            title="Backlink data is not available"
            status="unavailable"
            reason={source.reason}
          />
        </div>
      </>
    );
  }

  const backlinks = await db.backlink.findMany({
    where: { projectId: project.id },
    orderBy: [{ authority: 'desc' }, { firstSeen: 'desc' }],
  });

  const referringDomains = new Set(
    backlinks.map((b) => {
      try { return new URL(b.sourceUrl).hostname.replace(/^www\./, ''); } catch { return b.sourceUrl; }
    }),
  );

  const dofollow = backlinks.filter((b) => b.dofollow).length;
  const dofollowRatio = backlinks.length ? dofollow / backlinks.length : 0;
  const avgAuthority = backlinks.length
    ? Math.round(backlinks.reduce((s, b) => s + b.authority, 0) / backlinks.length)
    : 0;

  const authority = domainAuthority({
    referringDomains: referringDomains.size,
    backlinks: backlinks.length,
    dofollowRatio,
    avgLinkingAuthority: avgAuthority,
  });

  // Which of our pages attract links, and which anchors dominate.
  const byTarget = new Map<string, number>();
  const byAnchor = new Map<string, number>();
  for (const b of backlinks) {
    let path = b.targetUrl;
    try { path = new URL(b.targetUrl).pathname || '/'; } catch { /* keep raw */ }
    byTarget.set(path, (byTarget.get(path) ?? 0) + 1);
    const anchor = b.anchor.trim() || '(no anchor text)';
    byAnchor.set(anchor, (byAnchor.get(anchor) ?? 0) + 1);
  }

  const topTargets = [...byTarget.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const topAnchors = [...byAnchor.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

  return (
    <>
      <PageHeader
        title="Backlinks"
        sub="Referring domains, anchor distribution and the pages earning links — the authority half of why a keyword is hard."
        action={<ExportButton resource="backlinks" />}
      />

      {project.dataMode === 'demo' && (
        <div className="mt-6">
          <DemoDataNotice what="Every referring domain, anchor and authority figure below" />
        </div>
      )}

      <div className="mt-6 space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatTile
            label="Domain authority" value={authority}
            sub="Log-scaled from referring domains and link quality"
            tone={authority >= 50 ? 'good' : authority >= 25 ? 'warn' : 'bad'}
          />
          <StatTile label="Backlinks" value={backlinks.length} sub="Total links found" />
          <StatTile label="Referring domains" value={referringDomains.size} sub="Unique linking sites" />
          <StatTile label="Dofollow" value={pct(dofollowRatio)} sub={`${dofollow} of ${backlinks.length} pass authority`} />
          <StatTile label="Avg link authority" value={avgAuthority} sub="Of the linking pages" />
        </div>

        {backlinks.length === 0 ? (
          <Panel title="No backlinks yet">
            <EmptyState
              title="Nothing to show"
              body="Connect a backlink data provider, or import a CSV export from your existing tool, to populate this view."
              cta={{ label: 'Go to settings', href: '/app/settings' }}
            />
          </Panel>
        ) : (
          <>
            <div className="grid items-start gap-6 lg:grid-cols-2">
              <Panel title="Most linked pages" sub="Where authority is landing on your site">
                <div className="p-5">
                  <BarList rows={topTargets.map(([path, count]) => ({ label: path, value: count }))} />
                </div>
              </Panel>

              <Panel title="Anchor text" sub="Over-optimised anchors are a risk signal">
                <div className="p-5">
                  <BarList rows={topAnchors.map(([anchor, count]) => ({ label: anchor, value: count }))} />
                </div>
              </Panel>
            </div>

            <Panel title="All backlinks" sub="Strongest first">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[52rem]">
                  <caption className="sr-only">Backlinks with source, target, anchor and authority</caption>
                  <thead>
                    <tr className="border-b border-line">
                      <th scope="col" className="table-head px-5 py-3 text-left">Source</th>
                      <th scope="col" className="table-head px-5 py-3 text-left">Anchor</th>
                      <th scope="col" className="table-head px-5 py-3 text-left">Target</th>
                      <th scope="col" className="table-head px-5 py-3 text-left">Type</th>
                      <th scope="col" className="table-head px-5 py-3 text-right">Authority</th>
                      <th scope="col" className="table-head px-5 py-3 text-left">First seen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {backlinks.slice(0, 100).map((b) => (
                      <tr key={b.id} className="hover:bg-surface-alt/60">
                        <td className="max-w-xs px-5 py-3">
                          <p className="truncate text-[0.85rem] font-semibold text-ink">{hostOf(b.sourceUrl)}</p>
                          <p className="truncate text-[0.75rem] text-body">{b.sourceUrl}</p>
                        </td>
                        <td className="max-w-[14rem] px-5 py-3">
                          <p className="truncate text-[0.82rem] text-body">{b.anchor || '—'}</p>
                        </td>
                        <td className="max-w-[14rem] px-5 py-3">
                          <p className="truncate text-[0.82rem] text-body">{pathOf(b.targetUrl)}</p>
                        </td>
                        <td className="px-5 py-3">
                          <Badge tone={b.dofollow ? 'good' : 'neutral'}>{b.dofollow ? 'dofollow' : 'nofollow'}</Badge>
                        </td>
                        <td className="px-5 py-3 text-right text-[0.85rem] font-bold tabular-nums text-ink">
                          {b.authority}
                        </td>
                        <td className="px-5 py-3 text-[0.8rem] text-body">
                          {b.firstSeen.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {backlinks.length > 100 && (
                <p className="border-t border-line px-5 py-3 text-[0.8rem] text-body">
                  Showing the strongest 100 of {backlinks.length.toLocaleString()}. Export for the full set.
                </p>
              )}
            </Panel>
          </>
        )}
      </div>
    </>
  );
}

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

function pathOf(url: string): string {
  try { return new URL(url).pathname || '/'; } catch { return url; }
}
