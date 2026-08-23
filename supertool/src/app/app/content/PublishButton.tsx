'use client';

import { useState } from 'react';
import { ExternalLink, Loader2, Upload } from 'lucide-react';
import { useAction } from '@/components/app/use-action';

/** Pushes one article to the connected WordPress site. */
export function PublishButton({
  articleId, hasBody, connected, publishedUrl,
}: {
  articleId: string;
  hasBody: boolean;
  connected: boolean;
  publishedUrl: string;
}) {
  const { run, pending, error } = useAction();
  const [choosing, setChoosing] = useState(false);

  if (publishedUrl) {
    return (
      <a
        href={publishedUrl} target="_blank" rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-[0.8rem] font-bold text-brand hover:underline"
      >
        View
        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
      </a>
    );
  }

  if (!connected) {
    return <span className="text-[0.78rem] text-body/60">Connect WordPress</span>;
  }

  if (!hasBody) {
    return <span className="text-[0.78rem] text-body/60">No body yet</span>;
  }

  if (choosing) {
    return (
      <span className="flex items-center justify-end gap-1.5">
        {(['draft', 'publish'] as const).map((status) => (
          <button
            key={status} type="button" disabled={pending}
            onClick={() => run('/api/app/wordpress/publish', { body: { articleId, status } })}
            className="rounded px-2 py-1 text-[0.72rem] font-bold uppercase tracking-wide text-brand hover:bg-brand-light"
          >
            {pending ? '…' : status === 'draft' ? 'As draft' : 'Publish'}
          </button>
        ))}
        <button
          type="button" onClick={() => setChoosing(false)}
          className="rounded px-2 py-1 text-[0.72rem] font-bold uppercase tracking-wide text-body hover:bg-surface-alt"
        >
          Cancel
        </button>
      </span>
    );
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <button type="button" onClick={() => setChoosing(true)} className="btn btn-sm btn-ghost">
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Upload className="h-3.5 w-3.5" aria-hidden="true" />}
        Send to WP
      </button>
      {error && <span role="alert" className="max-w-52 text-right text-[0.7rem] text-bad">{error}</span>}
    </span>
  );
}
