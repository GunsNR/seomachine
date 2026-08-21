'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

export function ResetForm({ token, invalidReason }: { token: string; invalidReason?: string }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [state, setState] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');

  const mismatch = confirm.length > 0 && password !== confirm;

  if (invalidReason) {
    return (
      <div>
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-bad/10 text-bad">
          <AlertCircle className="h-6 w-6" aria-hidden="true" />
        </span>
        <h1 className="mt-5 text-display-md">Link no longer valid</h1>
        <p className="mt-3 text-[0.95rem] leading-relaxed text-body">{invalidReason}</p>
        <Link href="/forgot-password" className="btn btn-md btn-accent mt-7 w-full">
          Request a new link
        </Link>
      </div>
    );
  }

  if (state === 'done') {
    return (
      <div>
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-ok/10 text-ok">
          <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
        </span>
        <h1 className="mt-5 text-display-md">Password updated</h1>
        <p className="mt-3 text-[0.95rem] leading-relaxed text-body">
          Sign in with your new password. Any existing session was signed out.
        </p>
        <button type="button" onClick={() => router.push('/login')} className="btn btn-md btn-accent mt-7 w-full">
          Go to sign in
        </button>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-display-md">Choose a new password</h1>
      <p className="mt-3 text-[0.9375rem] text-body">At least 10 characters.</p>

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (password !== confirm) { setError('The two passwords do not match.'); return; }
          setState('saving');
          setError('');
          try {
            const res = await fetch('/api/auth/reset-password', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token, password }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error ?? 'Could not reset your password.');
            setState('done');
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not reset your password.');
            setState('error');
          }
        }}
        className="mt-8 space-y-4"
      >
        <Field
          id="password" label="New password" value={password} onChange={setPassword}
          autoComplete="new-password" minLength={10}
        />
        <Field
          id="confirm" label="Confirm password" value={confirm} onChange={setConfirm}
          autoComplete="new-password" invalid={mismatch}
        />

        {mismatch && (
          <p role="alert" className="text-[0.8rem] font-semibold text-bad">
            The two passwords do not match.
          </p>
        )}

        {error && (
          <p role="alert" className="flex items-start gap-2.5 rounded-xl bg-bad/10 p-3.5 text-[0.875rem] text-ink ring-1 ring-bad/25">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-bad" aria-hidden="true" />
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={state === 'saving' || password.length < 10 || mismatch}
          className="btn btn-lg btn-accent w-full"
        >
          {state === 'saving' ? (
            <>
              <Loader2 className="h-4.5 w-4.5 animate-spin" aria-hidden="true" />
              Saving…
            </>
          ) : (
            'Set new password'
          )}
        </button>
      </form>
    </div>
  );
}

function Field({
  id, label, value, onChange, autoComplete, minLength, invalid,
}: {
  id: string; label: string; value: string; onChange: (v: string) => void;
  autoComplete?: string; minLength?: number; invalid?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-[0.85rem] font-semibold text-ink">{label}</label>
      <input
        id={id} type="password" required maxLength={200} minLength={minLength}
        autoComplete={autoComplete} aria-invalid={invalid}
        value={value} onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 h-12 w-full rounded-xl border-0 bg-surface-alt px-4 text-[0.95rem] text-ink ring-1 ring-inset ring-line focus:ring-2 focus:ring-brand"
      />
    </div>
  );
}
