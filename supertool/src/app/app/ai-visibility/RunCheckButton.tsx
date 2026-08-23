'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';

/** Triggers an immediate run of the whole prompt set across all six engines. */
export function RunCheckButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'running'>('idle');
  const [error, setError] = useState('');

  async function run() {
    setState('running');
    setError('');
    try {
      const res = await fetch('/api/app/run-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'The run could not be completed.');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The run could not be completed.');
    } finally {
      setState('idle');
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button type="button" onClick={run} disabled={state === 'running'} className="btn btn-sm btn-primary">
        {state === 'running' ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Running all engines…
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            Run check now
          </>
        )}
      </button>
      {error && <p role="alert" className="text-[0.75rem] text-bad">{error}</p>}
    </div>
  );
}
