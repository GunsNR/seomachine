import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { CtaBand } from '@/components/marketing/CtaBand';
import { Section, SectionHeading } from '@/components/marketing/Section';
import { EngineRow } from '@/components/marketing/EngineRow';
import { JsonLd } from '@/components/JsonLd';
import { PLATFORM_PAGES } from '@/content/platform';
import { breadcrumbSchema, pageMetadata } from '@/lib/metadata';

export const metadata = pageMetadata({
  title: 'Platform',
  description:
    'AI visibility tracking, citation monitoring, site audit, keyword research, content briefs and scoring, and WordPress publishing — in one platform.',
  path: '/platform',
  keywords: ['AI SEO platform', 'GEO software', 'SEO tool suite'],
});

const GROUPS = ['AI Search', 'Classic SEO', 'Content & Revenue'] as const;

export default function PlatformIndexPage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema([{ name: 'Home', path: '/' }, { name: 'Platform', path: '/platform' }])} />

      <section className="relative overflow-hidden bg-navy">
        <div className="pointer-events-none absolute inset-0 bg-grid-faint [background-size:64px_64px]" aria-hidden="true" />
        <div className="container-x relative py-16 text-center lg:py-24">
          <p className="eyebrow eyebrow-dark">Platform</p>
          <h1 className="mx-auto mt-5 max-w-4xl text-display-xl text-white text-balance">
            Nine capabilities. One place your content is actually measured.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-[1.125rem] leading-[1.7] text-white/75 text-pretty">
            Answer engines and classic search are two channels feeding one pipeline.
            SuperTool measures, improves and attributes both against the same pages.
          </p>
          <EngineRow dark className="mt-10" />
        </div>
      </section>

      {GROUPS.map((group, gi) => (
        <Section key={group} className={gi % 2 === 1 ? 'bg-surface-alt' : undefined}>
          <SectionHeading eyebrow={group} title={groupTitle(group)} sub={groupSub(group)} />
          <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {PLATFORM_PAGES.filter((p) => p.eyebrow === group).map((p) => (
              <Link key={p.slug} href={`/platform/${p.slug}`} className="card card-hover group flex flex-col p-7">
                <h3 className="font-heading text-[1.2rem] font-bold text-ink">{p.title}</h3>
                <p className="mt-3 flex-1 text-[0.9375rem] leading-[1.7] text-body">{p.lead}</p>
                <span className="mt-6 inline-flex items-center gap-1.5 text-[0.9rem] font-bold text-brand">
                  Explore
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                </span>
              </Link>
            ))}
          </div>
        </Section>
      ))}

      <CtaBand />
    </>
  );
}

function groupTitle(g: string): string {
  if (g === 'AI Search') return 'Measure the channel nobody else reports on';
  if (g === 'Classic SEO') return 'The fundamentals, rebuilt for the current SERP';
  return 'Publish it, then prove it earned something';
}

function groupSub(g: string): string {
  if (g === 'AI Search')
    return 'Every connected engine, a fixed prompt set and evidence stored for every check — so "are we in AI results?" becomes a number with a trend line and a stated coverage.';
  if (g === 'Classic SEO')
    return 'An audit that grades answer-readiness, and keyword scoring that ranks work rather than listing it — with every figure labelled measured, part-modelled or estimated.';
  return 'One-click publishing that respects your existing stack, and attribution that ties an assistant answer to a lead in your CRM.';
}
