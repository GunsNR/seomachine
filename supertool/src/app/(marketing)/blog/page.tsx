import Link from 'next/link';
import { ArrowRight, Clock } from 'lucide-react';
import { CtaBand } from '@/components/marketing/CtaBand';
import { Section } from '@/components/marketing/Section';
import { JsonLd } from '@/components/JsonLd';
import { POSTS } from '@/content/blog';
import { breadcrumbSchema, pageMetadata } from '@/lib/metadata';

export const metadata = pageMetadata({
  title: 'Resources',
  description:
    'Research and practical guides on generative engine optimization, AI search visibility, citation tracking and the measurable half of modern SEO.',
  path: '/blog',
  keywords: ['GEO guide', 'AI search research', 'SEO resources'],
});

export default function BlogIndexPage() {
  const [featured, ...rest] = [...POSTS].sort((a, b) => b.published.localeCompare(a.published));

  return (
    <>
      <JsonLd data={breadcrumbSchema([{ name: 'Home', path: '/' }, { name: 'Resources', path: '/blog' }])} />

      <section className="relative overflow-hidden bg-navy">
        <div className="pointer-events-none absolute inset-0 bg-grid-faint [background-size:64px_64px]" aria-hidden="true" />
        <div className="container-x relative py-16 text-center lg:py-20">
          <p className="eyebrow eyebrow-dark">Resources</p>
          <h1 className="mx-auto mt-5 max-w-3xl text-display-xl text-white text-balance">
            The measurable half of modern search
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-[1.125rem] leading-[1.7] text-white/75 text-pretty">
            Research and working guides on generative engine optimization — written to be useful
            whether or not you ever buy anything from us.
          </p>
        </div>
      </section>

      <Section>
        <Link href={`/blog/${featured.slug}`} className="card card-hover group block overflow-hidden">
          <div className="grid gap-0 lg:grid-cols-[1.2fr_1fr]">
            <div className="p-8 lg:p-11">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="eyebrow">Latest</span>
                {featured.tags.slice(0, 2).map((t) => (
                  <span key={t} className="rounded-full bg-surface-alt px-3 py-1 text-[0.72rem] font-bold uppercase tracking-[0.08em] text-body">
                    {t}
                  </span>
                ))}
              </div>
              <h2 className="mt-5 font-heading text-[1.75rem] font-extrabold leading-tight text-ink text-balance">
                {featured.title}
              </h2>
              <p className="mt-4 text-[1rem] leading-[1.7] text-body">{featured.description}</p>
              <div className="mt-6 flex items-center gap-4 text-[0.82rem] text-body">
                <time dateTime={featured.published}>{formatDate(featured.published)}</time>
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                  {featured.readingMinutes} min read
                </span>
              </div>
              <span className="mt-6 inline-flex items-center gap-1.5 font-bold text-brand">
                Read the guide
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
              </span>
            </div>
            <div className="hidden bg-navy p-11 lg:flex lg:items-center lg:justify-center">
              <p className="font-heading text-[5rem] font-extrabold leading-none text-white/12">GEO</p>
            </div>
          </div>
        </Link>

        <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {rest.map((p) => (
            <article key={p.slug}>
              <Link href={`/blog/${p.slug}`} className="card card-hover group flex h-full flex-col p-7">
                <div className="flex flex-wrap gap-2">
                  {p.tags.slice(0, 2).map((t) => (
                    <span key={t} className="rounded-full bg-surface-alt px-2.5 py-1 text-[0.68rem] font-bold uppercase tracking-[0.08em] text-body">
                      {t}
                    </span>
                  ))}
                </div>
                <h2 className="mt-4 font-heading text-[1.15rem] font-bold leading-snug text-ink">{p.title}</h2>
                <p className="mt-3 flex-1 text-[0.9rem] leading-[1.7] text-body">{p.description}</p>
                <div className="mt-5 flex items-center gap-3 text-[0.78rem] text-body">
                  <time dateTime={p.published}>{formatDate(p.published)}</time>
                  <span>·</span>
                  <span>{p.readingMinutes} min</span>
                </div>
              </Link>
            </article>
          ))}
        </div>
      </Section>

      <CtaBand />
    </>
  );
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  });
}
