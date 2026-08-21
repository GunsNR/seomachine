import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export function CtaBand({
  title = 'Find out what the assistants say about you',
  sub = 'Run one full check across all six answer engines, free. It takes about a minute and needs nothing but your domain.',
  primary = { label: 'Start free trial', href: '/signup' },
  secondary = { label: 'Book a demo', href: '/contact' },
}: {
  title?: string;
  sub?: string;
  primary?: { label: string; href: string };
  secondary?: { label: string; href: string };
}) {
  return (
    <section className="relative overflow-hidden bg-brand">
      <div
        className="pointer-events-none absolute inset-0 bg-grid-faint [background-size:56px_56px] opacity-60"
        aria-hidden="true"
      />
      <div className="container-x relative flex flex-col items-center gap-8 py-16 text-center lg:py-20">
        <h2 className="max-w-3xl text-display-lg text-white text-balance">{title}</h2>
        <p className="max-w-2xl text-[1.0625rem] leading-[1.7] text-white/85 text-pretty">{sub}</p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href={primary.href} className="btn btn-lg btn-accent">
            {primary.label}
            <ArrowRight className="h-4.5 w-4.5" aria-hidden="true" />
          </Link>
          <Link href={secondary.href} className="btn btn-lg bg-white text-brand hover:bg-white/90">
            {secondary.label}
          </Link>
        </div>
      </div>
    </section>
  );
}
