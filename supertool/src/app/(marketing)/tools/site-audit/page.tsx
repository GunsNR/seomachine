import { CtaBand } from '@/components/marketing/CtaBand';
import { Section } from '@/components/marketing/Section';
import { JsonLd } from '@/components/JsonLd';
import { breadcrumbSchema, faqSchema, pageMetadata } from '@/lib/metadata';
import { AuditForm } from './AuditForm';

export const metadata = pageMetadata({
  title: 'Free SEO Site Audit',
  description:
    'Crawl your site for technical SEO, on-page, performance and schema issues — plus an AI-readiness score that grades whether answer engines could quote your pages.',
  path: '/tools/site-audit',
  keywords: ['free SEO audit', 'website audit tool', 'technical SEO checker', 'AI readiness check'],
});

const FAQS = [
  {
    q: 'How many pages does the free audit crawl?',
    a: 'Up to five pages, breadth-first from the URL you enter. Paid plans crawl up to 100, 1,000 or unlimited pages depending on plan.',
  },
  {
    q: 'What is an AI readiness score?',
    a: 'A nine-signal grade of whether an answer engine could lift and attribute a passage from your page: does it open with a direct answer, does it carry verifiable statistics, are claims sourced, are passages self-contained, are headings question-shaped, and is there machine-readable structure.',
  },
  {
    q: 'Will the crawler hurt my site?',
    a: 'No. It fetches a handful of pages with limited concurrency and identifies itself as RankLogicSuperToolBot, so you can rate-limit or exclude it in robots.txt if you prefer.',
  },
];

export default function SiteAuditToolPage() {
  return (
    <>
      <JsonLd
        data={[
          breadcrumbSchema([
            { name: 'Home', path: '/' },
            { name: 'Free SEO audit', path: '/tools/site-audit' },
          ]),
          faqSchema(FAQS),
        ]}
      />

      <section className="relative overflow-hidden bg-navy">
        <div className="pointer-events-none absolute inset-0 bg-grid-faint [background-size:64px_64px]" aria-hidden="true" />
        <div className="container-x relative py-16 text-center lg:py-20">
          <p className="eyebrow eyebrow-dark">Free tool</p>
          <h1 className="mx-auto mt-5 max-w-3xl text-display-xl text-white text-balance">
            Two scores most audits never give you
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-[1.125rem] leading-[1.7] text-white/75 text-pretty">
            The usual technical health check — and an answer-readiness grade that tells you
            whether an AI could quote your page at all.
          </p>
        </div>
      </section>

      <Section className="!py-14">
        <div className="mx-auto max-w-3xl">
          <AuditForm />
        </div>
      </Section>

      <CtaBand
        title="Audit every page, every week"
        sub="The free tool checks five pages once. A paid plan crawls the whole site on a schedule and tracks the score over time."
      />
    </>
  );
}
