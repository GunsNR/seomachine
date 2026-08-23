import { Download } from 'lucide-react';

const RESOURCES = [
  { id: 'keywords', label: 'Keywords' },
  { id: 'prompts', label: 'Prompts' },
  { id: 'citations', label: 'Citation history' },
  { id: 'leads', label: 'Leads' },
  { id: 'articles', label: 'Content' },
  { id: 'audit', label: 'Latest audit' },
  { id: 'backlinks', label: 'Backlinks' },
] as const;

/** Every resource, in both formats. Plain links so the browser saves the file. */
export function AccountExport() {
  return (
    <ul className="divide-y divide-line">
      {RESOURCES.map((r) => (
        <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3">
          <span className="text-[0.875rem] font-semibold text-ink">{r.label}</span>
          <span className="flex shrink-0 items-center gap-1.5">
            {(['csv', 'json'] as const).map((format) => (
              <a
                key={format}
                href={`/api/app/export?resource=${r.id}&format=${format}`}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[0.78rem] font-bold uppercase tracking-wide text-body ring-1 ring-line transition-colors hover:bg-brand hover:text-white hover:ring-brand"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                {format}
              </a>
            ))}
          </span>
        </li>
      ))}
    </ul>
  );
}
