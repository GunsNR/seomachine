import { redirect } from 'next/navigation';
import { Badge, EmptyState, PageHeader, Panel, StatTile } from '@/components/app/ui';
import { BarList } from '@/components/app/Chart';
import { RunAuditButton } from './RunAuditButton';
import { getSession, resolveProject } from '@/lib/auth';
import { getLatestAudit } from '@/lib/dashboard';

export const dynamic = 'force-dynamic';

const SEVERITY_TONE = { critical: 'bad', warning: 'warn', notice: 'neutral' } as const;
const CATEGORY_LABEL: Record<string, string> = {
  crawlability: 'Crawlability',
  onpage: 'On-page',
  performance: 'Performance',
  schema: 'Schema',
  'ai-readiness': 'AI readiness',
};

export default async function AuditPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  const project = await resolveProject(session.orgId);
  if (!project) redirect('/app');

  const audit = await getLatestAudit(project.id);

  return (
    <>
      <PageHeader
        title="Site Audit"
        sub="Crawlability, on-page, performance, schema — plus an answer-readiness category no other audit runs."
        action={<RunAuditButton projectId={project.id} domain={project.domain} />}
      />

      <div className="mt-6 space-y-6">
        {!audit ? (
          <div className="rounded-xl bg-white ring-1 ring-line">
            <EmptyState
              title="No audit has run yet"
              body="Crawl your site to grade it across five categories and get a prioritised fix list."
            />
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <StatTile
                label="Health score" value={audit.score}
                sub={`${audit.pagesCrawled} pages crawled`}
                tone={audit.score >= 80 ? 'good' : audit.score >= 60 ? 'warn' : 'bad'}
              />
              <StatTile label="Critical" value={audit.bySeverity.critical} tone="bad" sub="Blocks indexing or breaks pages" />
              <StatTile label="Warnings" value={audit.bySeverity.warning} tone="warn" sub="Costs performance or clarity" />
              <StatTile label="Notices" value={audit.bySeverity.notice} sub="Worth fixing when convenient" />
              <StatTile
                label="Last run"
                value={audit.startedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                sub={audit.status === 'complete' ? 'Completed' : audit.status}
              />
            </div>

            <Panel title="Findings by category">
              <div className="p-5">
                <BarList
                  rows={audit.byCategory.map((c) => ({
                    label: CATEGORY_LABEL[c.category] ?? c.category,
                    value: c.count,
                    color: c.category === 'ai-readiness' ? '#FF6B2C' : '#1466D8',
                  }))}
                />
              </div>
            </Panel>

            <Panel title="All findings" sub="Most severe first, each with a specific fix">
              <ul className="divide-y divide-line">
                {audit.issues.map((issue) => (
                  <li key={issue.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <Badge tone={SEVERITY_TONE[issue.severity as keyof typeof SEVERITY_TONE] ?? 'neutral'}>
                        {issue.severity}
                      </Badge>
                      <Badge tone={issue.category === 'ai-readiness' ? 'brand' : 'neutral'}>
                        {CATEGORY_LABEL[issue.category] ?? issue.category}
                      </Badge>
                    </div>
                    <h3 className="mt-2.5 font-heading text-[0.98rem] font-bold text-ink">{issue.title}</h3>
                    {issue.detail && <p className="mt-1 text-[0.85rem] leading-relaxed text-body">{issue.detail}</p>}
                    <p className="mt-2 truncate text-[0.75rem] text-body/65">{issue.url}</p>
                  </li>
                ))}
              </ul>
            </Panel>
          </>
        )}
      </div>
    </>
  );
}
