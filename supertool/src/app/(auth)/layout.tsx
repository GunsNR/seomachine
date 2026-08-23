import Link from 'next/link';
import { LogoMark } from '@/components/site/Logo';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <main id="main" className="flex items-center justify-center px-5 py-12 sm:px-8">
        <div className="w-full max-w-md">
          <Link href="/" className="mb-9 flex items-center gap-2.5" aria-label="Rank Logic SuperTool home">
            <LogoMark />
            <span className="flex flex-col leading-none">
              <span className="font-heading text-[1.0625rem] font-extrabold tracking-tight text-ink">Rank Logic</span>
              <span className="text-[0.68rem] font-bold uppercase tracking-[0.22em] text-brand">SuperTool</span>
            </span>
          </Link>
          {children}
        </div>
      </main>

      <aside className="relative hidden overflow-hidden bg-navy lg:flex lg:items-center lg:justify-center">
        <div className="pointer-events-none absolute inset-0 bg-grid-faint [background-size:56px_56px]" aria-hidden="true" />
        <div
          className="pointer-events-none absolute -right-24 top-16 h-[26rem] w-[26rem] rounded-full opacity-35 blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(20,102,216,.65), transparent 65%)' }}
          aria-hidden="true"
        />
        <blockquote className="relative max-w-md px-12">
          <p className="font-heading text-[1.6rem] font-bold leading-snug text-white text-balance">
            “It showed us Perplexity was already citing a competitor on our three
            highest-intent questions. That ended the debate in a week.”
          </p>
          <footer className="mt-7 text-[0.9rem] text-white/60">
            <span className="block font-semibold text-white">Dana Whitfield</span>
            VP Marketing, Northline Systems
          </footer>
        </blockquote>
      </aside>
    </div>
  );
}
