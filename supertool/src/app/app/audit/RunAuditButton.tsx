'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';

/** Kicks off a live crawl of the project domain and stores the result. */
export function RunAuditButton({ projectId, domain }: { projectId: string; domain: string }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  async function run() {
    setRunning(true);
    setError('');
    try {
      const res = await fetch('/api/app/run-audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'The audit could not be completed.');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The audit could not be completed.');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button type="button" onClick={run} disabled={running} className="btn btn-sm btn-primary">
        {running ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Crawling {domain}…
          </>
        ) : (
          <>
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            Run audit
          </>
        )}
      </button>
      {error && <p role="alert" className="max-w-xs text-right text-[0.75rem] text-bad">{error}</p>}
    </div>
  );
}
