'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

interface RunOptions {
  /** Refresh server components after a successful call. Defaults to true. */
  refresh?: boolean;
  onSuccess?: (data: Record<string, unknown>) => void;
}

/**
 * Shared client helper for calling a dashboard API route.
 *
 * Centralises the loading/error/refresh dance every form on the dashboard
 * needs, so individual components stay about their own markup.
 */
export function useAction() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const run = useCallback(
    async (
      url: string,
      init: { method?: string; body?: unknown } = {},
      options: RunOptions = {},
    ): Promise<Record<string, unknown> | null> => {
      setPending(true);
      setError('');
      setSuccess('');

      try {
        const res = await fetch(url, {
          method: init.method ?? 'POST',
          headers: init.body ? { 'Content-Type': 'application/json' } : undefined,
          body: init.body ? JSON.stringify(init.body) : undefined,
        });

        const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;

        if (!res.ok) {
          throw new Error(
            typeof data.error === 'string' ? data.error : 'Something went wrong. Please try again.',
          );
        }

        options.onSuccess?.(data);
        if (options.refresh !== false) router.refresh();
        return data;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong.');
        return null;
      } finally {
        setPending(false);
      }
    },
    [router],
  );

  return { run, pending, error, success, setError, setSuccess };
}
