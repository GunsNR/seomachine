import Link from "next/link";
import { clsx } from "clsx";
import { AlertTriangle, CheckCircle2, CircleDashed, Clock, FlaskConical, Info, Lock, OctagonX, PauseCircle } from "lucide-react";
import type { ReactNode } from "react";
import { formatMoney } from "@/lib/money";
import { formatInZone } from "@/lib/time";

export type Tone = "neutral" | "ok" | "warn" | "bad" | "info" | "action";

const TONE: Record<Tone, string> = {
  neutral: "bg-canvas text-ink-2 border-line",
  ok: "bg-ok-soft text-ok border-ok/25",
  warn: "bg-warn-soft text-warn border-warn/25",
  bad: "bg-bad-soft text-bad border-bad/25",
  info: "bg-info-soft text-info border-info/25",
  action: "bg-action-soft text-action-ink border-action/25",
};
const ICON: Record<Tone, typeof Info> = { neutral: CircleDashed, ok: CheckCircle2, warn: AlertTriangle, bad: OctagonX, info: Info, action: Clock };

/** Text-first status label. Colour is redundant with the icon and the words. */
export function Status({ tone = "neutral", children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  const Icon = ICON[tone];
  return (
    <span title={title} className={clsx("inline-flex max-w-full items-start gap-1 rounded-ctl border px-1.5 py-0.5 text-2xs font-medium", TONE[tone])}>
      <Icon aria-hidden className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
      <span className="min-w-0">{children}</span>
    </span>
  );
}

export function FixtureTag() {
  return (
    <span className="inline-flex items-center gap-1 rounded-ctl border border-info/30 bg-info-soft px-1.5 py-0.5 text-2xs font-medium text-info">
      <FlaskConical aria-hidden className="h-3.5 w-3.5" strokeWidth={1.75} /> Demo data
    </span>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-[-0.01em]">{title}</h1>
        {description ? <p className="mt-1 max-w-[70ch] text-sm text-ink-2">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function Section({ title, count, action, children, className, id }: { title: string; count?: number; action?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section aria-labelledby={id ? `${id}-h` : undefined} className={clsx("panel", className)}>
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h2 id={id ? `${id}-h` : undefined} className="text-sm font-semibold">
          {title}
          {count !== undefined ? <span className="ml-2 font-normal text-ink-2 num">{count}</span> : null}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="px-4 py-8 text-center">
      <p className="text-sm font-medium">{title}</p>
      {children ? <p className="mx-auto mt-1 max-w-[52ch] text-xs text-ink-2">{children}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function Notice({ tone = "info", title, children }: { tone?: Tone; title: string; children?: ReactNode }) {
  const Icon = tone === "warn" ? PauseCircle : tone === "bad" ? OctagonX : tone === "neutral" ? Lock : ICON[tone];
  return (
    <div role={tone === "bad" ? "alert" : "status"} className={clsx("flex gap-2.5 rounded-panel border px-3.5 py-3 text-sm", TONE[tone])}>
      <Icon aria-hidden className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
      <div>
        <p className="font-medium">{title}</p>
        {children ? <div className="mt-0.5 text-xs text-ink">{children}</div> : null}
      </div>
    </div>
  );
}

/** Flash message from a server action redirect (?ok= / ?error=). */
export function Flash({ ok, error }: { ok?: string; error?: string }) {
  if (error) return <div className="mb-4"><Notice tone="bad" title="That didn't work">{error}</Notice></div>;
  if (ok) return <div className="mb-4"><Notice tone="ok" title={ok} /></div>;
  return null;
}

export function Money({ minor, currency, compact }: { minor: number | null | undefined; currency: string; compact?: boolean }) {
  return <span className="num">{formatMoney(minor, currency, { compact })}</span>;
}

export function When({ at, tz, short }: { at: Date | string | null | undefined; tz: string; short?: boolean }) {
  if (!at) return <span className="text-ink-2">—</span>;
  const d = typeof at === "string" ? new Date(at) : at;
  return <time dateTime={d.toISOString()}>{formatInZone(d, tz, short ? { weekday: undefined, timeZoneName: undefined } : {})}</time>;
}

/** Overdue age as a short sienna bar (length ∝ days, capped) plus the words. */
export function OverdueBar({ days }: { days: number }) {
  const w = Math.min(100, Math.max(8, days * 12));
  return (
    <span className="inline-flex items-center gap-2" aria-label={days <= 0 ? "Due today" : `${days} days overdue`}>
      <span aria-hidden className="h-1.5 w-12 overflow-hidden rounded-full bg-line">
        <span className="block h-full rounded-full bg-accent" style={{ width: `${w}%` }} />
      </span>
      <span className="text-2xs font-medium text-action-ink num">{days <= 0 ? "Due today" : `${days}d overdue`}</span>
    </span>
  );
}

export function KeyVal({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[112px_1fr] gap-2 py-1.5 text-sm">
      <dt className="text-ink-2">{k}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

export function Tabs({ items, current }: { items: { href: string; label: string; key: string }[]; current: string }) {
  return (
    <nav aria-label="Views" className="mb-4 flex gap-1 border-b border-line">
      {items.map((i) => (
        <Link key={i.key} href={i.href} aria-current={i.key === current ? "page" : undefined}
          className={clsx("-mb-px border-b-2 px-3 py-2 text-sm", i.key === current ? "border-ink font-medium text-ink" : "border-transparent text-ink-2 hover:text-ink")}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

// Literal class names: Tailwind purges component classes it can't find as whole strings.
const BTN = { primary: "btn-primary", secondary: "btn-secondary", quiet: "btn-quiet", danger: "btn-danger" } as const;

export function SubmitButton({ children, variant = "primary", name, value, className }: { children: ReactNode; variant?: keyof typeof BTN; name?: string; value?: string; className?: string }) {
  return <button type="submit" name={name} value={value} className={clsx(BTN[variant], className)}>{children}</button>;
}
