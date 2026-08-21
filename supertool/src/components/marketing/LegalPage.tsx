import type { LegalSection } from '@/content/legal';

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
