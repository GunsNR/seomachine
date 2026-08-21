import Link from 'next/link';
import {
  ArrowRight, Check, PenTool, Plug, Quote, Search, ShieldCheck, Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { SERVICES } from '@/content/site';
import { Section, SectionHeading } from './Section';

const ICONS: Record<string, LucideIcon> = {
  Sparkles, Quote, PenTool, Search, ShieldCheck, Plug,
};

export function ServiceGrid() {
  return (
    <Section id="platform">
      <SectionHeading
        eyebrow="One platform"
        title="Everything you need to win both channels"
        sub="Most teams bolt an AI-tracking tool onto a rank tracker onto a writing tool, then reconcile three dashboards by hand. SuperTool measures, writes, publishes and attributes in one place."
      />

      <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {SERVICES.map((s) => {
          const Icon = ICONS[s.icon] ?? Sparkles;
          return (
            <article key={s.title} className="card card-hover group flex flex-col p-7">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-brand-light text-brand transition-colors group-hover:bg-brand group-hover:text-white">
                <Icon className="h-6 w-6" aria-hidden="true" />
              </span>

              <h3 className="mt-5 font-heading text-[1.2rem] font-bold text-ink">{s.title}</h3>
              <p className="mt-3 flex-1 text-[0.9375rem] leading-[1.7] text-body">{s.blurb}</p>

              <ul className="mt-5 space-y-2">
                {s.bullets.map((b) => (
                  <li key={b} className="flex items-start gap-2.5 text-[0.875rem] text-body">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden="true" />
                    {b}
                  </li>
                ))}
              </ul>

              <Link
                href={s.href}
                className="mt-6 inline-flex items-center gap-1.5 text-[0.9rem] font-bold text-brand transition-colors hover:text-brand-dark"
              >
                Explore {s.title}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
              </Link>
            </article>
          );
        })}
      </div>
    </Section>
  );
}
