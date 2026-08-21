import Link from 'next/link';
import { Compass } from 'lucide-react';

export const metadata = {
  title: 'Page not found',
  robots: { index: false, follow: false },
};

const SUGGESTIONS = [
  { href: '/platform', label: 'Platform' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/blog', label: 'Resources' },
  { href: '/tools/ai-visibility-check', label: 'Free AI visibility check' },
];

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-alt px-5 py-16">
      <div className="w-full max-w-lg rounded-2xl bg-white p-9 text-center shadow-card ring-1 ring-line">
        <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-brand-light text-brand">
          <Compass className="h-7 w-7" aria-hidden="true" />
        </span>
        <p className="mt-5 font-heading text-[0.8rem] font-bold uppercase tracking-[0.14em] text-brand">
          404
        </p>
        <h1 className="mt-2 font-heading text-[1.6rem] font-extrabold text-ink">
          We could not find that page
        </h1>
        <p className="mt-3 text-[0.95rem] leading-relaxed text-body">
          The link may be out of date, or the page may have moved. Here is where most people
          are heading:
        </p>

        <ul className="mt-6 flex flex-wrap justify-center gap-2.5">
          {SUGGESTIONS.map((s) => (
            <li key={s.href}>
              <Link
                href={s.href}
                className="inline-flex rounded-full bg-surface-alt px-3.5 py-2 text-[0.85rem] font-semibold text-ink ring-1 ring-line transition-colors hover:bg-brand hover:text-white hover:ring-brand"
              >
                {s.label}
              </Link>
            </li>
          ))}
        </ul>

        <Link href="/" className="btn btn-md btn-accent mt-8">Back to home</Link>
      </div>
    </div>
  );
}
