'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Downloads a resource export. A plain anchor is used rather than fetch so the
 * browser handles Content-Disposition natively — no blob juggling, and the
 * file lands in the user's downloads with the server-chosen name.
 */
export function ExportButton({
  resource, className,
}: {
  resource: 'keywords' | 'prompts' | 'citations' | 'leads' | 'articles' | 'audit' | 'backlinks';
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className={cn('relative', className)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="btn btn-sm btn-ghost"
      >
        <Download className="h-4 w-4" aria-hidden="true" />
        Export
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 w-36 overflow-hidden rounded-lg bg-white py-1 shadow-lift ring-1 ring-line"
        >
          {(['csv', 'json'] as const).map((format) => (
            <a
              key={format}
              role="menuitem"
              href={`/api/app/export?resource=${resource}&format=${format}`}
              onClick={() => setOpen(false)}
              className="block px-3.5 py-2 text-[0.85rem] font-semibold text-ink transition-colors hover:bg-surface-alt"
            >
              Download {format.toUpperCase()}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
