import { redirect } from 'next/navigation';
import { CheckCircle2, XCircle } from 'lucide-react';
import { PageHeader, Panel, StatTile } from '@/components/app/ui';
import { ApiKeyManager } from './ApiKeyManager';
import { ENGINES, isEngineLive } from '@/lib/ai/engines';
import { getSession, resolveProject } from '@/lib/auth';
import { db } from '@/lib/db';
import { getEntitlements } from '@/lib/plan';
import { CompetitorManager, ProjectForm } from './WorkspaceForms';
import { WordPressConnect } from './WordPressConnect';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  const project = await resolveProject(session.orgId);
  if (!project) redirect('/app');

  const [org, competitors, connection, apiKeys, counts, entitlements] = await Promise.all([
    db.organization.findUnique({ where: { id: session.orgId } }),
    db.competitor.findMany({ where: { projectId: project.id } }),
    db.siteConnection.findFirst({ where: { projectId: project.id } }),
    db.apiKey.findMany({ where: { projectId: project.id }, orderBy: { createdAt: 'desc' } }),
    Promise.all([
      db.keyword.count({ where: { projectId: project.id } }),
      db.aiPrompt.count({ where: { projectId: project.id } }),
      db.article.count({ where: { projectId: project.id } }),
    ]),
    getEntitlements(session.orgId),
  ]);

  const [keywordCount, promptCount, articleCount] = counts;
  const engineStatus = ENGINES.map((e) => ({
    ...e,
    live: isEngineLive(e.id),
    measurable: e.availability === 'available',
    unavailableReason: 'unavailableReason' in e ? e.unavailableReason : '',
  }));
  const liveCount = engineStatus.filter((e) => e.live).length;
  const measurableCount = engineStatus.filter((e) => e.measurable).length;

  return (
    <>
      <PageHeader title="Settings" sub="Project configuration, engine credentials and the WordPress connection." />

      <div className="mt-6 space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile label="Plan" value={(org?.plan ?? 'growth').replace(/^./, (c) => c.toUpperCase())} sub="Billed monthly" />
          <StatTile label="Tracked keywords" value={keywordCount} sub="Across this project" />
          <StatTile label="Tracked prompts" value={promptCount} sub="Run against every engine" />
          <StatTile label="Content pieces" value={articleCount} sub="Draft through published" />
        </div>

        <Panel title="Plan usage" sub={`${entitlements.plan.label} plan`}>
          <dl className="divide-y divide-line">
            <UsageRow
              label="Projects" used={entitlements.usage.projects} limit={entitlements.plan.projects}
            />
            <UsageRow
              label="Tracked prompts" used={entitlements.usage.prompts} limit={entitlements.plan.prompts}
            />
            <UsageRow
              label="Tracked keywords" used={entitlements.usage.keywords} limit={entitlements.plan.keywords}
            />
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
              <dt className="text-[0.85rem] font-semibold text-ink">Check frequency</dt>
              <dd className="text-[0.875rem] text-body">{entitlements.plan.frequency}</dd>
            </div>
          </dl>
        </Panel>

        <ProjectForm
          project={{
            id: project.id,
            name: project.name,
            domain: project.domain,
            description: project.description,
            country: project.country,
          }}
        />

        <CompetitorManager
          projectId={project.id}
          competitors={competitors.map((c) => ({ id: c.id, domain: c.domain, label: c.label || c.domain }))}
        />

        <Panel
          title="Answer engine credentials"
          sub={`${liveCount} of ${measurableCount} measurable surfaces are connected. An unconnected surface is skipped and recorded as unavailable — it is never simulated in a live workspace.`}
        >
          <ul className="divide-y divide-line">
            {engineStatus.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: e.color }} aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-[0.9rem] font-semibold text-ink">{e.name}</p>
                    <p className="text-[0.75rem] text-body">
                      {e.measurable ? (
                        <>
                          {e.vendor} · set <code className="rounded bg-surface-alt px-1.5 py-0.5">{e.envKey}</code> to go live
                        </>
                      ) : (
                        <>{e.vendor} · {e.unavailableReason}</>
                      )}
                    </p>
                  </div>
                </div>
                {e.live ? (
                  <span className="flex shrink-0 items-center gap-1.5 text-[0.8rem] font-bold text-ok">
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    Live
                  </span>
                ) : (
                  <span className="flex shrink-0 items-center gap-1.5 text-[0.8rem] font-semibold text-body">
                    <XCircle className="h-4 w-4" aria-hidden="true" />
                    {e.measurable ? 'Not connected' : 'Unavailable'}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <p className="border-t border-line px-5 py-4 text-[0.82rem] leading-relaxed text-body">
            Credentials are read from the server environment and are never stored in the database or
            sent to the browser. Restart the app after adding one.
          </p>
        </Panel>

        <WordPressConnect
          projectId={project.id}
          connection={
            connection
              ? {
                  siteUrl: connection.siteUrl,
                  username: connection.username,
                  status: connection.status,
                  lastSyncAt: connection.lastSyncAt?.toISOString() ?? null,
                }
              : null
          }
        />

        <ApiKeyManager
          projectId={project.id}
          keys={apiKeys.map((k) => ({
            id: k.id,
            label: k.label,
            prefix: k.prefix,
            createdAt: k.createdAt.toISOString(),
            lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
            overlapExpiresAt: k.overlapExpiresAt?.toISOString() ?? null,
          }))}
        />
      </div>
    </>
  );
}

/** Consumption against an entitlement, with a bar once a limit is finite. */
function UsageRow({ label, used, limit }: { label: string; used: number; limit: number }) {
  const unlimited = !Number.isFinite(limit);
  const ratio = unlimited ? 0 : Math.min(1, used / Math.max(1, limit));

  return (
    <div className="px-5 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <dt className="text-[0.85rem] font-semibold text-ink">{label}</dt>
        <dd className="text-[0.875rem] tabular-nums text-body">
          {used.toLocaleString()} / {unlimited ? 'Unlimited' : limit.toLocaleString()}
        </dd>
      </div>
      {!unlimited && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-alt">
          <div
            className={`h-full rounded-full ${ratio >= 0.9 ? 'bg-bad' : ratio >= 0.7 ? 'bg-warn' : 'bg-brand'}`}
            style={{ width: `${Math.max(2, ratio * 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}
