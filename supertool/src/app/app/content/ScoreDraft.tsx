'use client';

import { useState } from 'react';
import { Gauge, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ScoreResponse {
  seo: {
    score: number; grade: string;
    checks: Array<{ id: string; label: string; status: string; points: number; max: number; message: string }>;
    wordCount: number;
  };
  geo: {
    score: number; grade: string;
    signals: Array<{ id: string; label: string; score: number; weight: number; detail: string; fix: string }>;
    extractedAnswer: string;
    quotablePassages: string[];
  };
  readability: { fleschReadingEase: number; consensusGrade: number; label: string; avgWordsPerSentence: number };
}

/** Live scoring panel — pastes in a draft and grades it on both models. */
export function ScoreDraft() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ScoreResponse | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setResult(null);

    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch('/api/app/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: String(form.get('title') ?? ''),
          metaDescription: String(form.get('metaDescription') ?? ''),
          keyword: String(form.get('keyword') ?? ''),
          body: String(form.get('body') ?? ''),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Could not score that draft.');
      setResult(json as ScoreResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not score that draft.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-xl bg-white ring-1 ring-line shadow-card">
      <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h2 className="font-heading text-[1rem] font-bold text-ink">Score a draft</h2>
          <p className="mt-0.5 text-[0.8rem] text-body">
            Grade any text on both models before you publish it.
          </p>
        </div>
        <button type="button" onClick={() => setOpen((v) => !v)} className="btn btn-sm btn-ghost" aria-expanded={open}>
          <Gauge className="h-4 w-4" aria-hidden="true" />
          {open ? 'Hide' : 'Open scorer'}
        </button>
      </header>

      {open && (
        <div className="p-5">
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="block text-[0.82rem] font-semibold text-ink">Title</span>
                <input name="title" required maxLength={200} className={inputCls} placeholder="AI Search Visibility: The Complete Guide" />
              </label>
              <label className="block">
                <span className="block text-[0.82rem] font-semibold text-ink">Target keyword</span>
                <input name="keyword" required maxLength={120} className={inputCls} placeholder="ai search visibility" />
              </label>
            </div>
            <label className="block">
              <span className="block text-[0.82rem] font-semibold text-ink">Meta description</span>
              <input name="metaDescription" maxLength={300} className={inputCls} placeholder="120-158 characters" />
            </label>
            <label className="block">
              <span className="block text-[0.82rem] font-semibold text-ink">Draft body</span>
              <textarea
                name="body" required rows={9} minLength={50} maxLength={120000}
                className={cn(inputCls, 'h-auto py-3 leading-relaxed')}
                placeholder="Paste the full draft, including your ## headings."
              />
            </label>

            {error && <p role="alert" className="rounded-lg bg-bad/10 p-3 text-[0.85rem] text-ink ring-1 ring-bad/25">{error}</p>}

            <button type="submit" disabled={loading} className="btn btn-md btn-primary">
              {loading ? (<><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Scoring…</>) : 'Score this draft'}
            </button>
          </form>

          {result && (
            <div className="mt-7 space-y-6" aria-live="polite">
              <div className="grid gap-4 sm:grid-cols-3">
                <Score label="On-page SEO" score={result.seo.score} grade={result.seo.grade} />
                <Score label="GEO / answer readiness" score={result.geo.score} grade={result.geo.grade} accent />
                <div className="stat-tile">
                  <p className="text-[0.68rem] font-bold uppercase tracking-[0.1em] text-body/60">Readability</p>
                  <p className="mt-2 font-heading text-[1.85rem] font-extrabold leading-none text-ink">
                    {result.readability.fleschReadingEase}
                  </p>
                  <p className="mt-1.5 text-[0.78rem] text-body">
                    {result.readability.label} · grade {result.readability.consensusGrade} · {result.seo.wordCount} words
                  </p>
                </div>
              </div>

              {result.geo.extractedAnswer && (
                <div className="rounded-xl bg-surface-alt p-4">
                  <p className="text-[0.68rem] font-bold uppercase tracking-[0.1em] text-body/60">
                    The passage an engine would most likely lift
                  </p>
                  <p className="mt-2 text-[0.9rem] leading-relaxed text-ink">{result.geo.extractedAnswer}</p>
                </div>
              )}

              <div>
                <h3 className="font-heading text-[0.95rem] font-bold text-ink">GEO signals</h3>
                <ul className="mt-3 space-y-2.5">
                  {result.geo.signals.map((s) => (
                    <li key={s.id} className="rounded-lg bg-surface-alt p-3.5">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[0.85rem] font-semibold text-ink">{s.label}</span>
                        <span className="shrink-0 text-[0.78rem] font-bold tabular-nums text-body">
                          {Math.round(s.score * 100)}% · weight {s.weight}
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white">
                        <div
                          className={cn('h-full rounded-full', s.score >= 0.75 ? 'bg-ok' : s.score >= 0.4 ? 'bg-warn' : 'bg-bad')}
                          style={{ width: `${Math.max(2, s.score * 100)}%` }}
                        />
                      </div>
                      <p className="mt-2 text-[0.8rem] text-body">{s.detail}</p>
                      {s.score < 0.75 && (
                        <p className="mt-1.5 text-[0.8rem] text-ink">
                          <strong className="font-semibold">Fix:</strong> {s.fix}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="font-heading text-[0.95rem] font-bold text-ink">On-page checks</h3>
                <ul className="mt-3 divide-y divide-line rounded-lg ring-1 ring-line">
                  {result.seo.checks.map((c) => (
                    <li key={c.id} className="flex items-start justify-between gap-4 px-4 py-2.5">
                      <div>
                        <p className="text-[0.85rem] font-semibold text-ink">{c.label}</p>
                        <p className="mt-0.5 text-[0.78rem] text-body">{c.message}</p>
                      </div>
                      <span
                        className={cn(
                          'shrink-0 rounded px-2 py-1 text-[0.68rem] font-bold uppercase',
                          c.status === 'pass' ? 'bg-ok/10 text-ok' : c.status === 'warn' ? 'bg-warn/12 text-warn' : 'bg-bad/10 text-bad',
                        )}
                      >
                        {c.status}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

const inputCls =
  'mt-1.5 h-11 w-full rounded-lg border-0 bg-surface-alt px-3.5 text-[0.9rem] text-ink ring-1 ring-inset ring-line placeholder:text-body/45 focus:ring-2 focus:ring-brand';

function Score({ label, score, grade, accent }: { label: string; score: number; grade: string; accent?: boolean }) {
  return (
    <div className={cn('rounded-xl p-5 text-white', accent ? 'bg-brand' : 'bg-navy')}>
      <p className="text-[0.68rem] font-bold uppercase tracking-[0.1em] text-white/60">{label}</p>
      <p className="mt-2 font-heading text-[2.2rem] font-extrabold leading-none">{score}</p>
      <p className="mt-1 text-[0.78rem] text-white/65">Grade {grade}</p>
    </div>
  );
}
