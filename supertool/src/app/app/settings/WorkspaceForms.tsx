'use client';

import { useState } from 'react';
import { Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { Field, FormError, FormSuccess, inputClass } from '@/components/app/Field';
import { useAction } from '@/components/app/use-action';

interface CompetitorRow { id: string; domain: string; label: string }

/** Add and remove the competitors visibility is benchmarked against. */
export function CompetitorManager({
  projectId, competitors,
}: { projectId: string; competitors: CompetitorRow[] }) {
  const [domain, setDomain] = useState('');
  const { run, pending, error, success, setSuccess } = useAction();

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const data = await run(
      '/api/app/competitors',
      { body: { projectId, domain } },
      { onSuccess: () => setSuccess('Competitor added.') },
    );
    if (data) setDomain('');
  }

  return (
    <section className="rounded-xl bg-white ring-1 ring-line shadow-card">
      <header className="border-b border-line px-5 py-4">
        <h2 className="font-heading text-[1rem] font-bold text-ink">Competitors</h2>
        <p className="mt-0.5 text-[0.8rem] text-body">
          Watched for being named alongside you. Up to 10 — beyond that share of voice gets noisy
          rather than informative.
        </p>
      </header>

      {competitors.length > 0 && (
        <ul className="divide-y divide-line">
          {competitors.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <p className="truncate text-[0.9rem] font-semibold text-ink">{c.label}</p>
                <p className="truncate text-[0.78rem] text-body">{c.domain}</p>
              </div>
              <DeleteRow
                url={`/api/app/competitors?id=${encodeURIComponent(c.id)}`}
                label={`Remove ${c.label}`}
              />
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="space-y-3 border-t border-line p-5">
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            value={domain} onChange={(e) => setDomain(e.target.value)}
            required maxLength={255} className={inputClass}
            placeholder="competitor.com" aria-label="Competitor domain"
          />
          <button
            type="submit"
            disabled={pending || !domain.trim() || competitors.length >= 10}
            className="btn btn-md btn-primary shrink-0"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
            Add
          </button>
        </div>
        <FormError message={error} />
        <FormSuccess message={success} />
        {competitors.length >= 10 && (
          <p className="text-[0.78rem] text-body">
            You have reached the 10-competitor limit. Remove one to add another.
          </p>
        )}
      </form>
    </section>
  );
}

/** Edit the project's own identity — what the engines are asked about. */
export function ProjectForm({
  project,
}: { project: { id: string; name: string; domain: string; description: string; country: string } }) {
  const [name, setName] = useState(project.name);
  const [domain, setDomain] = useState(project.domain);
  const [description, setDescription] = useState(project.description);
  const { run, pending, error, success, setSuccess } = useAction();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    await run(
      '/api/app/projects',
      { method: 'PATCH', body: { id: project.id, name, domain, description } },
      { onSuccess: () => setSuccess('Project saved.') },
    );
  }

  return (
    <section className="rounded-xl bg-white ring-1 ring-line shadow-card">
      <header className="border-b border-line px-5 py-4">
        <h2 className="font-heading text-[1rem] font-bold text-ink">Project</h2>
        <p className="mt-0.5 text-[0.8rem] text-body">
          The brand name is what we look for in answers; the domain is what we match citations against.
        </p>
      </header>

      <form onSubmit={save} className="space-y-4 p-5">
        <Field label="Brand name" required hint="Exactly as an assistant would write it.">
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} className={inputClass} />
        </Field>
        <Field label="Domain" required hint="A citation counts when an answer sources this domain.">
          <input value={domain} onChange={(e) => setDomain(e.target.value)} required maxLength={255} className={inputClass} />
        </Field>
        <Field label="Category" hint="Used when generating new prompt sets.">
          <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={400} className={inputClass} placeholder="AI SEO platform" />
        </Field>

        <FormError message={error} />
        <FormSuccess message={success} />

        <button type="submit" disabled={pending} className="btn btn-md btn-primary">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
          Save changes
        </button>
      </form>
    </section>
  );
}

/** Two-step delete used wherever a row is removable. */
export function DeleteRow({ url, label }: { url: string; label: string }) {
  const { run, pending } = useAction();
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <span className="flex shrink-0 items-center gap-1.5">
        <button
          type="button" disabled={pending} onClick={() => run(url, { method: 'DELETE' })}
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
      type="button" onClick={() => setConfirming(true)} aria-label={label}
      className="shrink-0 rounded p-1.5 text-body/50 transition-colors hover:bg-bad/10 hover:text-bad"
    >
      <Trash2 className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
