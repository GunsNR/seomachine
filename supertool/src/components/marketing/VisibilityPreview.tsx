import { ENGINES } from '@/lib/ai/engines';

/**
 * A static, honest rendering of what the AI Visibility panel looks like in the
 * product. Numbers are illustrative sample data, labelled as such.
 */
const SAMPLE = [
  { engine: 'chatgpt', score: 74, mentions: 31, of: 42 },
  { engine: 'perplexity', score: 88, mentions: 37, of: 42 },
  { engine: 'claude', score: 61, mentions: 26, of: 42 },
  { engine: 'gemini', score: 69, mentions: 29, of: 42 },
  { engine: 'grok', score: 52, mentions: 22, of: 42 },
  { engine: 'google-ai-mode', score: 79, mentions: 33, of: 42 },
] as const;

export function VisibilityPreview() {
  const blended = Math.round(
    SAMPLE.reduce((sum, row) => {
      const weight = ENGINES.find((e) => e.id === row.engine)?.audienceWeight ?? 0;
      return sum + row.score * weight;
    }, 0),
  );

  return (
    <figure className="overflow-hidden rounded-2xl bg-white shadow-lift ring-1 ring-black/5">
      {/* Window chrome */}
      <div className="flex items-center gap-2 border-b border-line bg-surface-alt px-4 py-3">
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
        </span>
        <span className="ml-2 truncate text-[0.72rem] font-medium text-body/70">
          AI Visibility — last 30 days
        </span>
      </div>

      <div className="p-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[0.7rem] font-bold uppercase tracking-[0.12em] text-body/60">
              Blended visibility score
            </p>
            <p className="mt-1 font-heading text-[2.75rem] font-extrabold leading-none text-ink">
              {blended}
              <span className="text-lg font-bold text-body/50">/100</span>
            </p>
          </div>
          <span className="mb-1 rounded-full bg-ok/10 px-2.5 py-1 text-[0.75rem] font-bold text-ok">
            ▲ 12 pts
          </span>
        </div>

        <ul className="mt-5 space-y-3">
          {SAMPLE.map((row) => {
            const engine = ENGINES.find((e) => e.id === row.engine)!;
            return (
              <li key={row.engine}>
                <div className="flex items-center justify-between text-[0.8rem]">
                  <span className="flex items-center gap-2 font-semibold text-ink">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: engine.color }}
                      aria-hidden="true"
                    />
                    {engine.name}
                  </span>
                  <span className="tabular-nums text-body">
                    {row.mentions}/{row.of} prompts
                  </span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-alt">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${row.score}%`, backgroundColor: engine.color }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Latest citation, as a footer strip. An absolutely-positioned overlay
          here would sit on top of the per-engine rows. */}
      <div className="flex items-start gap-3 border-t border-line bg-surface-alt px-5 py-4">
        <span
          className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ok/10 text-ok"
          aria-hidden="true"
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor">
            <path d="M6.2 11.4 3 8.2l1.1-1.1 2.1 2.1 5.7-5.7L13 4.6z" />
          </svg>
        </span>
        <span className="min-w-0">
          <span className="block text-[0.65rem] font-bold uppercase tracking-[0.12em] text-body/55">
            Newest citation
          </span>
          <span className="block truncate text-[0.82rem] font-semibold text-ink">
            Perplexity cited /ai-search-visibility
          </span>
          <span className="block text-[0.72rem] text-body">Rank 1 of 4 sources · positive</span>
        </span>
      </div>

      <figcaption className="sr-only">
        Sample AI visibility dashboard showing per-engine mention rates across six answer engines.
      </figcaption>
    </figure>
  );
}
