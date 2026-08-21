import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';
import { EngineRow } from './EngineRow';
import { VisibilityPreview } from './VisibilityPreview';

const PROOF = ['14-day free trial', 'No card required', '5-minute WordPress setup'];

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-navy">
      {/* Depth: a faint grid plus two soft brand-coloured glows. */}
      <div className="pointer-events-none absolute inset-0 bg-grid-faint [background-size:64px_64px]" aria-hidden="true" />
      <div
        className="pointer-events-none absolute -left-40 -top-40 h-[34rem] w-[34rem] rounded-full opacity-40 blur-3xl"
        style={{ background: 'radial-gradient(circle, rgba(20,102,216,.55), transparent 65%)' }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -right-32 top-24 h-[28rem] w-[28rem] rounded-full opacity-30 blur-3xl"
        style={{ background: 'radial-gradient(circle, rgba(255,107,44,.5), transparent 65%)' }}
        aria-hidden="true"
      />

      <div className="container-x relative grid items-center gap-14 py-16 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:py-24">
        <div className="animate-fade-up">
          <p className="eyebrow eyebrow-dark">Generative Engine Optimization</p>

          <h1 className="mt-5 text-display-xl text-white text-balance">
            Get cited by AI.{' '}
            <span className="relative whitespace-nowrap text-accent">
              Get ranked
              <svg
                className="absolute -bottom-1.5 left-0 h-2.5 w-full"
                viewBox="0 0 300 12"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <path
                  d="M2 8c60-5 120-6 180-4s90 3 116 1"
                  stroke="currentColor"
                  strokeWidth="5"
                  strokeLinecap="round"
                  fill="none"
                  opacity=".55"
                />
              </svg>
            </span>{' '}
            by Google.
          </h1>

          <p className="mt-6 max-w-xl text-[1.125rem] leading-[1.7] text-white/75 text-pretty">
            Half your buyers now ask an assistant before they ever open a search results page.
            Rank Logic SuperTool writes content tuned to how those assistants pick sources,
            publishes it to your site in one click, and tracks every citation, ranking and lead it earns.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/signup" className="btn btn-lg btn-accent">
              Start free trial
              <ArrowRight className="h-4.5 w-4.5" aria-hidden="true" />
            </Link>
            <Link href="/tools/ai-visibility-check" className="btn btn-lg btn-onnavy">
              Check my AI visibility
            </Link>
          </div>

          <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2">
            {PROOF.map((p) => (
              <li key={p} className="flex items-center gap-2 text-[0.875rem] text-white/70">
                <Check className="h-4 w-4 text-accent" aria-hidden="true" />
                {p}
              </li>
            ))}
          </ul>

          <div className="mt-10 border-t border-white/10 pt-6">
            <p className="text-[0.72rem] font-bold uppercase tracking-[0.14em] text-white/45">
              Tracking every answer engine that matters
            </p>
            <EngineRow dark className="mt-3.5 !justify-start" />
          </div>
        </div>

        <div className="animate-fade-up [animation-delay:120ms] lg:pl-4">
          <VisibilityPreview />
        </div>
      </div>
    </section>
  );
}
