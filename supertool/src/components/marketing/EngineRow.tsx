import { ENGINES } from '@/lib/ai/engines';
import { cn } from '@/lib/utils';

/** The six tracked engines, shown as the product's "logo wall". */
export function EngineRow({ dark = false, className }: { dark?: boolean; className?: string }) {
  return (
    <ul className={cn('flex flex-wrap items-center justify-center gap-x-3 gap-y-2.5', className)}>
      {ENGINES.map((e) => (
        <li
          key={e.id}
          className={cn(
            'flex items-center gap-2 rounded-full px-3.5 py-2 text-[0.82rem] font-semibold ring-1 transition-colors',
            dark ? 'bg-white/5 text-white/85 ring-white/15' : 'bg-white text-ink ring-line',
          )}
        >
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: e.color }}
            aria-hidden="true"
          />
          {e.name}
        </li>
      ))}
    </ul>
  );
}
