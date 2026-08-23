import { redirect } from 'next/navigation';
import { Badge, EmptyState, PageHeader, Panel, StatTile } from '@/components/app/ui';
import { PublishButton } from './PublishButton';
import { ScoreDraft } from './ScoreDraft';
import { ExportButton } from '@/components/app/ExportButton';
import { getSession, resolveProject } from '@/lib/auth';
import { getArticles } from '@/lib/dashboard';
import { db } from '@/lib/db';
import { compact } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const STATUS_TONE = {
  published: 'good', scheduled: 'brand', review: 'warn', draft: 'neutral',
} as const;

function scoreTone(n: number) {
  return n >= 80 ? 'text-ok' : n >= 60 ? 'text-warn' : 'text-bad';
}

export default async function ContentPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  const project = await resolveProject(session.orgId);
  if (!project) redirect('/app');

  const [{ articles, summary }, connection] = await Promise.all([
    getArticles(project.id),
    db.siteConnection.findFirst({ where: { projectId: project.id, platform: 'wordpress' } }),
  ]);
  const wpConnected = connection?.status === 'connected';

  return (
    <>
      <PageHeader
        title="Content"
        sub="Every piece with its on-page SEO score and its GEO score — the grade that decides whether an answer engine can quote it."
        action={<ExportButton resource="articles" />}
      />

      <div className="mt-6 space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatTile label="Total pieces" value={summary.total} sub={`${summary.published} published`} />
          <StatTile label="In progress" value={summary.inProgress} sub="Draft, review or scheduled" />
          <StatTile label="Avg SEO score" value={summary.avgSeo} tone={summary.avgSeo >= 75 ? 'good' : 'warn'} sub="Classic on-page checks" />
          <StatTile label="Avg GEO score" value={summary.avgAiReady} tone={summary.avgAiReady >= 70 ? 'good' : 'warn'} sub="Answer-engine readiness" />
          <StatTile label="Words published" value={summary.words} sub="Across all pieces" />
        </div>

        <ScoreDraft />

        <Panel title="Content pipeline" sub="Sorted by status, then most recently updated">
          {articles.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[54rem]">
                <caption className="sr-only">Articles with status, scores and word counts</caption>
                <thead>
                  <tr className="border-b border-line">
                    <th scope="col" className="table-head px-5 py-3 text-left">Title</th>
                    <th scope="col" className="table-head px-5 py-3 text-left">Status</th>
                    <th scope="col" className="table-head px-5 py-3 text-right">Words</th>
                    <th scope="col" className="table-head px-5 py-3 text-right">SEO</th>
                    <th scope="col" className="table-head px-5 py-3 text-right">GEO</th>
                    <th scope="col" className="table-head px-5 py-3 text-right">Flesch</th>
                    <th scope="col" className="table-head px-5 py-3 text-left">Published</th>
                    <th scope="col" className="table-head px-5 py-3 text-right">WordPress</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {articles.map((a) => (
                    <tr key={a.id} className="hover:bg-surface-alt/60">
                      <td className="max-w-sm px-5 py-3.5">
                        <p className="truncate text-[0.875rem] font-semibold text-ink">{a.title}</p>
                        <p className="truncate text-[0.75rem] text-body">/{a.slug}</p>
                      </td>
                      <td className="px-5 py-3.5">
                        <Badge tone={STATUS_TONE[a.status as keyof typeof STATUS_TONE] ?? 'neutral'}>
                          {a.status}
                        </Badge>
                      </td>
                      <td className="px-5 py-3.5 text-right text-[0.85rem] tabular-nums text-body">{compact(a.wordCount)}</td>
                      <td className={`px-5 py-3.5 text-right text-[0.9rem] font-bold tabular-nums ${scoreTone(a.seoScore)}`}>{a.seoScore}</td>
                      <td className={`px-5 py-3.5 text-right text-[0.9rem] font-bold tabular-nums ${scoreTone(a.aiReadyScore)}`}>{a.aiReadyScore}</td>
                      <td className="px-5 py-3.5 text-right text-[0.85rem] tabular-nums text-body">{a.readability}</td>
                      <td className="px-5 py-3.5 text-[0.8rem] text-body">
                        {a.publishedAt
                          ? a.publishedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                          : '—'}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <PublishButton
                          articleId={a.id}
                          hasBody={a.body.trim().length > 0}
                          connected={wpConnected}
                          publishedUrl={a.publishedUrl}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No content yet" body="Create a brief to start the pipeline." />
          )}
        </Panel>
      </div>
    </>
  );
}
