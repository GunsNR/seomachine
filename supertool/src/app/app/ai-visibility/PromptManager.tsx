'use client';

import { useState } from 'react';
import { Loader2, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { Field, FormError, FormSuccess, inputClass } from '@/components/app/Field';
import { useAction } from '@/components/app/use-action';
import { cn } from '@/lib/utils';

type Mode = 'write' | 'generate';

/** Add prompts by hand, or generate a funnel-balanced set. */
export function PromptManager({
  projectId, category, remaining,
}: { projectId: string; category: string; remaining: number }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('generate');
  const [prompts, setPrompts] = useState('');
  const [genCategory, setGenCategory] = useState(category);
  const [limit, setLimit] = useState(24);
  const { run, pending, error, success, setSuccess } = useAction();

  function report(d: Record<string, unknown>) {
    const added = Number(d.added ?? 0);
    const skipped = Number(d.skipped ?? 0);
    setSuccess(
      added === 0
        ? `Nothing new — all ${skipped} were already tracked.`
        : `Added ${added} prompt${added === 1 ? '' : 's'}${skipped ? `, skipped ${skipped} duplicates` : ''}.`,
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body =
      mode === 'generate'
        ? { projectId, generate: { category: genCategory, limit } }
        : { projectId, prompts };

    const data = await run('/api/app/prompts', { body }, { onSuccess: report });
    if (data && Number(data.added ?? 0) > 0 && mode === 'write') setPrompts('');
  }

  return (
    <section className="rounded-xl bg-white ring-1 ring-line shadow-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h2 className="font-heading text-[1rem] font-bold text-ink">Add prompts</h2>
          <p className="mt-0.5 text-[0.8rem] text-body">
            The questions your visibility is measured against.
            {Number.isFinite(remaining) && ` ${remaining.toLocaleString()} left on your plan.`}
          </p>
        </div>
        <button type="button" onClick={() => setOpen((v) => !v)} className="btn btn-sm btn-ghost" aria-expanded={open}>
          {open ? <X className="h-4 w-4" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
          {open ? 'Close' : 'Add prompts'}
        </button>
      </header>

      {open && (
        <div className="p-5">
          <div className="flex gap-2" role="tablist" aria-label="How to add prompts">
            {(['generate', 'write'] as Mode[]).map((m) => (
              <button
                key={m} type="button" role="tab" aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={cn(
                  'rounded-lg px-3.5 py-2 text-[0.85rem] font-semibold transition-colors',
                  mode === m ? 'bg-brand text-white' : 'bg-surface-alt text-body hover:text-ink',
                )}
              >
                {m === 'generate' ? 'Generate a set' : 'Write my own'}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="mt-5 space-y-4">
            {mode === 'generate' ? (
              <>
                <Field
                  label="What do you sell?" required
                  hint="Prompts are built across discovery, comparison, alternatives, how-to, pricing and brand questions."
                >
                  <input
                    value={genCategory} onChange={(e) => setGenCategory(e.target.value)}
                    required maxLength={160} className={inputClass}
                    placeholder="AI SEO platform"
                  />
                </Field>
                <Field label="How many prompts?" hint="Balanced across clusters, so a smaller set still covers the whole funnel.">
                  <input
                    type="number" min={1} max={200} value={limit}
                    onChange={(e) => setLimit(Number(e.target.value))}
                    className={cn(inputClass, 'max-w-32')}
                  />
                </Field>
              </>
            ) : (
              <Field label="Prompts" required hint="One question per line, exactly as a buyer would ask it.">
                <textarea
                  value={prompts} onChange={(e) => setPrompts(e.target.value)}
                  required rows={6} maxLength={20_000}
                  className={cn(inputClass, 'h-auto py-3 leading-relaxed')}
                  placeholder={'What is the best AI SEO platform?\nHow does your brand compare to Semrush?'}
                />
              </Field>
            )}

            <FormError message={error} />
            <FormSuccess message={success} />

            <button
              type="submit"
              disabled={pending || (mode === 'write' ? !prompts.trim() : !genCategory.trim())}
              className="btn btn-md btn-primary"
            >
              {pending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Adding…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                  {mode === 'generate' ? 'Generate and add' : 'Add prompts'}
                </>
              )}
            </button>
          </form>
        </div>
      )}
    </section>
  );
}

export function DeletePrompt({ id, text }: { id: string; text: string }) {
  const { run, pending } = useAction();
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <span className="flex items-center justify-end gap-1.5">
        <button
          type="button" disabled={pending}
          onClick={() => run(`/api/app/prompts?id=${encodeURIComponent(id)}`, { method: 'DELETE' })}
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
      type="button" onClick={() => setConfirming(true)}
      aria-label={`Stop tracking: ${text}`}
      className="rounded p-1.5 text-body/50 transition-colors hover:bg-bad/10 hover:text-bad"
    >
      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  );
}
