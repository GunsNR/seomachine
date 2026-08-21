import { CtaBand } from '@/components/marketing/CtaBand';
import { Section, SectionHeading } from '@/components/marketing/Section';
import { StatBar } from '@/components/marketing/StatBar';
import { JsonLd } from '@/components/JsonLd';
import { breadcrumbSchema, pageMetadata } from '@/lib/metadata';
import { brand } from '../../../../brand.config';

export const metadata = pageMetadata({
  title: 'About',
  description: `${brand.name} is built by operators who got tired of reporting flat rankings while pipeline fell. Here is what we believe about the new search landscape.`,
  path: '/about',
  keywords: ['about Rank Logic SuperTool', 'AI SEO company'],
});

const PRINCIPLES = [
  {
    title: 'Measure before you advise',
    body: 'Every claim the product makes about your visibility is backed by a stored answer, a date and a source list. If we cannot show you the evidence, we do not put the number on the screen.',
  },
  {
    title: 'A score that names the fix',
    body: 'A number without an instruction is decoration. Every score in SuperTool decomposes into weighted signals, and every signal carries the specific change that moves it.',
  },
  {
    title: 'Do not fight the stack',
    body: 'Nobody wants a fifth dashboard or a plugin that argues with Yoast. We write through the tools you already run and stay out of the way of the rest.',
  },
  {
    title: 'Be honest about uncertainty',
    body: 'Answer engines are non-deterministic and their behaviour changes without notice. We report inclusion rates over prompt sets rather than pretending a single screenshot is a measurement.',
  },
];

export default function AboutPage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema([{ name: 'Home', path: '/' }, { name: 'About', path: '/about' }])} />

      <section className="relative overflow-hidden bg-navy">
        <div className="pointer-events-none absolute inset-0 bg-grid-faint [background-size:64px_64px]" aria-hidden="true" />
        <div className="container-x relative py-16 lg:py-24">
          <div className="max-w-3xl">
            <p className="eyebrow eyebrow-dark">About us</p>
            <h1 className="mt-5 text-display-xl text-white text-balance">
              Search changed. Most reporting did not.
            </h1>
            <p className="mt-6 text-[1.125rem] leading-[1.7] text-white/75 text-pretty">
              We built SuperTool after one too many quarters of explaining why rankings were
              stable and demos were down. The answer turned out to be a channel none of our
              tools could see.
            </p>
          </div>
        </div>
      </section>

      <StatBar />

      <Section>
        <div className="grid gap-12 lg:grid-cols-[1fr_1.2fr] lg:gap-16">
          <div>
            <p className="eyebrow">Our view</p>
            <h2 className="mt-4 text-display-md text-balance">Inclusion is the new position one</h2>
          </div>
          <div className="prose-body space-y-5">
            <p>
              For twenty years the unit of search was a link in a list, and the discipline that
              grew around it optimised for exactly that: position, click-through, and the traffic
              those two produce.
            </p>
            <p>
              An answer engine returns something structurally different — one synthesised
              paragraph, three named vendors and four sources. There is no second place. You are
              in the answer or you are not, and the properties that get you in are not the ones
              that get you to position one.
            </p>
            <p>
              That is a genuinely new optimisation problem, and it is measurable. Ask the questions
              your buyers ask, record what comes back, and change the pages that lose. The rest of
              this product is that loop, built properly.
            </p>
            <p className="font-semibold text-ink">
              We are not claiming classic SEO is dead. We are claiming it is now half the job, and
              that the other half has no instrumentation. That is the gap we build for.
            </p>
          </div>
        </div>
      </Section>

      <Section className="bg-surface-alt">
        <SectionHeading eyebrow="Principles" title="How we decide what to build" />
        <div className="mt-14 grid gap-6 md:grid-cols-2">
          {PRINCIPLES.map((p) => (
            <article key={p.title} className="card p-8">
              <h3 className="font-heading text-[1.15rem] font-bold text-ink">{p.title}</h3>
              <p className="mt-3 text-[0.9375rem] leading-[1.7] text-body">{p.body}</p>
            </article>
          ))}
        </div>
      </Section>

      <CtaBand />
    </>
  );
}
