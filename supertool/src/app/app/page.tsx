import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight, Sparkles } from 'lucide-react';
import { BarList, LineChart } from '@/components/app/Chart';
import { Badge, EmptyState, PageHeader, Panel, ProvenanceBanner, StatTile } from '@/components/app/ui';
import { getSession, resolveProject } from '@/lib/auth';
import { getOverview } from '@/lib/dashboard';
import { compact, pct } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function OverviewPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const project = await resolveProject(session.orgId);
  if (!project) {
    return (
      <>
        <PageHeader title="Overview" />
        <div className="mt-7 rounded-xl bg-white ring-1 ring-line">
          <EmptyState
            title="No project yet"
            body="Create a project to start tracking answer-engine visibility and rankings."
            cta={{ label: 'Go to settings', href: '/app/settings' }}
          />
        </div>
      </>
    );
  }

  const { visibility, keywords, audit, content, leads, topOpportunities } = await getOverview(project.id, { dataMode: project.dataMode });
  const scoreDelta = visibility.rollup.score - visibility.previousScore;
  // A run in which nothing came back is not a run with a score of zero.
  const anyObserved = visibility.provenance.observed > 0;

  return (
    <>
      <PageHeader
        title="Overview"
        sub={`${project.name} · ${project.domain}`}
        action={
          <Link href="/app/ai-visibility" className="btn btn-sm btn-primary">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            Run visibility check
          </Link>
        }
      />

      <div className="mt-6 space-y-6">
        <ProvenanceBanner provenance={visibility.provenance} />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="AI visibility score"
            value={anyObserved ? visibility.rollup.score : '—'}
            delta={anyObserved ? scoreDelta : undefined}
            sub={
              anyObserved
                ? `${visibility.rollup.checks} observed of ${visibility.provenance.total} checks`
                : 'Nothing observed in the latest run'
            }
            tone={
              anyObserved
                ? visibility.rollup.score >= 60 ? 'good' : visibility.rollup.score >= 35 ? 'warn' : 'bad'
                : 'default'
            }
          />
          <StatTile
            label="Citation rate"
            value={anyObserved ? pct(visibility.rollup.citationRate) : '—'}
            sub="Of answers actually observed"
          />
          <StatTile
            label="Keywords in top 10"
            value={keywords.summary.top10 ?? '—'}
            sub={
              keywords.summary.top10 === null
                ? `${keywords.summary.total} tracked · positions need a SERP provider`
                : `of ${keywords.summary.total} tracked · ${pct(keywords.summary.shareOfVoice ?? 0)} share of voice`
            }
          />
          <StatTile
            label="Referral events"
            value={leads.summary.ai}
            sub="Unverified assistant referrals — not confirmed leads"
          />
        </div>

        <div className="grid items-start gap-6 xl:grid-cols-[1.5fr_1fr]">
          <Panel
            title="AI visibility trend"
            sub="Convenience index across the engines you have connected"
            action={<Link href="/app/ai-visibility" className="text-[0.82rem] font-bold text-brand hover:underline">Details</Link>}
          >
            <div className="p-5">
              <LineChart points={visibility.trend} label="AI visibility score over time" height={260} />
            </div>
          </Panel>

          <Panel title="By engine" sub="Latest run">
            <div className="p-5">
              {visibility.byEngine.length ? (
                <BarList
                  rows={visibility.byEngine.map((e) => ({
                    label: e.name,
                    value: e.score ?? 0,
                    color: e.color,
                    sub: e.observed
                      ? `Named in ${pct(e.mentionRate ?? 0)} · cited in ${pct(e.citationRate ?? 0)}`
                      : `Not measured — ${e.reason || e.status}`,
                  }))}
                  max={100}
                />
              ) : (
                <p className="text-[0.85rem] text-body">No checks recorded yet.</p>
              )}
            </div>
          </Panel>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Panel
            title="Top opportunities"
            sub="Ranked by the eight-factor model"
            action={<Link href="/app/keywords" className="text-[0.82rem] font-bold text-brand hover:underline">All keywords</Link>}
          >
            {topOpportunities.length ? (
              <ul className="divide-y divide-line">
                {topOpportunities.map((k) => (
                  <li key={k.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                    <div className="min-w-0">
                      <p className="truncate text-[0.9rem] font-semibold text-ink">{k.phrase}</p>
                      <p className="mt-0.5 text-[0.75rem] text-body">
                        #{k.position || '—'} · {compact(k.volume)}/mo · KD {k.difficulty}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      {k.band === 'quick-win' && <Badge tone="good">Quick win</Badge>}
                      <span className="tabular-nums font-heading text-[1.1rem] font-extrabold text-brand">
                        {k.opportunity}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : keywords.summary.total > 0 ? (
              <EmptyState
                title="Nothing scoring high yet"
                body={`All ${keywords.summary.total} tracked keywords are currently low or medium opportunity — usually because none of them rank yet, so there is no position to improve on. Rankings populate after the first tracking run.`}
                cta={{ label: 'Review keywords', href: '/app/keywords' }}
              />
            ) : (
              <EmptyState
                title="No keywords tracked"
                body="Add the terms you want to rank for and they will be scored against the eight-factor opportunity model."
                cta={{ label: 'Add keywords', href: '/app/keywords' }}
              />
            )}
          </Panel>

          <Panel
            title="Prompts you never appear in"
            sub="Highest-leverage content gaps"
            action={<Link href="/app/ai-visibility" className="text-[0.82rem] font-bold text-brand hover:underline">All prompts</Link>}
          >
            {visibility.gaps.length ? (
              <ul className="divide-y divide-line">
                {visibility.gaps.slice(0, 6).map((g) => (
                  <li key={g.id} className="flex items-start justify-between gap-4 px-5 py-3.5">
                    <p className="text-[0.88rem] leading-snug text-ink">{g.text}</p>
                    <Badge>{g.cluster}</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="You appear in every tracked prompt" body="Nothing is missing from the current set. Add more prompts to find the next edge." />
            )}
          </Panel>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Panel title="Site health" action={<Link href="/app/audit" className="text-[0.82rem] font-bold text-brand hover:underline">Audit</Link>}>
            <div className="p-5">
              {audit ? (
                <>
                  <p className="font-heading text-[2.4rem] font-extrabold leading-none text-ink">{audit.score}</p>
                  <p className="mt-1 text-[0.8rem] text-body">{audit.pagesCrawled} pages crawled</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Badge tone="bad">{audit.bySeverity.critical} critical</Badge>
                    <Badge tone="warn">{audit.bySeverity.warning} warnings</Badge>
                    <Badge>{audit.bySeverity.notice} notices</Badge>
                  </div>
                </>
              ) : (
                <p className="text-[0.85rem] text-body">No audit has run yet.</p>
              )}
            </div>
          </Panel>

          <Panel title="Content" action={<Link href="/app/content" className="text-[0.82rem] font-bold text-brand hover:underline">Pipeline</Link>}>
            <div className="p-5">
              <p className="font-heading text-[2.4rem] font-extrabold leading-none text-ink">
                {content.summary.published}
              </p>
              <p className="mt-1 text-[0.8rem] text-body">
                published · {content.summary.inProgress} in progress
              </p>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-[0.8rem]">
                <div>
                  <dt className="text-body">Avg SEO</dt>
                  <dd className="font-heading text-[1.1rem] font-bold text-ink">{content.summary.avgSeo}</dd>
                </div>
                <div>
                  <dt className="text-body">Avg GEO</dt>
                  <dd className="font-heading text-[1.1rem] font-bold text-ink">{content.summary.avgAiReady}</dd>
                </div>
              </dl>
            </div>
          </Panel>

          <Panel title="Leads by source" action={<Link href="/app/leads" className="text-[0.82rem] font-bold text-brand hover:underline">All leads</Link>}>
            <div className="p-5">
              <BarList
                rows={[
                  { label: 'AI assistants', value: leads.summary.ai, color: '#1466D8' },
                  { label: 'Organic search', value: leads.summary.organic, color: '#12A150' },
                  { label: 'Direct', value: leads.summary.direct, color: '#9AA5B4' },
                ]}
              />
            </div>
          </Panel>
        </div>

        <Panel title="Next actions" sub="Derived from your current data">
          <ul className="divide-y divide-line">
            {buildActions({ visibility, keywords, audit, content }).map((a) => (
              <li key={a.title} className="flex items-center justify-between gap-4 px-5 py-4">
                <div>
                  <p className="text-[0.9rem] font-semibold text-ink">{a.title}</p>
                  <p className="mt-0.5 text-[0.8rem] text-body">{a.body}</p>
                </div>
                <Link href={a.href} className="btn btn-sm btn-ghost shrink-0">
                  Open
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  );
}

type Overview = Awaited<ReturnType<typeof getOverview>>;

/** Turn the current numbers into a short, concrete to-do list. */
function buildActions({
  visibility, keywords, audit, content,
}: Pick<Overview, 'visibility' | 'keywords' | 'audit' | 'content'>) {
  const actions: Array<{ title: string; body: string; href: string }> = [];

  if (visibility.gaps.length) {
    actions.push({
      title: `Win back ${visibility.gaps.length} prompt${visibility.gaps.length === 1 ? '' : 's'} you never appear in`,
      body: `Starting with "${visibility.gaps[0].text}". Check which competitor page takes the citation, then brief against it.`,
      href: '/app/ai-visibility',
    });
  }

  if (keywords.summary.quickWins > 0) {
    actions.push({
      title: `${keywords.summary.quickWins} quick-win keyword${keywords.summary.quickWins === 1 ? '' : 's'} available`,
      body: 'Ranking between positions 4 and 20 on low-difficulty SERPs — reachable without new links.',
      href: '/app/keywords',
    });
  }

  if (audit && audit.bySeverity.critical > 0) {
    actions.push({
      title: `Fix ${audit.bySeverity.critical} critical site issue${audit.bySeverity.critical === 1 ? '' : 's'}`,
      body: 'Critical findings block indexing or break pages outright. Clear these before publishing anything new.',
      href: '/app/audit',
    });
  }

  const weakest = content.articles
    .filter((a) => a.status === 'published')
    .sort((a, b) => a.aiReadyScore - b.aiReadyScore)[0];
  if (weakest) {
    actions.push({
      title: `Raise the GEO score on "${weakest.title}"`,
      body: `Currently ${weakest.aiReadyScore}/100. Adding sourced statistics and question headings moves this fastest.`,
      href: '/app/content',
    });
  }

  return actions.slice(0, 4);
}
