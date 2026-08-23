'use client';

import { useState } from 'react';
import { Loader2, Plus, Trash2, X } from 'lucide-react';
import { Field, FormError, FormSuccess, inputClass } from '@/components/app/Field';
import { useAction } from '@/components/app/use-action';
import { cn } from '@/lib/utils';

/** Add keywords in bulk and remove them individually. */
export function KeywordManager({
  projectId, remaining,
}: { projectId: string; remaining: number }) {
  const [open, setOpen] = useState(false);
  const [phrases, setPhrases] = useState('');
  const { run, pending, error, success, setSuccess } = useAction();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const data = await run(
      '/api/app/keywords',
      { body: { projectId, phrases } },
      {
        onSuccess: (d) => {
          const added = Number(d.added ?? 0);
          const skipped = Number(d.skipped ?? 0);
          setSuccess(
            added === 0
              ? `Nothing new — all ${skipped} were already tracked.`
              : `Added ${added} keyword${added === 1 ? '' : 's'}${skipped ? `, skipped ${skipped} already tracked` : ''}.`,
          );
        },
      },
    );
    if (data && Number(data.added ?? 0) > 0) setPhrases('');
  }

  return (
    <section className="rounded-xl bg-white ring-1 ring-line shadow-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h2 className="font-heading text-[1rem] font-bold text-ink">Add keywords</h2>
          <p className="mt-0.5 text-[0.8rem] text-body">
            One per line, or comma separated. Duplicates are skipped automatically.
            {Number.isFinite(remaining) && ` ${remaining.toLocaleString()} left on your plan.`}
          </p>
        </div>
        <button type="button" onClick={() => setOpen((v) => !v)} className="btn btn-sm btn-ghost" aria-expanded={open}>
          {open ? <X className="h-4 w-4" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
          {open ? 'Close' : 'Add keywords'}
        </button>
      </header>

      {open && (
        <form onSubmit={submit} className="space-y-4 p-5">
          <Field label="Keywords" required>
            <textarea
              value={phrases}
              onChange={(e) => setPhrases(e.target.value)}
              required rows={6} maxLength={20_000}
              className={cn(inputClass, 'h-auto py-3 leading-relaxed')}
              placeholder={'ai search visibility\nchatgpt seo\nhow to get cited by ai'}
            />
          </Field>

          <FormError message={error} />
          <FormSuccess message={success} />

          <button type="submit" disabled={pending || !phrases.trim()} className="btn btn-md btn-primary">
            {pending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Adding…
              </>
            ) : (
              'Add to tracking'
            )}
          </button>
        </form>
      )}
    </section>
  );
}

/** Row-level delete, rendered inside the keyword table. */
export function DeleteKeyword({ id, phrase }: { id: string; phrase: string }) {
  const { run, pending } = useAction();
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <span className="flex items-center justify-end gap-1.5">
        <button
          type="button" disabled={pending}
          onClick={() => run(`/api/app/keywords?id=${encodeURIComponent(id)}`, { method: 'DELETE' })}
          className="rounded px-2 py-1 text-[0.72rem] font-bold uppercase tracking-wide text-bad hover:bg-bad/10"
        >
          {pending ? '…' : 'Confirm'}
        </button>
        <button
          type="button" onClick={() => setConfirming(false)}
          className="rounded px-2 py-1 text-[0.72rem] font-bold uppercase tracking-wide text-body hover:bg-surface-alt"
        >
          Cancel
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      aria-label={`Stop tracking ${phrase}`}
      className="rounded p-1.5 text-body/50 transition-colors hover:bg-bad/10 hover:text-bad"
    >
      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  );
}
