import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';
import type { FeaturePageData } from '@/content/platform';
import { featureHref, findFeaturePage } from '@/content/platform';
import { CtaBand } from './CtaBand';
import { Faq } from './Faq';
import { Section, SectionHeading } from './Section';

/** Shared layout for every platform and solution page. */
export function FeaturePage({ data, basePath }: { data: FeaturePageData; basePath: string }) {
  const related = data.related
    .map((slug) => findFeaturePage(slug))
    .filter((p): p is FeaturePageData => !!p);

  return (
    <>
      <section className="relative overflow-hidden bg-navy">
        <div className="pointer-events-none absolute inset-0 bg-grid-faint [background-size:64px_64px]" aria-hidden="true" />
        <div
          className="pointer-events-none absolute -left-32 -top-32 h-[28rem] w-[28rem] rounded-full opacity-35 blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(20,102,216,.6), transparent 65%)' }}
          aria-hidden="true"
        />
        <div className="container-x relative py-16 lg:py-24">
          <nav aria-label="Breadcrumb" className="mb-6">
            <ol className="flex flex-wrap items-center gap-2 text-[0.8rem] text-white/55">
              <li><Link href="/" className="hover:text-white">Home</Link></li>
              <li aria-hidden="true">/</li>
              <li>
                <Link href={basePath} className="hover:text-white">
                  {basePath === '/platform' ? 'Platform' : 'Solutions'}
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li className="text-white/85">{data.title}</li>
            </ol>
          </nav>

          <div className="max-w-3xl">
            <p className="eyebrow eyebrow-dark">{data.eyebrow}</p>
            <h1 className="mt-5 text-display-xl text-white text-balance">{data.title}</h1>
            <p className="mt-6 text-[1.125rem] leading-[1.7] text-white/75 text-pretty">{data.lead}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/signup" className="btn btn-lg btn-accent">
                Start free trial
                <ArrowRight className="h-4.5 w-4.5" aria-hidden="true" />
              </Link>
              <Link href="/contact" className="btn btn-lg btn-onnavy">Book a demo</Link>
            </div>
          </div>
        </div>
      </section>

      <Section>
        <div className="grid gap-12 lg:grid-cols-[1fr_1.15fr] lg:gap-16">
          <div>
            <p className="eyebrow">The problem</p>
            <h2 className="mt-4 text-display-md text-balance">{data.problem.heading}</h2>
          </div>
          <div className="prose-body space-y-5">
            {data.problem.body.map((p) => <p key={p.slice(0, 40)}>{p}</p>)}
          </div>
        </div>
      </Section>

      <Section className="bg-surface-alt">
        <SectionHeading eyebrow="What you get" title={`Inside ${data.title}`} />
        <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {data.capabilities.map((c, i) => (
            <article key={c.title} className="card card-hover p-7">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-light font-heading text-[0.95rem] font-extrabold text-brand">
                {String(i + 1).padStart(2, '0')}
              </span>
              <h3 className="mt-4 font-heading text-[1.1rem] font-bold text-ink">{c.title}</h3>
              <p className="mt-2.5 text-[0.9375rem] leading-[1.7] text-body">{c.body}</p>
            </article>
          ))}
        </div>
      </Section>

      <Section>
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <p className="eyebrow">Outcomes</p>
            <h2 className="mt-4 text-display-md text-balance">What changes once this is running</h2>
            <p className="prose-body mt-5">
              Every item below is something you can check in the product within the first
              two weeks, not a promise that resolves in a quarter.
            </p>
            <Link href="/pricing" className="btn btn-md btn-primary mt-8">
              See pricing
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <ul className="space-y-4">
            {data.outcomes.map((o) => (
              <li key={o} className="flex items-start gap-3.5 rounded-xl bg-surface-alt p-5">
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ok text-white">
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                <span className="font-heading text-[1rem] font-semibold text-ink">{o}</span>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <Section className="bg-surface-alt">
        <SectionHeading eyebrow="Questions" title={`${data.title} FAQs`} />
        <div className="mt-12">
          <Faq items={data.faqs} />
        </div>
      </Section>

      {related.length > 0 && (
        <Section>
          <SectionHeading eyebrow="Keep reading" title="Related capabilities" />
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {related.map((r) => (
                <Link key={r.slug} href={featureHref(r.slug)} className="card card-hover group flex flex-col p-7">
                  <p className="text-[0.7rem] font-bold uppercase tracking-[0.12em] text-brand">{r.eyebrow}</p>
                  <h3 className="mt-2.5 font-heading text-[1.15rem] font-bold text-ink">{r.title}</h3>
                  <p className="mt-2.5 flex-1 text-[0.9rem] leading-[1.7] text-body">{r.lead}</p>
                  <span className="mt-5 inline-flex items-center gap-1.5 text-[0.9rem] font-bold text-brand">
                    Read more
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                  </span>
                </Link>
            ))}
          </div>
        </Section>
      )}

      <CtaBand />
    </>
  );
}
