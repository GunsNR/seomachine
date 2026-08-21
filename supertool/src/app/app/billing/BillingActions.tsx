'use client';

import { useState } from 'react';
import { CreditCard, ExternalLink, Loader2 } from 'lucide-react';
import { FormError } from '@/components/app/Field';
import { useAction } from '@/components/app/use-action';
import { cn } from '@/lib/utils';

interface PlanOption {
  id: string;
  label: string;
  monthly: number;
  annual: number;
  tagline: string;
  features: string[];
  current: boolean;
}

/** Plan chooser that hands off to Stripe Checkout. */
export function PlanPicker({ plans, disabled }: { plans: PlanOption[]; disabled: boolean }) {
  const [annual, setAnnual] = useState(true);
  const [busy, setBusy] = useState('');
  const { run, error } = useAction();

  async function choose(plan: string) {
    setBusy(plan);
    const data = await run(
      '/api/billing/checkout',
      { body: { plan, interval: annual ? 'year' : 'month' } },
      { refresh: false },
    );
    // Stripe Checkout is a full redirect, not an embedded form.
    if (data?.url) window.location.href = String(data.url);
    else setBusy('');
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-3">
        <span className={cn('text-[0.9rem] font-semibold', !annual ? 'text-ink' : 'text-body')}>Monthly</span>
        <button
          type="button" role="switch" aria-checked={annual} aria-label="Bill annually"
          onClick={() => setAnnual((v) => !v)}
          className={cn('relative h-8 w-14 shrink-0 rounded-full transition-colors', annual ? 'bg-brand' : 'bg-line')}
        >
          <span className={cn('absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-[left] duration-200', annual ? 'left-[1.75rem]' : 'left-1')} />
        </button>
        <span className={cn('flex items-center gap-2 text-[0.9rem] font-semibold', annual ? 'text-ink' : 'text-body')}>
          Annual
          <span className="rounded-full bg-ok/10 px-2 py-0.5 text-[0.72rem] font-bold text-ok">Save 20%</span>
        </span>
      </div>

      <FormError message={error} />

      <div className="mt-7 grid gap-5 lg:grid-cols-3">
        {plans.map((plan) => {
          const price = annual ? plan.annual : plan.monthly;
          return (
            <div
              key={plan.id}
              className={cn(
                'flex flex-col rounded-xl bg-white p-6 ring-1',
                plan.current ? 'ring-2 ring-brand' : 'ring-line',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-heading text-[1.15rem] font-bold text-ink">{plan.label}</h3>
                {plan.current && (
                  <span className="rounded-full bg-brand-light px-2.5 py-1 text-[0.68rem] font-bold uppercase tracking-wide text-brand-dark">
                    Current
                  </span>
                )}
              </div>
              <p className="mt-1.5 min-h-[2.5rem] text-[0.82rem] leading-snug text-body">{plan.tagline}</p>

              <p className="mt-4 flex items-baseline gap-1.5">
                <span className="font-heading text-[2.2rem] font-extrabold leading-none text-ink">${price}</span>
                <span className="text-[0.85rem] text-body">/month</span>
              </p>
              <p className="mt-1 text-[0.75rem] text-body">
                {annual ? `Billed annually at $${price * 12}` : 'Billed monthly'}
              </p>

              <ul className="mt-5 flex-1 space-y-1.5 border-t border-line pt-4">
                {plan.features.map((f) => (
                  <li key={f} className="text-[0.82rem] text-body">• {f}</li>
                ))}
              </ul>

              <button
                type="button"
                disabled={disabled || busy !== ''}
                onClick={() => choose(plan.id)}
                className={cn('btn btn-md mt-5 w-full', plan.current ? 'btn-ghost' : 'btn-primary')}
              >
                {busy === plan.id ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Opening Stripe…
                  </>
                ) : plan.current ? (
                  'Change billing period'
                ) : (
                  <>
                    <CreditCard className="h-4 w-4" aria-hidden="true" />
                    Choose {plan.label}
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Opens the Stripe customer portal. */
export function ManageBillingButton() {
  const [busy, setBusy] = useState(false);
  const { run, error } = useAction();

  return (
    <div className="flex flex-col items-start gap-1.5">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const data = await run('/api/billing/portal', {}, { refresh: false });
          if (data?.url) window.location.href = String(data.url);
          else setBusy(false);
        }}
        className="btn btn-md btn-primary"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ExternalLink className="h-4 w-4" aria-hidden="true" />}
        Manage billing
      </button>
      <FormError message={error} />
    </div>
  );
}
