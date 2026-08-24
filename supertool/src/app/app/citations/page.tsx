import { redirect } from 'next/navigation';
import { Badge, EmptyState, PageHeader, Panel, StatTile } from '@/components/app/ui';
import { RunHeader } from '@/components/app/RunEvidence';
import { BarList } from '@/components/app/Chart';
import { engineName, getEngine } from '@/lib/ai/engines';
import { isObservedStatus, binaryRate } from '@/lib/measurement/stats';
import { getLatestRun, getRunReport } from '@/lib/measurement/report';
import { ExportButton } from '@/components/app/ExportButton';
import { getSession, resolveProject } from '@/lib/auth';
import { db } from '@/lib/db';
import { parseJson, pct } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const SENTIMENT_TONE = { positive: 'good', negative: 'bad', neutral: 'neutral' } as const;

export default async function CitationsPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  const project = await resolveProject(session.orgId);
  if (!project) redirect('/app');

  // Citation evidence belongs to one RUN, identified by its id. Grouping by
  // calendar date merged separate runs into a bucket that never happened.
  const latestRun = await getLatestRun(project.id);

  if (!latestRun) {
    return (
      <>
        <PageHeader title="Citations" />
        <div className="mt-6 rounded-xl bg-white ring-1 ring-line">
          <EmptyState
            title="No measurement run yet"
            body="Run your prompt set to start collecting citation evidence."
            cta={{ label: 'Run a check', href: '/app/ai-visibility' }}
          />
        </div>
      </>
    );
  }

  const [report, latestAll] = await Promise.all([
    getRunReport(latestRun.id),
    db.observation.findMany({ where: { runId: latestRun.id } }),
  ]);

  // Only observations that produced an answer can carry citation evidence.
  // Counting a failed call as "no citation" would understate the rate.
  const latest = latestAll.filter((c) => isObservedStatus(c.status));

  const cited = latest.filter((c) => c.brandCited);
  const mentionedNotCited = latest.filter((c) => c.brandMentioned && !c.brandCited);

  // Which of our own URLs get quoted, and how often.
  const ourHost = project.domain.replace(/^www\./, '');
  const urlTally = new Map<string, number>();
  const competitorUrlTally = new Map<string, number>();

  for (const c of latest) {
    for (const url of parseJson<string[]>(c.citedUrls, [])) {
      let host = '';
      try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { continue; }
      const target = host === ourHost || host.endsWith(`.${ourHost}`) ? urlTally : competitorUrlTally;
      target.set(url, (target.get(url) ?? 0) + 1);
    }
  }

  const topUrls = [...urlTally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const topCompetitorUrls = [...competitorUrlTally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);

  // Engines that actually appear in this run's observations, so a run is
  // described by what it did rather than by the current registry.
  const engineIds = [...new Set(latestAll.map((c) => c.engine))];
  const byEngine = engineIds.map((id) => {
    const all = latestAll.filter((c) => c.engine === id);
    const rows = latest.filter((c) => c.engine === id);
    const won = rows.filter((c) => c.brandCited).length;
    const rate = binaryRate(won, rows.length);
    return {
      label: engineName(id),
      value: won,
      color: getEngine(id)?.color ?? '#888888',
      sub: rows.length
        ? `${rows.length}/${all.length} observed · ${
            rate.insufficientEvidence ? 'insufficient evidence' : `${pct(rate.rate ?? 0)} citation rate`
          }`
        : 'Not measured in this run',
    };
  }).sort((a, b) => b.value - a.value);

  return (
    <>
      <PageHeader
        title="Citations"
        sub="Which of your URLs answer engines quote — and which competitor page took the citation when they did not."
        action={<ExportButton resource="citations" />}
      />

      <div className="mt-6 space-y-6">
        {report && (
          <RunHeader
            run={{
              runId: report.runId,
              startedAt: report.startedAt,
              finishedAt: report.finishedAt,
              status: report.status,
              interrupted: report.interrupted,
              trigger: report.trigger,
              dataMode: report.dataMode,
              promptSetVersion: report.promptSetVersion,
              methodologyVersion: report.methodologyVersion,
              samplesPerPair: report.samplesPerPair,
              localeTag: report.localeTag,
              regionCode: report.regionCode,
              attempted: report.attempted,
              observed: report.observed,
              failed: report.failed,
              unavailable: report.unavailable,
              coverage: report.coverage,
            }}
          />
        )}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile label="Citations won" value={cited.length} sub={`of ${latest.length} observed checks in this run`} tone="good" />
          <StatTile
            label="Citation rate"
            value={report?.citation.insufficientEvidence ? 'Insufficient' : pct(report?.citation.rate ?? 0)}
            sub={
              report?.citation.insufficientEvidence
                ? `${latest.length} observed — below the minimum to state a rate`
                : `Over observed answers only · ${pct(report?.coverage ?? 0)} coverage`
            }
          />
          <StatTile label="Mentioned, not cited" value={mentionedNotCited.length} sub="Highest-leverage fixes available" tone="warn" />
          <StatTile label="Your URLs quoted" value={topUrls.length} sub="Distinct pages cited" />
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-2">
          <Panel title="Citations by engine" sub="Latest run">
            <div className="p-5"><BarList rows={byEngine} /></div>
          </Panel>

          <Panel title="Your most-cited pages">
            <div className="p-5">
              {topUrls.length ? (
                <BarList rows={topUrls.map(([url, count]) => ({ label: shorten(url), value: count }))} />
              ) : (
                <p className="text-[0.85rem] text-body">
                  None of your URLs were cited in the latest run. The list below shows which pages took the citations instead.
                </p>
              )}
            </div>
          </Panel>
        </div>

        <Panel title="Pages that beat you" sub="External URLs cited on prompts in this set — each one is a brief">
          <div className="p-5">
            {topCompetitorUrls.length ? (
              <BarList rows={topCompetitorUrls.map(([url, count]) => ({ label: shorten(url), value: count }))} />
            ) : (
              <p className="text-[0.85rem] text-body">No external citations recorded in the latest run.</p>
            )}
          </div>
        </Panel>

        <Panel
          title="Mentioned but not cited"
          sub="The engine already knows who you are — it just used someone else as the source"
        >
          {mentionedNotCited.length ? (
            <ul className="divide-y divide-line">
              {mentionedNotCited.slice(0, 20).map((c) => (
                <li key={c.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <Badge tone="brand">{engineName(c.engine)}</Badge>
                    <Badge tone={SENTIMENT_TONE[c.sentiment as keyof typeof SENTIMENT_TONE] ?? 'neutral'}>
                      {c.sentiment}
                    </Badge>
                    {c.mentionRank > 0 && <Badge>Rank {c.mentionRank}</Badge>}
                  </div>
                  {/* The immutable snapshot of what was asked, not a join to a
                      prompt row that may since have been edited or deleted. */}
                  <p className="mt-2.5 text-[0.85rem] font-semibold text-ink">{c.promptTextSnapshot}</p>
                  {c.evidenceExcerpt && (
                    <p className="mt-1.5 border-l-2 border-line pl-3 text-[0.85rem] leading-relaxed text-body">
                      {c.evidenceExcerpt}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Nothing in this bucket" body="Every answer that named you also cited you. That is the goal." />
          )}
        </Panel>
      </div>
    </>
  );
}

function shorten(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/$/, '');
    return `${u.hostname.replace(/^www\./, '')}${path.length > 32 ? `${path.slice(0, 32)}…` : path}`;
  } catch {
    return url.slice(0, 48);
  }
}
