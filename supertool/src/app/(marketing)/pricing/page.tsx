import { CtaBand } from '@/components/marketing/CtaBand';
import { Faq } from '@/components/marketing/Faq';
import { PricingTable } from '@/components/marketing/PricingTable';
import { Section, SectionHeading } from '@/components/marketing/Section';
import { JsonLd } from '@/components/JsonLd';
import { FAQS } from '@/content/site';
import { breadcrumbSchema, faqSchema, pageMetadata, softwareApplicationSchema } from '@/lib/metadata';

export const metadata = pageMetadata({
  title: 'Pricing',
  description:
    'Simple plans from $65/month. Every plan includes the answer engines this deployment can measure, the WordPress plugin and a 14-day free trial with no card required.',
  path: '/pricing',
  keywords: ['AI SEO platform pricing', 'GEO tool cost', 'SEO software pricing'],
});

/**
 * Plan comparison.
 *
 * Rows for white-label reporting, bring-your-own API keys, team seats and lead
 * attribution were removed rather than marked "—" on every plan: none of them
 * exists, so listing them at all implies a roadmap commitment the product has
 * not made. What is genuinely unavailable is stated once, plainly, under the
 * table.
 */
const COMPARE = [
  { label: 'Projects', starter: '1', growth: '5', scale: 'Unlimited' },
  { label: 'Tracked prompts', starter: '25', growth: '150', scale: '1,000' },
  { label: 'Measurable answer engines', starter: 'Up to 5', growth: 'Up to 5', scale: 'Up to 5' },
  { label: 'Check frequency', starter: 'Weekly', growth: 'Daily', scale: 'Daily' },
  { label: 'Tracked keywords', starter: '250', growth: '2,000', scale: '20,000' },
  { label: 'Site audit pages', starter: '100', growth: '1,000', scale: 'Unlimited' },
  { label: 'Content briefs + answer-readiness scoring', starter: '—', growth: 'Included', scale: 'Included' },
  { label: 'WordPress publishing', starter: 'Included', growth: 'Included', scale: 'Included' },
  { label: 'CSV / JSON export', starter: 'Included', growth: 'Included', scale: 'Included' },
  { label: 'Project API keys', starter: '—', growth: '—', scale: 'Included' },
];

export default function PricingPage() {
  return (
    <>
      <JsonLd
        data={[
          breadcrumbSchema([{ name: 'Home', path: '/' }, { name: 'Pricing', path: '/pricing' }]),
          softwareApplicationSchema({ lowPrice: 65, highPrice: 749 }),
          faqSchema(FAQS.map((f) => ({ q: f.q, a: f.a }))),
        ]}
      />

      <section className="relative overflow-hidden bg-navy">
        <div className="pointer-events-none absolute inset-0 bg-grid-faint [background-size:64px_64px]" aria-hidden="true" />
        <div className="container-x relative py-16 text-center lg:py-20">
          <p className="eyebrow eyebrow-dark">Pricing</p>
          <h1 className="mx-auto mt-5 max-w-3xl text-display-xl text-white text-balance">
            One subscription instead of four
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-[1.125rem] leading-[1.7] text-white/75 text-pretty">
            Fourteen days free on every plan, no card required. Your first full run across all
            every connected answer engine happens before you decide anything.
          </p>
        </div>
      </section>

      <Section className="!pt-14">
        <PricingTable />
      </Section>

      <Section className="bg-surface-alt !pt-0">
        <SectionHeading eyebrow="Compare" title="Every plan, side by side" />
        <div className="mt-12 overflow-x-auto">
          <table className="w-full min-w-[42rem] border-separate border-spacing-0 overflow-hidden rounded-2xl bg-white ring-1 ring-line">
            <caption className="sr-only">Feature comparison across Starter, Growth and Scale plans</caption>
            <thead>
              <tr>
                <th scope="col" className="table-head border-b border-line px-6 py-4 text-left">Feature</th>
                <th scope="col" className="table-head border-b border-line px-6 py-4 text-center">Starter</th>
                <th scope="col" className="table-head border-b border-line bg-brand-50 px-6 py-4 text-center">Growth</th>
                <th scope="col" className="table-head border-b border-line px-6 py-4 text-center">Scale</th>
              </tr>
            </thead>
            <tbody>
              {COMPARE.map((row, i) => (
                <tr key={row.label} className={i % 2 ? 'bg-surface-alt/60' : undefined}>
                  <th scope="row" className="border-b border-line px-6 py-3.5 text-left text-[0.9rem] font-semibold text-ink">
                    {row.label}
                  </th>
                  <td className="border-b border-line px-6 py-3.5 text-center text-[0.9rem] text-body">{row.starter}</td>
                  <td className="border-b border-line bg-brand-50/60 px-6 py-3.5 text-center text-[0.9rem] font-semibold text-ink">{row.growth}</td>
                  <td className="border-b border-line px-6 py-3.5 text-center text-[0.9rem] text-body">{row.scale}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section>
        <SectionHeading eyebrow="Questions" title="Before you pick a plan" />
        <div className="mt-12">
          <Faq items={FAQS} />
        </div>
      </Section>

      <CtaBand
        title="Start on the free trial, decide later"
        sub="Fourteen days, every feature on your chosen plan, no card. If it does not show you something you did not already know, do not pay us."
      />
    </>
  );
}
