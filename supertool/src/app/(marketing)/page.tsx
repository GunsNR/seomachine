import Link from 'next/link';
import { ArrowRight, BarChart3, Bot, Link2, Target } from 'lucide-react';
import { CtaBand } from '@/components/marketing/CtaBand';
import { Faq } from '@/components/marketing/Faq';
import { Hero } from '@/components/marketing/Hero';
import { PricingTable } from '@/components/marketing/PricingTable';
import { ProcessSteps } from '@/components/marketing/ProcessSteps';
import { Results } from '@/components/marketing/Results';
import { Section, SectionHeading } from '@/components/marketing/Section';
import { ServiceGrid } from '@/components/marketing/ServiceGrid';
import { StatBar } from '@/components/marketing/StatBar';
import { Testimonials } from '@/components/marketing/Testimonials';
import { JsonLd } from '@/components/JsonLd';
import { FAQS } from '@/content/site';
import { faqSchema, pageMetadata, softwareApplicationSchema } from '@/lib/metadata';

export const metadata = pageMetadata({
  title: 'AI Search Visibility & SEO Platform',
  description:
    'Track your brand across ChatGPT, Perplexity, Claude, Gemini, Grok and Google AI Mode. Write content built to be cited, publish it to WordPress in one click, and attribute every lead it earns.',
  path: '/',
  keywords: [
    'AI search visibility', 'generative engine optimization', 'GEO platform',
    'AI SEO tool', 'ChatGPT citation tracking', 'answer engine optimization',
    'AI visibility tracker', 'WordPress SEO plugin',
  ],
});

const DIFFERENTIATORS = [
  {
    icon: Bot,
    title: 'Both channels, one score',
    body: 'Classic rank tracking and answer-engine visibility measured against the same pages, in the same dashboard, on the same day. No reconciling two tools that disagree.',
  },
  {
    icon: Target,
    title: 'Scoring you can act on',
    body: 'A nine-signal GEO model that names the fix: which claims need a source, which sentences no model can quote, which heading should have been a question.',
  },
  {
    icon: Link2,
    title: 'Publishing that does not fight your stack',
    body: 'A WordPress plugin that installs in five minutes, writes through Yoast or Rank Math rather than replacing them, and ships optional Elementor widgets.',
  },
  {
    icon: BarChart3,
    title: 'Attribution to revenue',
    body: 'Leads arriving from an assistant are tagged at the source. Report pipeline from Perplexity the same way you report it from Google.',
  },
];

export default function HomePage() {
  return (
    <>
      <JsonLd
        data={[
          softwareApplicationSchema({ lowPrice: 65, highPrice: 749, rating: 4.9, reviewCount: 384 }),
          faqSchema(FAQS.map((f) => ({ q: f.q, a: f.a }))),
        ]}
      />

      <Hero />
      <StatBar />

      {/* The problem framing — why a rank tracker alone now under-reports. */}
      <Section>
        <div className="grid items-center gap-14 lg:grid-cols-2">
          <div>
            <p className="eyebrow">The blind spot</p>
            <h2 className="mt-4 text-display-lg text-balance">
              Your rank tracker says you are fine. Your pipeline disagrees.
            </h2>
            <div className="prose-body mt-6 space-y-4">
              <p>
                When a buyer asks ChatGPT which vendor to use, there is no position one. There is a
                paragraph naming three companies and citing four sources. You are either in that
                paragraph or you are invisible — and no rank tracker built for ten blue links will
                ever tell you which.
              </p>
              <p>
                That is the traffic quietly leaving your reports. Impressions look flat, positions
                look stable, and demo requests fall anyway, because the decision was made in a
                conversation you could not see.
              </p>
              <p className="font-semibold text-ink">
                SuperTool makes that conversation measurable, then gives you the content changes that
                get you into it.
              </p>
            </div>
            <Link href="/platform/ai-visibility" className="btn btn-md btn-primary mt-8">
              See how tracking works
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            {DIFFERENTIATORS.map((d) => (
              <div key={d.title} className="card card-hover p-6">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand-light text-brand">
                  <d.icon className="h-5.5 w-5.5" aria-hidden="true" />
                </span>
                <h3 className="mt-4 font-heading text-[1.05rem] font-bold text-ink">{d.title}</h3>
                <p className="mt-2 text-[0.875rem] leading-[1.7] text-body">{d.body}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <ServiceGrid />
      <ProcessSteps />
      <Results />
      <Testimonials />

      <Section className="bg-surface-alt" id="pricing">
        <SectionHeading
          eyebrow="Pricing"
          title="Priced for the channel it replaces"
          sub="One platform instead of a rank tracker, an AI monitor, a content grader and a publishing workflow. Fourteen days free on every plan."
        />
        <div className="mt-12">
          <PricingTable />
        </div>
      </Section>

      <Section>
        <SectionHeading eyebrow="Questions" title="Everything teams ask before they switch" />
        <div className="mt-12">
          <Faq items={FAQS} />
        </div>
      </Section>

      <CtaBand />
    </>
  );
}
