import { PROCESS } from '@/content/site';
import { Section, SectionHeading } from './Section';

export function ProcessSteps() {
  return (
    <Section dark className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 bg-grid-faint [background-size:64px_64px]"
        aria-hidden="true"
      />
      <div className="relative">
        <SectionHeading
          dark
          eyebrow="How it works"
          title="From blind spot to booked pipeline in four steps"
          sub="No migration, no re-platforming, no new CMS. Point it at the site you already have."
        />

        <ol className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {PROCESS.map((p, i) => (
            <li key={p.step} className="relative">
              {/* Connector line between steps on wide screens. */}
              {i < PROCESS.length - 1 && (
                <span
                  className="absolute left-[calc(50%+2.5rem)] top-7 hidden h-px w-[calc(100%-5rem)] bg-gradient-to-r from-white/25 to-white/5 lg:block"
                  aria-hidden="true"
                />
              )}
              <div className="relative rounded-2xl bg-white/[0.04] p-6 ring-1 ring-white/10 transition-colors hover:bg-white/[0.07]">
                <div className="flex items-center justify-between">
                  <span className="inline-flex h-14 w-14 items-center justify-center rounded-xl bg-brand font-heading text-lg font-extrabold text-white">
                    {p.step}
                  </span>
                  <span className="rounded-full bg-white/10 px-2.5 py-1 text-[0.7rem] font-bold uppercase tracking-[0.1em] text-white/70">
                    {p.duration}
                  </span>
                </div>
                <h3 className="mt-5 font-heading text-[1.15rem] font-bold text-white">{p.title}</h3>
                <p className="mt-2.5 text-[0.9rem] leading-[1.7] text-white/65">{p.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </Section>
  );
}
