'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';

/**
 * Root error boundary. Next.js strips the message in production and gives us
 * a digest instead, so the digest is what we show — it is the only thing that
 * correlates a user's report with a server log line.
 */
export default function GlobalError({
  error, reset,
}: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Unhandled application error:', error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-alt px-5 py-16">
      <div className="w-full max-w-lg rounded-2xl bg-white p-9 text-center shadow-card ring-1 ring-line">
        <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-bad/10 text-bad">
          <AlertTriangle className="h-7 w-7" aria-hidden="true" />
        </span>
        <h1 className="mt-5 font-heading text-[1.5rem] font-extrabold text-ink">
          Something went wrong
        </h1>
        <p className="mt-3 text-[0.95rem] leading-relaxed text-body">
          This one is on us. Retrying often clears it — if it does not, send us the reference
          below and we will find it in the logs.
        </p>

        {error.digest && (
          <p className="mt-4 rounded-lg bg-surface-alt px-3 py-2 font-mono text-[0.8rem] text-body">
            Reference: {error.digest}
          </p>
        )}

        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button type="button" onClick={reset} className="btn btn-md btn-accent">
            <RotateCw className="h-4 w-4" aria-hidden="true" />
            Try again
          </button>
          <Link href="/" className="btn btn-md btn-ghost">Go home</Link>
        </div>
      </div>
    </div>
  );
}
