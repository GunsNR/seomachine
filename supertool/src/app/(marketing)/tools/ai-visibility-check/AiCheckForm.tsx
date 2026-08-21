'use client';

import { useState } from 'react';
import { AlertCircle, Loader2, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EngineResult {
  engine: string; name: string; color: string;
  score: number; mentionRate: number; citationRate: number; checks: number; live: boolean;
}

interface CheckResponse {
  brand: string; domain: string; simulated: boolean;
  rollup: { score: number; mentionRate: number; citationRate: number; shareOfVoice: number; checks: number };
  byEngine: EngineResult[];
  prompts: Array<{ text: string; cluster: string }>;
  topCompetitors: Array<{ name: string; mentions: number }>;
  samples: Array<{ engine: string; prompt: string; excerpt: string; brandMentioned: boolean; brandCited: boolean; sentiment: string }>;
}

export function AiCheckForm() {
  const [brand, setBrand] = useState('');
  const [domain, setDomain] = useState('');
  const [category, setCategory] = useState('');
  const [competitors, setCompetitors] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckResponse | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/tools/ai-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand: brand.trim(),
          domain: domain.trim(),
          category: category.trim() || undefined,
          competitors: competitors.split(',').map((c) => c.trim()).filter(Boolean).slice(0, 5),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'The check could not be completed.');
      setResult(json as CheckResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <form onSubmit={onSubmit} className="card p-6 sm:p-8">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Brand name" required htmlFor="brand" hint="Exactly as an assistant would write it">
            <input
              id="brand" required value={brand} onChange={(e) => setBrand(e.target.value)}
              placeholder="Acme Analytics" className={inputCls} maxLength={120}
            />
          </Field>
          <Field label="Domain" required htmlFor="domain" hint="Used to detect citations of your own pages">
            <input
              id="domain" required value={domain} onChange={(e) => setDomain(e.target.value)}
              placeholder="acmeanalytics.com" className={inputCls} maxLength={255}
            />
          </Field>
          <Field label="Category" htmlFor="category" hint="How a buyer would describe what you sell">
            <input
              id="category" value={category} onChange={(e) => setCategory(e.target.value)}
              placeholder="product analytics platform" className={inputCls} maxLength={160}
            />
          </Field>
          <Field label="Competitors" htmlFor="competitors" hint="Comma separated, up to five">
            <input
              id="competitors" value={competitors} onChange={(e) => setCompetitors(e.target.value)}
              placeholder="Mixpanel, Amplitude" className={inputCls} maxLength={300}
            />
          </Field>
        </div>

        <button type="submit" disabled={loading} className="btn btn-lg btn-accent mt-6 w-full sm:w-auto">
          {loading ? (
            <>
              <Loader2 className="h-4.5 w-4.5 animate-spin" aria-hidden="true" />
              Checking 6 engines…
            </>
          ) : (
            <>
              <Search className="h-4.5 w-4.5" aria-hidden="true" />
              Run my free check
            </>
          )}
        </button>
        <p className="mt-3 text-[0.8rem] text-body">
          Runs 4 buyer questions across all six answer engines. No account needed.
        </p>
      </form>

      {error && (
        <div role="alert" className="mt-6 flex items-start gap-3 rounded-xl bg-bad/10 p-5 ring-1 ring-bad/25">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-bad" aria-hidden="true" />
          <p className="text-[0.9rem] text-ink">{error}</p>
        </div>
      )}

      {result && <Results result={result} />}
    </div>
  );
}

const inputCls =
  'h-12 w-full rounded-xl border-0 bg-surface-alt px-4 text-[0.95rem] text-ink ring-1 ring-inset ring-line placeholder:text-body/50 focus:ring-2 focus:ring-brand';

function Field({
  label, htmlFor, hint, required, children,
}: { label: string; htmlFor: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-[0.85rem] font-semibold text-ink">
        {label}
        {required && <span className="ml-1 text-bad" aria-hidden="true">*</span>}
      </label>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1.5 text-[0.75rem] text-body">{hint}</p>}
    </div>
  );
}

function Results({ result }: { result: CheckResponse }) {
  return (
    <div className="mt-10 space-y-8" aria-live="polite">
      {result.simulated && (
        <p className="rounded-xl bg-warn/10 p-4 text-[0.85rem] text-ink ring-1 ring-warn/25">
          <strong>Demonstration mode.</strong> No provider API keys are configured on this
          deployment, so these answers were generated by the built-in simulator — deterministic
          per domain, realistic in shape, but not live model output. Add provider keys (or use a
          paid plan) to run against the real engines.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[auto_1fr] lg:items-center">
        <div className="rounded-2xl bg-navy p-8 text-center text-white">
          <p className="text-[0.7rem] font-bold uppercase tracking-[0.12em] text-white/60">
            AI Visibility Score
          </p>
          <p className="mt-2 font-heading text-[4rem] font-extrabold leading-none">{result.rollup.score}</p>
          <p className="mt-1 text-[0.85rem] text-white/60">out of 100</p>
        </div>

        <dl className="grid gap-4 sm:grid-cols-3">
          <Metric label="Mention rate" value={`${Math.round(result.rollup.mentionRate * 100)}%`} sub="Answers naming you" />
          <Metric label="Citation rate" value={`${Math.round(result.rollup.citationRate * 100)}%`} sub="Answers citing your site" />
          <Metric label="Share of voice" value={`${Math.round(result.rollup.shareOfVoice * 100)}%`} sub="Of all vendors named" />
        </dl>
      </div>

      <div>
        <h3 className="font-heading text-[1.15rem] font-bold text-ink">By engine</h3>
        <ul className="mt-4 space-y-3">
          {result.byEngine.map((e) => (
            <li key={e.engine} className="card p-4">
              <div className="flex items-center justify-between text-[0.875rem]">
                <span className="flex items-center gap-2 font-semibold text-ink">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: e.color }} aria-hidden="true" />
                  {e.name}
                  {!e.live && (
                    <span className="rounded bg-line px-1.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-body">
                      simulated
                    </span>
                  )}
                </span>
                <span className="tabular-nums font-bold text-ink">{e.score}/100</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-alt">
                <div className="h-full rounded-full" style={{ width: `${e.score}%`, backgroundColor: e.color }} />
              </div>
              <p className="mt-2 text-[0.78rem] text-body">
                Named in {Math.round(e.mentionRate * 100)}% of answers · cited in {Math.round(e.citationRate * 100)}%
              </p>
            </li>
          ))}
        </ul>
      </div>

      {result.topCompetitors.length > 0 && (
        <div>
          <h3 className="font-heading text-[1.15rem] font-bold text-ink">Named alongside you</h3>
          <ul className="mt-4 flex flex-wrap gap-2.5">
            {result.topCompetitors.map((c) => (
              <li key={c.name} className="rounded-full bg-surface-alt px-3.5 py-2 text-[0.85rem] font-semibold text-ink ring-1 ring-line">
                {c.name}
                <span className="ml-2 text-body">{c.mentions}×</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.samples.length > 0 && (
        <div>
          <h3 className="font-heading text-[1.15rem] font-bold text-ink">Sample answers</h3>
          <ul className="mt-4 space-y-3">
            {result.samples.map((s, i) => (
              <li key={i} className="card p-5">
                <p className="text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-body/60">
                  {s.engine} · “{s.prompt}”
                </p>
                <p className="mt-2 text-[0.9rem] leading-relaxed text-ink">{s.excerpt}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-[0.72rem] font-bold uppercase tracking-wide">
                  <Tag on={s.brandMentioned} label={s.brandMentioned ? 'Mentioned' : 'Not mentioned'} />
                  <Tag on={s.brandCited} label={s.brandCited ? 'Cited' : 'Not cited'} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="stat-tile">
      <dt className="text-[0.7rem] font-bold uppercase tracking-[0.1em] text-body/60">{label}</dt>
      <dd className="mt-1.5 font-heading text-[1.9rem] font-extrabold leading-none text-ink">{value}</dd>
      <dd className="mt-1 text-[0.78rem] text-body">{sub}</dd>
    </div>
  );
}

function Tag({ on, label }: { on: boolean; label: string }) {
  return (
    <span className={cn('rounded px-2 py-1', on ? 'bg-ok/12 text-ok' : 'bg-line text-body')}>
      {label}
    </span>
  );
}
