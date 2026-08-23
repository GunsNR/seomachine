import type { LegalSection } from '@/content/legal';
import { brand } from '../../../brand.config';

export function LegalPage({
  title, updated, intro, sections,
}: { title: string; updated: string; intro: string; sections: LegalSection[] }) {
  return (
    <>
      <section className="bg-navy">
        <div className="container-x py-14 lg:py-18">
          <h1 className="text-display-lg text-white text-balance">{title}</h1>
          <p className="mt-4 text-[0.9rem] text-white/60">
            Last updated{' '}
            <time dateTime={updated}>
              {new Date(`${updated}T00:00:00Z`).toLocaleDateString('en-US', {
                year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
              })}
            </time>
          </p>
        </div>
      </section>

      <div className="container-x py-14 lg:py-20">
        <div className="mx-auto max-w-3xl">
          {!brand.identityVerified && (
            <div
              className="mb-8 rounded-xl bg-warn/10 p-5 text-[0.875rem] leading-relaxed text-ink ring-1 ring-warn/25"
              role="note"
            >
              <strong className="font-semibold">Draft — not yet reviewed by counsel.</strong>{' '}
              This document was drafted in-product and has not been reviewed by a qualified
              lawyer. The company identity and contact details it references are placeholders
              pending owner confirmation. It is not legal advice and should not be relied on as a
              binding agreement or as evidence of regulatory compliance until it has been reviewed
              and the identity details verified.
            </div>
          )}

          <p className="prose-body text-pretty">{intro}</p>

          <nav aria-label="On this page" className="mt-10 rounded-2xl bg-surface-alt p-6">
            <h2 className="font-heading text-[0.95rem] font-bold text-ink">On this page</h2>
            <ol className="mt-3 space-y-1.5">
              {sections.map((s, i) => (
                <li key={s.heading}>
                  <a href={`#s${i}`} className="text-[0.9rem] text-body hover:text-brand">
                    {i + 1}. {s.heading}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="mt-12 space-y-10">
            {sections.map((s, i) => (
              <section key={s.heading} id={`s${i}`} className="scroll-mt-28">
                <h2 className="font-heading text-[1.4rem] font-extrabold text-ink">
                  {i + 1}. {s.heading}
                </h2>
                <div className="mt-4 space-y-4">
                  {s.body.map((p) => <p key={p.slice(0, 40)} className="prose-body text-pretty">{p}</p>)}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
