'use client';

import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FaqItem { q: string; a: string }

export function Faq({ items, defaultOpen = 0 }: { items: readonly FaqItem[]; defaultOpen?: number }) {
  const [open, setOpen] = useState<number | null>(defaultOpen);

  return (
    <div className="mx-auto max-w-3xl divide-y divide-line rounded-2xl bg-white ring-1 ring-line">
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={item.q}>
            <h3>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : i)}
                aria-expanded={isOpen}
                aria-controls={`faq-panel-${i}`}
                id={`faq-button-${i}`}
                className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left transition-colors hover:bg-surface-alt"
              >
                <span className="font-heading text-[1.0625rem] font-bold text-ink">{item.q}</span>
                <span
                  className={cn(
                    'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors',
                    isOpen ? 'bg-brand text-white' : 'bg-brand-light text-brand',
                  )}
                  aria-hidden="true"
                >
                  {isOpen ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                </span>
              </button>
            </h3>
            <div
              id={`faq-panel-${i}`}
              role="region"
              aria-labelledby={`faq-button-${i}`}
              hidden={!isOpen}
              className="px-6 pb-6"
            >
              <p className="text-[0.9375rem] leading-[1.75] text-body text-pretty">{item.a}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
