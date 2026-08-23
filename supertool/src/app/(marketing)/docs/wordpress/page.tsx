import Link from 'next/link';
import { CtaBand } from '@/components/marketing/CtaBand';
import { Section } from '@/components/marketing/Section';
import { JsonLd } from '@/components/JsonLd';
import { breadcrumbSchema, faqSchema, pageMetadata } from '@/lib/metadata';
import { brand } from '../../../../../brand.config';

export const metadata = pageMetadata({
  title: 'WordPress Plugin Setup',
  description:
    'Install the Rank Logic SuperTool WordPress plugin: upload, paste your project key, verify the connection and add the optional Elementor templates.',
  path: '/docs/wordpress',
  keywords: ['WordPress plugin setup', 'Elementor SEO widget', 'SuperTool WordPress'],
});

const STEPS = [
  {
    title: 'Download the plugin',
    body: 'In SuperTool, open Settings → Connections → WordPress and download the plugin ZIP. It is also in the repository under wordpress/rank-logic-supertool.',
  },
  {
    title: 'Upload and activate',
    body: 'In WordPress, go to Plugins → Add New → Upload Plugin, choose the ZIP and activate. No FTP, no theme edits, no code changes.',
  },
  {
    title: 'Paste your project key',
    body: 'A new SuperTool menu appears in the WordPress sidebar. Paste the project key from Settings → Connections and press Verify. A green tick means the handshake succeeded.',
  },
  {
    title: 'Choose your SEO plugin',
    body: 'The plugin auto-detects Yoast or Rank Math and writes meta title, description and canonical through whichever it finds. If neither is installed it falls back to its own meta output.',
  },
  {
    title: 'Enable attribution (optional)',
    body: 'Tick "Track AI referrals" to output the cookieless attribution snippet. It tags visits arriving from known answer-engine referrers so AI-sourced leads are identifiable.',
  },
  {
    title: 'Add Elementor widgets (optional)',
    body: 'Three widgets appear in the Elementor panel under "Rank Logic": AI Visibility Score, Engine Breakdown and Citation Feed. Drag any of them onto a page; they inherit your theme typography.',
  },
];

const FAQS = [
  {
    q: 'What are the minimum requirements?',
    a: 'WordPress 6.0 or later on PHP 7.4 or later, with the REST API enabled (it is by default). The plugin uses only core APIs and standard hooks, so it works with both block and classic themes.',
  },
  {
    q: 'Does it conflict with Yoast or Rank Math?',
    a: 'No. It detects whichever is active and writes through its meta fields rather than replacing them. Your existing SEO plugin stays authoritative.',
  },
  {
    q: 'Do the Elementor widgets need Elementor Pro?',
    a: 'No. They register against free Elementor and inherit your theme colours and typography rather than importing their own design system.',
  },
  {
    q: 'Can I publish without the plugin?',
    a: 'Yes, using a WordPress application password and the standard REST API. The plugin adds schema injection, SEO-plugin passthrough, attribution and the Elementor widgets on top of that.',
  },
];

export default function WordPressDocsPage() {
  return (
    <>
      <JsonLd
        data={[
          breadcrumbSchema([
            { name: 'Home', path: '/' },
            { name: 'WordPress setup', path: '/docs/wordpress' },
          ]),
          faqSchema(FAQS),
        ]}
      />

      <section className="bg-navy">
        <div className="container-x py-14 lg:py-20">
          <div className="max-w-3xl">
            <p className="eyebrow eyebrow-dark">Documentation</p>
            <h1 className="mt-5 text-display-lg text-white text-balance">
              WordPress plugin setup
            </h1>
            <p className="mt-5 text-[1.0625rem] leading-[1.7] text-white/70 text-pretty">
              Six steps, no code. The plugin adds no front-end CSS and takes
              over none of your existing metadata.
            </p>
          </div>
        </div>
      </section>

      <Section>
        <div className="mx-auto max-w-3xl">
          <ol className="space-y-8">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-5">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand font-heading font-extrabold text-white">
                  {i + 1}
                </span>
                <div>
                  <h2 className="font-heading text-[1.15rem] font-bold text-ink">{s.title}</h2>
                  <p className="mt-2 prose-body">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-12 rounded-2xl bg-surface-alt p-7">
            <h2 className="font-heading text-[1.1rem] font-bold text-ink">Verifying the connection</h2>
            <p className="mt-3 prose-body">
              The plugin calls <code className="rounded bg-white px-1.5 py-0.5 text-[0.85em] ring-1 ring-line">/api/v1/wordpress/verify</code>{' '}
              with your project key. A successful response returns the project name and domain, which the
              settings screen displays back to you — so a wrong key fails loudly rather than silently.
            </p>
            <p className="mt-3 prose-body">
              If verification fails, check that your site can reach{' '}
              <span className="font-semibold text-ink">{brand.domain}</span> over HTTPS and that no
              security plugin is blocking outbound requests.
            </p>
          </div>

          <div className="mt-10">
            <h2 className="font-heading text-[1.4rem] font-extrabold text-ink">Frequently asked</h2>
            <dl className="mt-6 space-y-6">
              {FAQS.map((f) => (
                <div key={f.q}>
                  <dt className="font-heading text-[1.02rem] font-bold text-ink">{f.q}</dt>
                  <dd className="mt-2 prose-body">{f.a}</dd>
                </div>
              ))}
            </dl>
          </div>

          <p className="mt-10 text-[0.9rem] text-body">
            Still stuck? <Link href="/contact" className="font-semibold text-brand hover:underline">Contact support</Link> — we reply within one business day.
          </p>
        </div>
      </Section>

      <CtaBand />
    </>
  );
}
