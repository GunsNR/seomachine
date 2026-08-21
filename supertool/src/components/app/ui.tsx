import Link from 'next/link';
import { cn, compact } from '@/lib/utils';

export function PageHeader({
  title, sub, action,
}: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-heading text-[1.75rem] font-extrabold tracking-tight text-ink">{title}</h1>
        {sub && <p className="mt-1.5 max-w-2xl text-[0.9rem] leading-relaxed text-body">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatTile({
  label, value, sub, delta, tone = 'default',
}: {
  label: string;
  value: string | number;
  sub?: string;
  delta?: number;
  tone?: 'default' | 'good' | 'warn' | 'bad';
}) {
  const toneCls = {
    default: 'text-ink', good: 'text-ok', warn: 'text-warn', bad: 'text-bad',
  }[tone];

  return (
    <div className="stat-tile">
      <p className="text-[0.68rem] font-bold uppercase tracking-[0.1em] text-body/60">{label}</p>
      <div className="mt-2 flex items-baseline gap-2.5">
        <p className={cn('font-heading text-[1.85rem] font-extrabold leading-none', toneCls)}>
          {typeof value === 'number' ? compact(value) : value}
        </p>
        {delta !== undefined && delta !== 0 && (
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[0.7rem] font-bold',
              delta > 0 ? 'bg-ok/10 text-ok' : 'bg-bad/10 text-bad',
            )}
          >
            {delta > 0 ? '▲' : '▼'} {Math.abs(delta)}
          </span>
        )}
      </div>
      {sub && <p className="mt-1.5 text-[0.78rem] leading-snug text-body">{sub}</p>}
    </div>
  );
}

export function Panel({
  title, sub, action, children, className,
}: {
  title: string; sub?: string; action?: React.ReactNode;
  children: React.ReactNode; className?: string;
}) {
  return (
    <section className={cn('rounded-xl bg-white ring-1 ring-line shadow-card', className)}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h2 className="font-heading text-[1rem] font-bold text-ink">{title}</h2>
          {sub && <p className="mt-0.5 text-[0.8rem] text-body">{sub}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

export function Bar({ value, color, max = 100 }: { value: number; color?: string; max?: number }) {
  const pct = Math.max(1.5, Math.min(100, (value / max) * 100));
  return (
    <div className="h-2 overflow-hidden rounded-full bg-surface-alt">
      <div
        className={cn('h-full rounded-full', !color && 'bg-brand')}
        style={{ width: `${pct}%`, ...(color ? { backgroundColor: color } : {}) }}
      />
    </div>
  );
}

const BADGE_TONES = {
  neutral: 'bg-surface-alt text-body',
  brand: 'bg-brand-light text-brand-dark',
  good: 'bg-ok/10 text-ok',
  warn: 'bg-warn/12 text-warn',
  bad: 'bg-bad/10 text-bad',
} as const;

export function Badge({
  children, tone = 'neutral',
}: { children: React.ReactNode; tone?: keyof typeof BADGE_TONES }) {
  return (
    <span className={cn('inline-flex rounded px-2 py-1 text-[0.68rem] font-bold uppercase tracking-wide', BADGE_TONES[tone])}>
      {children}
    </span>
  );
}

export function EmptyState({ title, body, cta }: { title: string; body: string; cta?: { label: string; href: string } }) {
  return (
    <div className="px-5 py-12 text-center">
      <p className="font-heading text-[1rem] font-bold text-ink">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-[0.875rem] leading-relaxed text-body">{body}</p>
      {cta && (
        <Link href={cta.href} className="btn btn-sm btn-primary mt-5">
          {cta.label}
        </Link>
      )}
    </div>
  );
}

export function SimulationNotice({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <p className="rounded-xl bg-warn/10 p-4 text-[0.84rem] leading-relaxed text-ink ring-1 ring-warn/25">
      <strong className="font-semibold">Demonstration data.</strong> No answer-engine API keys are
      configured on this deployment, so these checks came from the built-in simulator —
      deterministic and realistic in shape, but not live model output. Add provider keys in{' '}
      <Link href="/app/settings" className="font-semibold text-brand hover:underline">Settings</Link>{' '}
      to run against the real engines.
    </p>
  );
}
