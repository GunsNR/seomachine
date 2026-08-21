import { CtaBand } from '@/components/marketing/CtaBand';
import { Section } from '@/components/marketing/Section';
import { EngineRow } from '@/components/marketing/EngineRow';
import { JsonLd } from '@/components/JsonLd';
import { breadcrumbSchema, faqSchema, pageMetadata } from '@/lib/metadata';
import { AiCheckForm } from './AiCheckForm';

export const metadata = pageMetadata({
  title: 'Free AI Visibility Check',
  description:
    'Find out how often ChatGPT, Perplexity, Claude, Gemini, Grok and Google AI Mode name your brand. Free, no account, results in about a minute.',
  path: '/tools/ai-visibility-check',
  keywords: ['free AI visibility check', 'ChatGPT brand check', 'AI search visibility test'],
});

const FAQS = [
  {
    q: 'Is the free check really free?',
    a: 'Yes. It runs four buyer questions across all six answer engines and returns your mention rate, citation rate, share of voice and the competitors named alongside you. No account, no card.',
  },
  {
    q: 'How is this different from asking ChatGPT myself?',
    a: 'Model outputs vary between runs, so a single answer tells you very little. This check runs a structured prompt set across six engines and reports the inclusion rate, which is the number that actually trends.',
  },
  {
    q: 'What do I get on a paid plan?',
    a: 'A far larger prompt set tracked on a daily schedule, full history, per-URL citation attribution, competitor share of voice over time, content scoring and one-click publishing.',
  },
];

export default function AiVisibilityCheckPage() {
  return (
    <>
      <JsonLd
        data={[
          breadcrumbSchema([
            { name: 'Home', path: '/' },
            { name: 'Free AI visibility check', path: '/tools/ai-visibility-check' },
          ]),
          faqSchema(FAQS),
        ]}
      />

      <section className="relative overflow-hidden bg-navy">
        <div className="pointer-events-none absolute inset-0 bg-grid-faint [background-size:64px_64px]" aria-hidden="true" />
        <div className="container-x relative py-16 text-center lg:py-20">
          <p className="eyebrow eyebrow-dark">Free tool</p>
          <h1 className="mx-auto mt-5 max-w-3xl text-display-xl text-white text-balance">
            Does AI recommend you, or your competitor?
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-[1.125rem] leading-[1.7] text-white/75 text-pretty">
            Run four real buyer questions across all six answer engines and see who gets named.
            No account, no card, about a minute.
          </p>
          <EngineRow dark className="mt-9" />
        </div>
      </section>

      <Section className="!py-14">
        <div className="mx-auto max-w-3xl">
          <AiCheckForm />
        </div>
      </Section>

      <Section className="bg-surface-alt !pt-0">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-display-md text-center text-balance">How the check works</h2>
          <ol className="mt-10 space-y-6">
            {[
              ['We build a prompt set', 'Four questions covering discovery, comparison and brand intent — the kinds of things buyers actually ask an assistant before shortlisting a vendor.'],
              ['Every engine is asked', 'ChatGPT, Perplexity, Claude, Gemini, Grok and Google AI Mode each answer the same questions, so differences between them are real signal.'],
              ['Answers are parsed', 'We detect whether your brand is named, whether your own domain is cited as a source, which competitors appear, and in what order.'],
              ['You get a score', 'Mention rate, citation rate and share of voice roll into one 0-100 visibility score you can track over time.'],
            ].map(([title, body], i) => (
              <li key={title} className="flex gap-5">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand font-heading font-extrabold text-white">
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-heading text-[1.05rem] font-bold text-ink">{title}</h3>
                  <p className="mt-1.5 text-[0.9375rem] leading-[1.7] text-body">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </Section>

      <CtaBand
        title="Track it properly, every day"
        sub="The free check is a snapshot. A paid plan tracks a full prompt set daily, keeps the evidence, and tells you which page to rewrite to fix it."
      />
    </>
  );
}
