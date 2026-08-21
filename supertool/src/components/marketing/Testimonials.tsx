'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Star } from 'lucide-react';
import { TESTIMONIALS } from '@/content/site';
import { Section, SectionHeading } from './Section';
import { cn } from '@/lib/utils';

const ROTATE_MS = 7000;

export function Testimonials() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const go = useCallback((delta: number) => {
    setIndex((i) => (i + delta + TESTIMONIALS.length) % TESTIMONIALS.length);
  }, []);

  useEffect(() => {
    if (paused) return;
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => go(1), ROTATE_MS);
    return () => clearInterval(t);
  }, [paused, go]);

  const active = TESTIMONIALS[index];

  return (
    <Section>
      <SectionHeading
        eyebrow="Customer stories"
        title="Teams who stopped guessing about AI search"
      />

      <div
        className="mx-auto mt-12 max-w-4xl"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={() => setPaused(false)}
      >
        <figure
          className="card relative p-8 sm:p-12"
          aria-live="polite"
          aria-atomic="true"
        >
          <div className="flex gap-1" aria-label="Rated 5 out of 5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className="h-5 w-5 fill-accent text-accent" aria-hidden="true" />
            ))}
          </div>

          <blockquote className="mt-6">
            <p className="font-heading text-[1.25rem] font-semibold leading-[1.55] text-ink text-pretty sm:text-[1.4rem]">
              “{active.quote}”
            </p>
          </blockquote>

          <figcaption className="mt-7 flex items-center gap-3.5">
            <span
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-light font-heading text-base font-extrabold text-brand"
              aria-hidden="true"
            >
              {active.name.split(' ').map((n) => n[0]).join('')}
            </span>
            <span>
              <span className="block font-heading text-[0.95rem] font-bold text-ink">{active.name}</span>
              <span className="block text-[0.875rem] text-body">
                {active.role}, {active.company}
              </span>
            </span>
          </figcaption>
        </figure>

        <div className="mt-6 flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => go(-1)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full ring-1 ring-line transition-colors hover:bg-brand hover:text-white hover:ring-brand"
            aria-label="Previous testimonial"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          <div className="flex gap-2">
            {TESTIMONIALS.map((t, i) => (
              <button
                key={t.name}
                type="button"
                onClick={() => setIndex(i)}
                className={cn(
                  'h-2 rounded-full transition-all',
                  i === index ? 'w-7 bg-brand' : 'w-2 bg-line hover:bg-brand/40',
                )}
                aria-label={`Show testimonial ${i + 1} of ${TESTIMONIALS.length}`}
                aria-current={i === index}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={() => go(1)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full ring-1 ring-line transition-colors hover:bg-brand hover:text-white hover:ring-brand"
            aria-label="Next testimonial"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>
    </Section>
  );
}
