'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';

const inputCls =
  'h-12 w-full rounded-xl border-0 bg-surface-alt px-4 text-[0.95rem] text-ink ring-1 ring-inset ring-line placeholder:text-body/45 focus:ring-2 focus:ring-brand';

export function AuthForm({
  mode,
  showDemoCredentials = false,
}: {
  mode: 'login' | 'signup';
  /**
   * Whether to print the seeded demo account's credentials on the page.
   *
   * Off unless the server says a demo workspace exists. Publishing a working
   * login on a production sign-in page invites anyone to walk into the
   * workspace, and on a deployment with no demo data the hint is simply false.
   */
  showDemoCredentials?: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const form = new FormData(e.currentTarget);
    const payload =
      mode === 'login'
        ? { email: String(form.get('email') ?? ''), password: String(form.get('password') ?? '') }
        : {
            name: String(form.get('name') ?? ''),
            email: String(form.get('email') ?? ''),
            password: String(form.get('password') ?? ''),
            company: String(form.get('company') ?? ''),
            domain: String(form.get('domain') ?? ''),
          };

    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Something went wrong.');
      router.push('/app');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="text-display-md">
        {mode === 'login' ? 'Welcome back' : 'Start your free trial'}
      </h1>
      <p className="mt-3 text-[0.9375rem] text-body">
        {mode === 'login'
          ? 'Sign in to your workspace.'
          : 'Fourteen days, every feature, no card required.'}
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        {mode === 'signup' && (
          <>
            <Field id="name" label="Your name" autoComplete="name" required />
            <Field id="company" label="Company" autoComplete="organization" />
            <Field id="domain" label="Website" placeholder="yourdomain.com" />
          </>
        )}

        <Field id="email" label="Work email" type="email" autoComplete="email" required />

        <div>
          <div className="flex items-baseline justify-between">
            <label htmlFor="password" className="block text-[0.85rem] font-semibold text-ink">
              Password
            </label>
            {mode === 'signup' ? (
              <span className="text-[0.75rem] text-body">At least 10 characters</span>
            ) : (
              <Link href="/forgot-password" className="text-[0.8rem] font-semibold text-brand hover:underline">
                Forgot?
              </Link>
            )}
          </div>
          <input
            id="password" name="password" type="password" required
            minLength={mode === 'signup' ? 10 : 1} maxLength={200}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            className={`${inputCls} mt-1.5`}
          />
        </div>

        {error && (
          <p role="alert" className="flex items-start gap-2.5 rounded-xl bg-bad/10 p-3.5 text-[0.875rem] text-ink ring-1 ring-bad/25">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-bad" aria-hidden="true" />
            {error}
          </p>
        )}

        <button type="submit" disabled={loading} className="btn btn-lg btn-accent w-full">
          {loading ? (
            <>
              <Loader2 className="h-4.5 w-4.5 animate-spin" aria-hidden="true" />
              {mode === 'login' ? 'Signing in…' : 'Creating your workspace…'}
            </>
          ) : (
            mode === 'login' ? 'Sign in' : 'Create account'
          )}
        </button>
      </form>

      <p className="mt-6 text-center text-[0.9rem] text-body">
        {mode === 'login' ? (
          <>Don&apos;t have an account? <Link href="/signup" className="font-semibold text-brand hover:underline">Start free</Link></>
        ) : (
          <>Already have an account? <Link href="/login" className="font-semibold text-brand hover:underline">Sign in</Link></>
        )}
      </p>

      {mode === 'login' && showDemoCredentials && (
        <div className="mt-8 rounded-xl bg-surface-alt p-4 text-[0.82rem] leading-relaxed text-body">
          <strong className="font-semibold text-ink">Demo workspace:</strong>{' '}
          <code className="rounded bg-white px-1.5 py-0.5 ring-1 ring-line">demo@ranklogicsupertool.com</code>{' '}
          / <code className="rounded bg-white px-1.5 py-0.5 ring-1 ring-line">supertool-demo</code>
        </div>
      )}
    </div>
  );
}

function Field({
  id, label, type = 'text', required, placeholder, autoComplete,
}: {
  id: string; label: string; type?: string; required?: boolean;
  placeholder?: string; autoComplete?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-[0.85rem] font-semibold text-ink">{label}</label>
      <input
        id={id} name={id} type={type} required={required} placeholder={placeholder}
        autoComplete={autoComplete} maxLength={255} className={`${inputCls} mt-1.5`}
      />
    </div>
  );
}
