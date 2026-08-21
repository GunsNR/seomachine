'use client';

import { useState } from 'react';
import { AlertCircle, Loader2, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Finding {
  code: string; title: string; detail: string; url: string;
  severity: 'critical' | 'warning' | 'notice';
  category: string; howToFix: string;
}

interface AuditResponse {
  url: string; score: number; grade: string;
  pagesCrawled: number; pagesOk: number;
  totals: { critical: number; warning: number; notice: number };
  byCategory: Record<string, { critical: number; warning: number; notice: number }>;
  aiReadiness: { score: number; grade: string; signals: Array<{ label: string; score: number; detail: string; fix: string }> };
  findings: Finding[];
  homepage: { title: string; metaDescription: string; wordCount: number; h1: string[]; schemaTypes: string[]; responseMs: number };
}

const SEVERITY_STYLE = {
  critical: 'bg-bad/10 text-bad ring-bad/25',
  warning: 'bg-warn/10 text-warn ring-warn/25',
  notice: 'bg-brand-light text-brand ring-brand/20',
} as const;

export function AuditForm() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AuditResponse | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/tools/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), maxPages: 5 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'The audit could not be completed.');
      setResult(json as AuditResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <form onSubmit={onSubmit} className="card p-6 sm:p-8">
        <label htmlFor="audit-url" className="block text-[0.85rem] font-semibold text-ink">
          Website URL <span className="text-bad" aria-hidden="true">*</span>
        </label>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row">
          <input
            id="audit-url" required value={url} onChange={(e) => setUrl(e.target.value)}
            placeholder="https://yourdomain.com" maxLength={2048}
            className="h-14 flex-1 rounded-xl border-0 bg-surface-alt px-4 text-[0.95rem] text-ink ring-1 ring-inset ring-line placeholder:text-body/50 focus:ring-2 focus:ring-brand"
          />
          <button type="submit" disabled={loading} className="btn btn-lg btn-accent shrink-0">
            {loading ? (
              <>
                <Loader2 className="h-4.5 w-4.5 animate-spin" aria-hidden="true" />
                Crawling…
              </>
            ) : (
              <>
                <ShieldCheck className="h-4.5 w-4.5" aria-hidden="true" />
                Audit my site
              </>
            )}
          </button>
        </div>
        <p className="mt-3 text-[0.8rem] text-body">
          Crawls up to 5 pages and runs 20+ checks across crawlability, on-page, performance,
          schema and answer-readiness.
        </p>
      </form>

      {error && (
        <div role="alert" className="mt-6 flex items-start gap-3 rounded-xl bg-bad/10 p-5 ring-1 ring-bad/25">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-bad" aria-hidden="true" />
          <p className="text-[0.9rem] text-ink">{error}</p>
        </div>
      )}

      {result && (
        <div className="mt-10 space-y-8" aria-live="polite">
          <div className="grid gap-5 sm:grid-cols-2">
            <ScoreCard label="SEO health score" score={result.score} grade={result.grade} />
            <ScoreCard label="AI readiness score" score={result.aiReadiness.score} grade={result.aiReadiness.grade} accent />
          </div>

          <dl className="grid gap-4 sm:grid-cols-4">
            <Metric label="Pages crawled" value={String(result.pagesCrawled)} />
            <Metric label="Critical" value={String(result.totals.critical)} tone="bad" />
            <Metric label="Warnings" value={String(result.totals.warning)} tone="warn" />
            <Metric label="Notices" value={String(result.totals.notice)} />
          </dl>

          <div>
            <h3 className="font-heading text-[1.15rem] font-bold text-ink">
              Answer-engine readiness signals
            </h3>
            <ul className="mt-4 space-y-3">
              {result.aiReadiness.signals.map((s) => (
                <li key={s.label} className="card p-5">
                  <div className="flex items-center justify-between gap-4">
                    <span className="font-heading text-[0.95rem] font-bold text-ink">{s.label}</span>
                    <span className="tabular-nums text-[0.85rem] font-bold text-body">
                      {Math.round(s.score * 100)}%
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-alt">
                    <div
                      className={cn('h-full rounded-full', s.score >= 0.75 ? 'bg-ok' : s.score >= 0.4 ? 'bg-warn' : 'bg-bad')}
                      style={{ width: `${Math.max(2, s.score * 100)}%` }}
                    />
                  </div>
                  <p className="mt-2.5 text-[0.85rem] text-body">{s.detail}</p>
                  {s.score < 0.75 && (
                    <p className="mt-2 rounded-lg bg-surface-alt p-3 text-[0.82rem] leading-relaxed text-ink">
                      <strong className="font-semibold">Fix:</strong> {s.fix}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-heading text-[1.15rem] font-bold text-ink">
              Findings ({result.findings.length})
            </h3>
            {result.findings.length === 0 ? (
              <p className="mt-4 rounded-xl bg-ok/10 p-5 text-[0.9rem] text-ink ring-1 ring-ok/25">
                No issues found in the crawled pages. That is unusual — try auditing a deeper page.
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {result.findings.map((f, i) => (
                  <li key={`${f.code}-${i}`} className="card p-5">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className={cn('rounded px-2 py-1 text-[0.68rem] font-bold uppercase tracking-wide ring-1', SEVERITY_STYLE[f.severity])}>
                        {f.severity}
                      </span>
                      <span className="rounded bg-surface-alt px-2 py-1 text-[0.68rem] font-bold uppercase tracking-wide text-body">
                        {f.category}
                      </span>
                    </div>
                    <h4 className="mt-3 font-heading text-[1rem] font-bold text-ink">{f.title}</h4>
                    <p className="mt-1.5 text-[0.875rem] leading-relaxed text-body">{f.detail}</p>
                    <p className="mt-2.5 rounded-lg bg-surface-alt p-3 text-[0.82rem] leading-relaxed text-ink">
                      <strong className="font-semibold">Fix:</strong> {f.howToFix}
                    </p>
                    <p className="mt-2 truncate text-[0.75rem] text-body/70">{f.url}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ScoreCard({ label, score, grade, accent }: { label: string; score: number; grade: string; accent?: boolean }) {
  return (
    <div className={cn('rounded-2xl p-7 text-center', accent ? 'bg-brand text-white' : 'bg-navy text-white')}>
      <p className="text-[0.7rem] font-bold uppercase tracking-[0.12em] text-white/60">{label}</p>
      <p className="mt-2 font-heading text-[3.25rem] font-extrabold leading-none">{score}</p>
      <p className="mt-1 text-[0.85rem] text-white/65">Grade {grade}</p>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'bad' | 'warn' }) {
  return (
    <div className="stat-tile">
      <dt className="text-[0.7rem] font-bold uppercase tracking-[0.1em] text-body/60">{label}</dt>
      <dd className={cn('mt-1.5 font-heading text-[1.9rem] font-extrabold leading-none',
        tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-warn' : 'text-ink')}>
        {value}
      </dd>
    </div>
  );
}
