import { cn } from '@/lib/utils';

export const inputClass =
  'h-11 w-full rounded-lg border-0 bg-surface-alt px-3.5 text-[0.9rem] text-ink ring-1 ring-inset ring-line ' +
  'placeholder:text-body/45 focus:ring-2 focus:ring-brand disabled:opacity-60';

export function Field({
  label, hint, required, children, className,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-[0.82rem] font-semibold text-ink">
        {label}
        {required && <span className="ml-1 text-bad" aria-hidden="true">*</span>}
      </label>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1.5 text-[0.75rem] leading-snug text-body">{hint}</p>}
    </div>
  );
}

export function FormError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg bg-bad/10 p-3 text-[0.85rem] text-ink ring-1 ring-bad/25">
      {message}
    </p>
  );
}

export function FormSuccess({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p role="status" className={cn('rounded-lg bg-ok/10 p-3 text-[0.85rem] text-ink ring-1 ring-ok/25')}>
      {message}
    </p>
  );
}
