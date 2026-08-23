'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowRight, Check, Globe, Loader2, Sparkles, Users } from 'lucide-react';
import { Field, FormError, inputClass } from '@/components/app/Field';
import { useAction } from '@/components/app/use-action';
import { cn } from '@/lib/utils';

interface Result {
  project: { id: string; name: string; domain: string };
  siteRead: boolean;
  homepageTitle: string;
  keywordsAdded: number;
  promptsAdded: number;
  competitorsAdded: number;
  suggestedFromSite: number;
}

const STEPS = ['Your site', 'Competitors', 'Building'] as const;

export function OnboardingWizard({ projectId, defaultName }: { projectId?: string; defaultName: string }) {
  const router = useRouter();
  const { run, pending, error } = useAction();

  const [step, setStep] = useState(0);
  const [name, setName] = useState(defaultName);
  const [domain, setDomain] = useState('');
  const [category, setCategory] = useState('');
  const [competitors, setCompetitors] = useState(['', '', '']);
  const [result, setResult] = useState<Result | null>(null);

  const canContinue = name.trim().length > 0 && domain.trim().length > 2 && category.trim().length > 1;

  async function submit() {
    setStep(2);
    const data = await run(
      '/api/app/onboarding',
      {
        body: {
          name: name.trim(),
          domain: domain.trim(),
          category: category.trim(),
          competitors: competitors.map((c) => c.trim()).filter(Boolean),
          projectId,
        },
      },
      { refresh: false },
    );

    if (data) {
      setResult(data as unknown as Result);
    } else {
      // Let them correct the input rather than stranding them on a dead step.
      setStep(0);
    }
  }

  if (result) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="card p-8 text-center">
          <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-ok/10 text-ok">
            <Check className="h-7 w-7" aria-hidden="true" />
          </span>
          <h1 className="mt-5 font-heading text-[1.6rem] font-extrabold text-ink">
            {result.project.name} is ready
          </h1>
          <p className="mt-2.5 text-[0.95rem] leading-relaxed text-body">
            {result.siteRead
              ? `We read ${result.project.domain} and used it to suggest keywords and prompts.`
              : `We could not reach ${result.project.domain} from our network, so we seeded your workspace from the category you described. Everything is editable.`}
          </p>

          <dl className="mt-7 grid gap-4 sm:grid-cols-3">
            <Summary label="Keywords" value={result.keywordsAdded} />
            <Summary label="Prompts" value={result.promptsAdded} />
            <Summary label="Competitors" value={result.competitorsAdded} />
          </dl>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={() => { router.push('/app'); router.refresh(); }}
              className="btn btn-md btn-accent"
            >
              Go to dashboard
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => { router.push('/app/ai-visibility'); router.refresh(); }}
              className="btn btn-md btn-ghost"
            >
              Run my first visibility check
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <ol className="mb-8 flex items-center justify-center gap-3" aria-label="Setup progress">
        {STEPS.map((label, i) => (
          <li key={label} className="flex items-center gap-3">
            <span
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full text-[0.8rem] font-bold',
                i < step ? 'bg-ok text-white' : i === step ? 'bg-brand text-white' : 'bg-line text-body',
              )}
              aria-current={i === step ? 'step' : undefined}
            >
              {i < step ? <Check className="h-4 w-4" aria-hidden="true" /> : i + 1}
            </span>
            <span className={cn('text-[0.85rem] font-semibold', i === step ? 'text-ink' : 'text-body')}>
              {label}
            </span>
            {i < STEPS.length - 1 && <span className="h-px w-6 bg-line" aria-hidden="true" />}
          </li>
        ))}
      </ol>

      <div className="card p-7 sm:p-9">
        {step === 0 && (
          <>
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand-light text-brand">
              <Globe className="h-5 w-5" aria-hidden="true" />
            </span>
            <h1 className="mt-4 font-heading text-[1.5rem] font-extrabold text-ink">
              What are we tracking?
            </h1>
            <p className="mt-2 text-[0.9rem] leading-relaxed text-body">
              We will read your homepage to suggest keywords and the questions buyers ask about you.
            </p>

            <div className="mt-6 space-y-5">
              <Field label="Brand name" required hint="Exactly as an assistant would write it.">
                <input
                  value={name} onChange={(e) => setName(e.target.value)}
                  className={inputClass} maxLength={120} placeholder="Acme Analytics"
                />
              </Field>
              <Field label="Domain" required hint="Used to detect when an answer cites one of your own pages.">
                <input
                  value={domain} onChange={(e) => setDomain(e.target.value)}
                  className={inputClass} maxLength={255} placeholder="acmeanalytics.com"
                />
              </Field>
              <Field
                label="What do you sell?" required
                hint="How a buyer would describe it — this shapes the prompt set."
              >
                <input
                  value={category} onChange={(e) => setCategory(e.target.value)}
                  className={inputClass} maxLength={160} placeholder="product analytics platform"
                />
              </Field>
            </div>

            <FormError message={error} />

            <button
              type="button" disabled={!canContinue} onClick={() => setStep(1)}
              className="btn btn-md btn-accent mt-7 w-full"
            >
              Continue
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </>
        )}

        {step === 1 && (
          <>
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand-light text-brand">
              <Users className="h-5 w-5" aria-hidden="true" />
            </span>
            <h1 className="mt-4 font-heading text-[1.5rem] font-extrabold text-ink">
              Who do you lose to?
            </h1>
            <p className="mt-2 text-[0.9rem] leading-relaxed text-body">
              We watch for these being named alongside you, so you can see who wins which question.
              Optional — you can add them later.
            </p>

            <div className="mt-6 space-y-4">
              {competitors.map((value, i) => (
                <Field key={i} label={`Competitor ${i + 1}`}>
                  <input
                    value={value}
                    onChange={(e) => {
                      const next = [...competitors];
                      next[i] = e.target.value;
                      setCompetitors(next);
                    }}
                    className={inputClass} maxLength={255} placeholder="competitor.com"
                  />
                </Field>
              ))}
            </div>

            <FormError message={error} />

            <div className="mt-7 flex gap-3">
              <button type="button" onClick={() => setStep(0)} className="btn btn-md btn-ghost">
                Back
              </button>
              <button type="button" onClick={submit} disabled={pending} className="btn btn-md btn-accent flex-1">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                Build my workspace
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <div className="py-10 text-center">
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-brand" aria-hidden="true" />
            <h1 className="mt-5 font-heading text-[1.35rem] font-extrabold text-ink">
              Building your workspace
            </h1>
            <p className="mx-auto mt-2 max-w-sm text-[0.9rem] leading-relaxed text-body">
              Reading {domain || 'your site'}, extracting topics, generating a funnel-balanced prompt
              set and estimating keyword metrics. This takes a few seconds.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-surface-alt p-4">
      <dt className="text-[0.7rem] font-bold uppercase tracking-[0.1em] text-body/60">{label}</dt>
      <dd className="mt-1 font-heading text-[1.6rem] font-extrabold leading-none text-ink">{value}</dd>
    </div>
  );
}
