'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AlertCircle, Loader2, MailCheck } from 'lucide-react';

export function ForgotForm() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');

  if (state === 'sent') {
    return (
      <div>
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-ok/10 text-ok">
          <MailCheck className="h-6 w-6" aria-hidden="true" />
        </span>
        <h1 className="mt-5 text-display-md">Check your email</h1>
        <p className="mt-3 text-[0.95rem] leading-relaxed text-body">
          If <strong className="font-semibold text-ink">{email}</strong> has an account, a reset
          link is on its way. It works once and expires in an hour.
        </p>
        <p className="mt-4 text-[0.875rem] text-body">
          Nothing arrived? Check spam, then{' '}
          <button
            type="button" onClick={() => setState('idle')}
            className="font-semibold text-brand hover:underline"
          >
            try again
          </button>.
        </p>
        <Link href="/login" className="btn btn-md btn-ghost mt-7 w-full">Back to sign in</Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-display-md">Reset your password</h1>
      <p className="mt-3 text-[0.9375rem] text-body">
        Enter the email on your account and we will send you a link.
      </p>

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setState('sending');
          setError('');
          try {
            const res = await fetch('/api/auth/forgot-password', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error ?? 'Could not send the reset link.');
            setState('sent');
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not send the reset link.');
            setState('error');
          }
        }}
        className="mt-8 space-y-4"
      >
        <div>
          <label htmlFor="email" className="block text-[0.85rem] font-semibold text-ink">
            Work email
          </label>
          <input
            id="email" type="email" required maxLength={255} autoComplete="email"
            value={email} onChange={(e) => setEmail(e.target.value)}
            className="mt-1.5 h-12 w-full rounded-xl border-0 bg-surface-alt px-4 text-[0.95rem] text-ink ring-1 ring-inset ring-line placeholder:text-body/45 focus:ring-2 focus:ring-brand"
          />
        </div>

        {error && (
          <p role="alert" className="flex items-start gap-2.5 rounded-xl bg-bad/10 p-3.5 text-[0.875rem] text-ink ring-1 ring-bad/25">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-bad" aria-hidden="true" />
            {error}
          </p>
        )}

        <button type="submit" disabled={state === 'sending'} className="btn btn-lg btn-accent w-full">
          {state === 'sending' ? (
            <>
              <Loader2 className="h-4.5 w-4.5 animate-spin" aria-hidden="true" />
              Sending…
            </>
          ) : (
            'Send reset link'
          )}
        </button>
      </form>

      <p className="mt-6 text-center text-[0.9rem] text-body">
        Remembered it? <Link href="/login" className="font-semibold text-brand hover:underline">Sign in</Link>
      </p>
    </div>
  );
}
