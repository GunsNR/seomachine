'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Check, Sparkles } from 'lucide-react';
import { PRICING, PRICING_DISCLOSURE } from '@/content/site';
import { planFeatureLabel } from '@/lib/capabilities';
import { cn } from '@/lib/utils';

export function PricingTable({ compact = false }: { compact?: boolean }) {
  const [annual, setAnnual] = useState(true);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-3">
        <span className={cn('text-[0.9375rem] font-semibold', !annual ? 'text-ink' : 'text-body')}>
          Monthly
        </span>

        {/* The knob is positioned with an explicit `left` rather than a
            transform off its static position, which is what let it escape
            the track. */}
        <button
          type="button"
          role="switch"
          aria-checked={annual}
          aria-label="Bill annually"
          onClick={() => setAnnual((v) => !v)}
          className={cn(
            'relative h-8 w-14 shrink-0 rounded-full transition-colors',
            annual ? 'bg-brand' : 'bg-line',
          )}
        >
          <span
            className={cn(
              'absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-[left] duration-200',
              annual ? 'left-[1.75rem]' : 'left-1',
            )}
          />
        </button>

        <span className={cn('flex items-center gap-2 text-[0.9375rem] font-semibold', annual ? 'text-ink' : 'text-body')}>
          Annual
          <span className="rounded-full bg-ok/10 px-2 py-0.5 text-[0.72rem] font-bold text-ok">
            Save 20%
          </span>
        </span>
      </div>

      <div className={cn('mt-12 grid gap-6 lg:grid-cols-3', compact && 'mt-8')}>
        {PRICING.map((plan) => {
          const price = annual ? plan.annualPrice : plan.price;
          return (
            <div
              key={plan.name}
              className={cn(
                'relative flex flex-col rounded-2xl bg-white p-8 transition-all',
                plan.highlight
                  ? 'shadow-glow ring-2 ring-brand lg:-my-3 lg:py-11'
                  : 'shadow-card ring-1 ring-line hover:shadow-lift',
              )}
            >
              {plan.highlight && (
                <span className="absolute -top-3.5 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-brand px-3.5 py-1.5 text-[0.72rem] font-bold uppercase tracking-[0.1em] text-white">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  Most popular
                </span>
              )}

              <h3 className="font-heading text-[1.35rem] font-bold text-ink">{plan.name}</h3>
              <p className="mt-2 min-h-[2.75rem] text-[0.9rem] leading-snug text-body">{plan.tagline}</p>

              <p className="mt-6 flex items-baseline gap-1.5">
                <span className="font-heading text-[3rem] font-extrabold leading-none text-ink">
                  ${price}
                </span>
                <span className="text-[0.9rem] font-medium text-body">/month</span>
              </p>
              <p className="mt-1.5 text-[0.8rem] text-body">
                {annual ? `Billed annually at $${price * 12}` : 'Billed monthly, cancel anytime'}
              </p>

              <Link
                href={plan.cta === 'Talk to sales' ? '/contact' : '/signup'}
                className={cn('btn btn-md mt-7 w-full', plan.highlight ? 'btn-accent' : 'btn-ghost')}
              >
                {plan.cta}
              </Link>

              <ul className="mt-8 space-y-3 border-t border-line pt-7">
                {plan.limits.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-[0.9rem] text-body">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden="true" />
                    {f}
                  </li>
                ))}
                {/* Labels come from the capability registry, which refuses to
                    render anything that is not shipped and tested. */}
                {plan.capabilities.map((id) => (
                  <li key={id} className="flex items-start gap-2.5 text-[0.9rem] text-body">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden="true" />
                    {planFeatureLabel(id)}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <div className="mx-auto mt-10 max-w-3xl rounded-xl bg-surface-alt p-5 ring-1 ring-line">
        <p className="text-[0.78rem] font-bold uppercase tracking-[0.1em] text-body/70">
          What no plan includes
        </p>
        <ul className="mt-3 space-y-2">
          {PRICING_DISCLOSURE.map((line) => (
            <li key={line} className="text-[0.85rem] leading-relaxed text-body">
              {line}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
