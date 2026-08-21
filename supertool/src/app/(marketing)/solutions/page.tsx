import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { CtaBand } from '@/components/marketing/CtaBand';
import { Section, SectionHeading } from '@/components/marketing/Section';
import { JsonLd } from '@/components/JsonLd';
import { SOLUTION_PAGES } from '@/content/platform';
import { breadcrumbSchema, pageMetadata } from '@/lib/metadata';

export const metadata = pageMetadata({
  title: 'Solutions',
  description:
    'How agencies, in-house marketing teams and founders use Rank Logic SuperTool — and how to apply it to a specific goal like getting cited by ChatGPT or recovering lost traffic.',
  path: '/solutions',
  keywords: ['SEO for agencies', 'in-house SEO platform', 'founder SEO tool'],
});

export default function SolutionsIndexPage() {
  const byTeam = SOLUTION_PAGES.filter((p) => p.eyebrow !== 'By goal');
  const byGoal = SOLUTION_PAGES.filter((p) => p.eyebrow === 'By goal');

  return (
    <>
      <JsonLd data={breadcrumbSchema([{ name: 'Home', path: '/' }, { name: 'Solutions', path: '/solutions' }])} />

      <section className="relative overflow-hidden bg-navy">
        <div className="pointer-events-none absolute inset-0 bg-grid-faint [background-size:64px_64px]" aria-hidden="true" />
        <div className="container-x relative py-16 text-center lg:py-24">
          <p className="eyebrow eyebrow-dark">Solutions</p>
          <h1 className="mx-auto mt-5 max-w-4xl text-display-xl text-white text-balance">
            Same platform. Very different weeks.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-[1.125rem] leading-[1.7] text-white/75 text-pretty">
            An agency running twenty client sites and a founder writing their own posts need
            the same measurements and completely different workflows. Start where you are.
          </p>
        </div>
      </section>

      <Section>
        <SectionHeading eyebrow="By team" title="Built for how you actually work" />
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {byTeam.map((p) => (
            <Link key={p.slug} href={`/solutions/${p.slug}`} className="card card-hover group flex flex-col p-8">
              <h3 className="font-heading text-[1.25rem] font-bold text-ink">{p.title}</h3>
              <p className="mt-3 flex-1 text-[0.9375rem] leading-[1.7] text-body">{p.lead}</p>
              <ul className="mt-5 space-y-2 border-t border-line pt-5">
                {p.outcomes.slice(0, 3).map((o) => (
                  <li key={o} className="text-[0.875rem] text-body">• {o}</li>
                ))}
              </ul>
              <span className="mt-6 inline-flex items-center gap-1.5 text-[0.9rem] font-bold text-brand">
                Read more
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
              </span>
            </Link>
          ))}
        </div>
      </Section>

      <Section className="bg-surface-alt">
        <SectionHeading eyebrow="By goal" title="Start from the outcome you need" />
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {byGoal.map((p) => (
            <Link key={p.slug} href={`/solutions/${p.slug}`} className="card card-hover group flex flex-col p-8">
              <h3 className="font-heading text-[1.25rem] font-bold text-ink">{p.title}</h3>
              <p className="mt-3 flex-1 text-[0.9375rem] leading-[1.7] text-body">{p.lead}</p>
              <span className="mt-6 inline-flex items-center gap-1.5 text-[0.9rem] font-bold text-brand">
                Read more
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
              </span>
            </Link>
          ))}
        </div>
      </Section>

      <CtaBand />
    </>
  );
}
