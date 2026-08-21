import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { RESULTS } from '@/content/site';
import { Section, SectionHeading } from './Section';

export function Results() {
  return (
    <Section className="bg-surface-alt">
      <SectionHeading
        eyebrow="Results"
        title="What changes when you measure the answer, not just the link"
        sub="Illustrative outcomes from early SuperTool workspaces. Your own baseline is measured on day one, so every number below is one you can hold us to."
      />

      <div className="mt-14 grid gap-6 lg:grid-cols-3">
        {RESULTS.map((r) => (
          <article key={r.label} className="card card-hover flex flex-col p-8">
            <p className="font-heading text-[3rem] font-extrabold leading-none text-brand">{r.metric}</p>
            <h3 className="mt-3 font-heading text-[1.1rem] font-bold text-ink">{r.label}</h3>
            <p className="mt-1 text-[0.8rem] font-semibold uppercase tracking-[0.08em] text-body/60">
              {r.client}
            </p>
            <p className="mt-4 flex-1 text-[0.9375rem] leading-[1.7] text-body">{r.detail}</p>
          </article>
        ))}
      </div>

      <div className="mt-10 text-center">
        <Link href="/contact" className="btn btn-md btn-ghost">
          See a walkthrough on your own domain
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </Section>
  );
}
