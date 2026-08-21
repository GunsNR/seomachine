import { redirect } from 'next/navigation';
import { CheckCircle2, XCircle } from 'lucide-react';
import { Badge, PageHeader, Panel, StatTile } from '@/components/app/ui';
import { ApiKeyManager } from './ApiKeyManager';
import { ENGINES, isEngineLive } from '@/lib/ai/engines';
import { getSession, resolveProject } from '@/lib/auth';
import { db } from '@/lib/db';
import { brand } from '../../../../brand.config';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  const project = await resolveProject(session.orgId);
  if (!project) redirect('/app');

  const [org, competitors, connection, apiKeys, counts] = await Promise.all([
    db.organization.findUnique({ where: { id: session.orgId } }),
    db.competitor.findMany({ where: { projectId: project.id } }),
    db.siteConnection.findFirst({ where: { projectId: project.id } }),
    db.apiKey.findMany({ where: { projectId: project.id }, orderBy: { createdAt: 'desc' } }),
    Promise.all([
      db.keyword.count({ where: { projectId: project.id } }),
      db.aiPrompt.count({ where: { projectId: project.id } }),
      db.article.count({ where: { projectId: project.id } }),
    ]),
  ]);

  const [keywordCount, promptCount, articleCount] = counts;
  const engineStatus = ENGINES.map((e) => ({ ...e, live: isEngineLive(e.id) }));
  const liveCount = engineStatus.filter((e) => e.live).length;

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

        <Panel title="Project">
          <dl className="divide-y divide-line">
            <Row label="Name" value={project.name} />
            <Row label="Domain" value={project.domain} />
            <Row label="Country" value={project.country.toUpperCase()} />
            <Row
              label="Competitors"
              value={competitors.length ? competitors.map((c) => c.label || c.domain).join(', ') : 'None configured'}
            />
          </dl>
        </Panel>

        <Panel
          title="Answer engine credentials"
          sub={`${liveCount} of ${ENGINES.length} engines are running live. The rest use the built-in simulator.`}
        >
          <ul className="divide-y divide-line">
            {engineStatus.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: e.color }} aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-[0.9rem] font-semibold text-ink">{e.name}</p>
                    <p className="truncate text-[0.75rem] text-body">
                      {e.vendor} · set <code className="rounded bg-surface-alt px-1.5 py-0.5">{e.envKey}</code> to go live
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
                    Simulated
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

        <Panel title="WordPress connection" sub="Publish articles and render Elementor widgets on your site">
          <dl className="divide-y divide-line">
            <Row
              label="Status"
              value={
                connection ? (
                  <Badge tone={connection.status === 'connected' ? 'good' : 'warn'}>{connection.status}</Badge>
                ) : (
                  <Badge tone="warn">Not connected</Badge>
                )
              }
            />
            <Row label="Site URL" value={connection?.siteUrl ?? '—'} />
            <Row
              label="Last sync"
              value={connection?.lastSyncAt ? connection.lastSyncAt.toLocaleString('en-US') : 'Never'}
            />
            <Row
              label="Plugin"
              value={
                <span className="text-[0.85rem] text-body">
                  Install from <code className="rounded bg-surface-alt px-1.5 py-0.5">wordpress/{brand.slug}</code>, then paste a
                  project key below. Setup guide at <code className="rounded bg-surface-alt px-1.5 py-0.5">/docs/wordpress</code>.
                </span>
              }
            />
          </dl>
        </Panel>

        <ApiKeyManager
          projectId={project.id}
          keys={apiKeys.map((k) => ({
            id: k.id,
            label: k.label,
            prefix: k.prefix,
            createdAt: k.createdAt.toISOString(),
            lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
          }))}
        />
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
      <dt className="text-[0.85rem] font-semibold text-ink">{label}</dt>
      <dd className="text-[0.875rem] text-body">{value}</dd>
    </div>
  );
}
