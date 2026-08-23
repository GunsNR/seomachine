import { STATS } from '@/content/site';
import { StatCounter } from './StatCounter';

export function StatBar() {
  return (
    <section className="border-b border-line bg-surface-alt" aria-label="Key numbers">
      <div className="container-x grid gap-8 py-12 sm:grid-cols-2 lg:grid-cols-4 lg:py-14">
        {STATS.map((s) => (
          <div key={s.label} className="text-center lg:text-left">
            <p className="font-heading text-[2.5rem] font-extrabold leading-none text-brand">
              <StatCounter value={s.value} suffix={s.suffix} />
            </p>
            <p className="mt-2 font-heading text-[1rem] font-bold text-ink">{s.label}</p>
            <p className="mt-1 text-[0.85rem] leading-snug text-body">{s.sub}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
