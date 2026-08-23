'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Check, Copy, KeyRound, Loader2, Trash2 } from 'lucide-react';

interface KeyRow {
  id: string; label: string; prefix: string;
  createdAt: string; lastUsedAt: string | null;
}

/** Create and revoke the project keys the WordPress plugin authenticates with. */
export function ApiKeyManager({ projectId, keys }: { projectId: string; keys: KeyRow[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function create(label: string) {
    setCreating(true);
    setError('');
    try {
      const res = await fetch('/api/app/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, label }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Could not create a key.');
      setFresh(json.key);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create a key.');
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    setError('');
    try {
      const res = await fetch(`/api/app/api-keys?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? 'Could not revoke that key.');
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not revoke that key.');
    }
  }

  async function copy() {
    if (!fresh) return;
    try {
      await navigator.clipboard.writeText(fresh);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Copy failed — select the key and copy it manually.');
    }
  }

  return (
    <section className="rounded-xl bg-white ring-1 ring-line shadow-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h2 className="font-heading text-[1rem] font-bold text-ink">Project API keys</h2>
          <p className="mt-0.5 text-[0.8rem] text-body">
            Paste one into the WordPress plugin to connect your site.
          </p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const label = String(new FormData(e.currentTarget).get('label') ?? '').trim();
            void create(label || 'WordPress plugin');
          }}
          className="flex gap-2"
        >
          <input
            name="label" maxLength={80} placeholder="Key label"
            className="h-9 w-40 rounded-lg border-0 bg-surface-alt px-3 text-[0.85rem] text-ink ring-1 ring-inset ring-line placeholder:text-body/45 focus:ring-2 focus:ring-brand"
          />
          <button type="submit" disabled={creating} className="btn btn-sm btn-primary shrink-0">
            {creating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <KeyRound className="h-4 w-4" aria-hidden="true" />}
            Create key
          </button>
        </form>
      </header>

      {fresh && (
        <div className="border-b border-line bg-ok/[0.06] px-5 py-4">
          <p className="text-[0.8rem] font-semibold text-ink">
            Copy this now — it is shown once and never stored in full.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-white px-3 py-2 font-mono text-[0.82rem] text-ink ring-1 ring-line">
              {fresh}
            </code>
            <button type="button" onClick={copy} className="btn btn-sm btn-ghost shrink-0">
              {copied ? <Check className="h-4 w-4 text-ok" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="border-b border-line bg-bad/[0.06] px-5 py-3 text-[0.85rem] text-ink">
          {error}
        </p>
      )}

      {keys.length ? (
        <ul className="divide-y divide-line">
          {keys.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
              <div className="min-w-0">
                <p className="text-[0.88rem] font-semibold text-ink">{k.label}</p>
                <p className="mt-0.5 text-[0.75rem] text-body">
                  <code className="rounded bg-surface-alt px-1.5 py-0.5">{k.prefix}…</code>
                  {' · created '}{new Date(k.createdAt).toLocaleDateString('en-US')}
                  {k.lastUsedAt ? ` · last used ${new Date(k.lastUsedAt).toLocaleDateString('en-US')}` : ' · never used'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => revoke(k.id)}
                className="btn btn-sm btn-ghost shrink-0 hover:!text-bad hover:!ring-bad"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Revoke
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-5 py-8 text-center text-[0.875rem] text-body">
          No keys yet. Create one to connect WordPress.
        </p>
      )}
    </section>
  );
}
