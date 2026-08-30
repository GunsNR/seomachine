'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Check, Copy, KeyRound, Loader2, RefreshCw, Trash2 } from 'lucide-react';

interface KeyRow {
  id: string; label: string; prefix: string;
  createdAt: string; lastUsedAt: string | null;
  /** Set once the key has been rotated: when it stops working. */
  overlapExpiresAt?: string | null;
}

/** What a completed rotation leaves on screen, until the page is refreshed. */
interface Rotated {
  key: string;
  previousKeyId: string;
  overlapExpiresAt: string;
}

/** Create and revoke the project keys the WordPress plugin authenticates with. */
export function ApiKeyManager({ projectId, keys }: { projectId: string; keys: KeyRow[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [rotated, setRotated] = useState<Rotated | null>(null);
  const [rotating, setRotating] = useState<string | null>(null);

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

  async function rotate(id: string, label: string) {
    // Rotation issues a second working key. Saying so plainly is the point:
    // somebody who thinks this breaks their site immediately will not do it,
    // and an un-rotated leaked key is the outcome that actually costs them.
    const confirmed = window.confirm(
      `Rotate the key "${label}"?\n\n` +
        'A new key is issued and shown once. The current key keeps working for ' +
        '24 hours so you can update your integration, then stops automatically. ' +
        'You can revoke it sooner once the new key is in place.',
    );
    if (!confirmed) return;

    setRotating(id);
    setError('');
    try {
      const res = await fetch('/api/app/api-keys', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Could not rotate that key.');
      setFresh(null);
      setRotated({
        key: json.key,
        previousKeyId: json.previousKeyId,
        overlapExpiresAt: json.overlapExpiresAt,
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not rotate that key.');
    } finally {
      setRotating(null);
    }
  }

  async function revokeOld() {
    if (!rotated) return;
    await revoke(rotated.previousKeyId);
    setRotated((current) => (current ? { ...current, previousKeyId: '' } : current));
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
    const value = fresh ?? rotated?.key;
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
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

      {rotated && (
        <div className="border-b border-line bg-ok/[0.06] px-5 py-4">
          <p className="text-[0.8rem] font-semibold text-ink">
            Copy this now — it is shown once and never stored in full.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-white px-3 py-2 font-mono text-[0.82rem] text-ink ring-1 ring-line">
              {rotated.key}
            </code>
            <button type="button" onClick={copy} className="btn btn-sm btn-ghost shrink-0">
              {copied ? <Check className="h-4 w-4 text-ok" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="mt-3 text-[0.78rem] text-body">
            {rotated.previousKeyId ? (
              <>
                The previous key keeps working until{' '}
                <strong className="font-semibold text-ink">
                  {new Date(rotated.overlapExpiresAt).toLocaleString('en-US', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                    timeZoneName: 'short',
                  })}
                </strong>
                , then stops on its own.
              </>
            ) : (
              'The previous key has been revoked.'
            )}
          </p>
          {rotated.previousKeyId && (
            <button
              type="button"
              onClick={() => void revokeOld()}
              className="btn btn-sm btn-ghost mt-2 hover:!text-bad hover:!ring-bad"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Revoke old key now
            </button>
          )}
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
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => void rotate(k.id, k.label)}
                  disabled={rotating === k.id || Boolean(k.overlapExpiresAt)}
                  className="btn btn-sm btn-ghost"
                >
                  {rotating === k.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  )}
                  Rotate
                </button>
                <button
                  type="button"
                  onClick={() => revoke(k.id)}
                  className="btn btn-sm btn-ghost hover:!text-bad hover:!ring-bad"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  Revoke
                </button>
              </div>
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
