'use client';

import { useState } from 'react';
import { FileText, Loader2, X } from 'lucide-react';
import { useAction } from '@/components/app/use-action';

interface Brief {
  topic: string;
  targetKeyword: string;
  intent: string;
  targetWords: number;
  benchmark: { median: number; basis: 'serp' | 'intent-default' };
  outline: Array<{ heading: string; guidance: string }>;
  questions: string[];
  secondaryKeywords: string[];
  competingUrls: string[];
  requirements: string[];
  answerTemplate: string;
}

interface Response {
  brief: Brief;
  context: {
    volume: number;
    difficulty: number | null;
    estimatedUpside: number;
    unansweredPromptCount: number;
    relatedPromptCount: number;
  };
  saved: boolean;
}

/** Generates a brief for one keyword and shows it in a dialog. */
export function BriefButton({ projectId, keywordId, phrase }: { projectId: string; keywordId: string; phrase: string }) {
  const { run, pending, error } = useAction();
  const [result, setResult] = useState<Response | null>(null);

  async function generate(save: boolean) {
    const data = await run(
      '/api/app/brief',
      { body: { projectId, keywordId, save } },
      { refresh: save, onSuccess: (d) => setResult(d as unknown as Response) },
    );
    if (!data) setResult(null);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => generate(false)}
        disabled={pending}
        aria-label={`Generate a content brief for ${phrase}`}
        className="rounded p-1.5 text-body/50 transition-colors hover:bg-brand-light hover:text-brand"
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <FileText className="h-3.5 w-3.5" aria-hidden="true" />}
      </button>

      {error && <p role="alert" className="mt-1 text-[0.7rem] text-bad">{error}</p>}

      {result && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Content brief for ${result.brief.topic}`}
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-navy/50 p-4 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setResult(null); }}
        >
          <div className="my-8 w-full max-w-3xl rounded-2xl bg-white shadow-lift">
            <header className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
              <div className="text-left">
                <p className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-brand">Content brief</p>
                <h2 className="mt-1 font-heading text-[1.35rem] font-extrabold text-ink">{result.brief.topic}</h2>
                <p className="mt-1 text-[0.82rem] text-body">
                  {result.brief.intent} intent · {result.context.volume.toLocaleString()}/mo
                  {result.context.difficulty !== null && ` · KD ${result.context.difficulty}`}
                  {' · target '}{result.brief.targetWords.toLocaleString()} words
                </p>
              </div>
              <button
                type="button" onClick={() => setResult(null)} aria-label="Close brief"
                className="shrink-0 rounded-lg p-2 text-body hover:bg-surface-alt"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </header>

            <div className="space-y-6 px-6 py-5 text-left">
              <p className="rounded-lg bg-surface-alt p-3.5 text-[0.82rem] leading-relaxed text-body">
                Built from {result.context.relatedPromptCount} related prompt
                {result.context.relatedPromptCount === 1 ? '' : 's'} in your set,{' '}
                {result.context.unansweredPromptCount} of which never name you. Length benchmarked{' '}
                {result.brief.benchmark.basis === 'serp'
                  ? `against a median of ${result.brief.benchmark.median.toLocaleString()} words.`
                  : 'from intent, as no ranking data is connected yet.'}
              </p>

              <Section title="Outline">
                <ol className="space-y-3">
                  {result.brief.outline.map((item, i) => (
                    <li key={i} className="rounded-lg bg-surface-alt p-3.5">
                      <p className="font-heading text-[0.95rem] font-bold text-ink">
                        H2 — {item.heading}
                      </p>
                      <p className="mt-1 text-[0.82rem] leading-relaxed text-body">{item.guidance}</p>
                    </li>
                  ))}
                </ol>
              </Section>

              <Section title="Questions to answer outright">
                <ul className="list-disc space-y-1.5 pl-5 marker:text-brand">
                  {result.brief.questions.map((q) => (
                    <li key={q} className="text-[0.875rem] text-body">{q}</li>
                  ))}
                </ul>
              </Section>

              <Section title="Requirements">
                <ul className="list-disc space-y-1.5 pl-5 marker:text-brand">
                  {result.brief.requirements.map((r) => (
                    <li key={r} className="text-[0.875rem] text-body">{r}</li>
                  ))}
                </ul>
              </Section>

              {result.brief.secondaryKeywords.length > 0 && (
                <Section title="Secondary keywords">
                  <ul className="flex flex-wrap gap-2">
                    {result.brief.secondaryKeywords.map((k) => (
                      <li key={k} className="rounded-full bg-surface-alt px-3 py-1.5 text-[0.8rem] text-ink ring-1 ring-line">
                        {k}
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              {result.brief.competingUrls.length > 0 && (
                <Section title="Pages beating you on these questions">
                  <ul className="space-y-1.5">
                    {result.brief.competingUrls.map((u) => (
                      <li key={u}>
                        <a
                          href={u} target="_blank" rel="noopener noreferrer"
                          className="break-all text-[0.82rem] text-brand hover:underline"
                        >
                          {u}
                        </a>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}
            </div>

            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-6 py-4">
              <p className="text-[0.8rem] text-body">
                {result.saved ? 'Saved to your content pipeline.' : 'Not saved yet.'}
              </p>
              <div className="flex gap-2.5">
                {!result.saved && (
                  <button type="button" disabled={pending} onClick={() => generate(true)} className="btn btn-sm btn-primary">
                    {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                    Save to pipeline
                  </button>
                )}
                <button type="button" onClick={() => setResult(null)} className="btn btn-sm btn-ghost">Close</button>
              </div>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="font-heading text-[0.95rem] font-bold text-ink">{title}</h3>
      <div className="mt-2.5">{children}</div>
    </section>
  );
}
