import { cn } from '@/lib/utils';

export interface Point { date: string; value: number }

/**
 * Server-rendered SVG line chart. No client JS, no hydration cost, and it
 * still prints and scales correctly — enough for every trend on the dashboard.
 */
export function LineChart({
  points,
  height = 180,
  color = '#1466D8',
  /** Rankings count down: 1 is best, so the axis is inverted. */
  invert = false,
  suffix = '',
  className,
  label,
}: {
  points: Point[];
  height?: number;
  color?: string;
  invert?: boolean;
  suffix?: string;
  className?: string;
  label: string;
}) {
  if (points.length < 2) {
    return (
      <div className={cn('flex items-center justify-center text-[0.85rem] text-body', className)} style={{ height }}>
        Not enough data yet — check back after the next run.
      </div>
    );
  }

  const W = 600;
  const H = height;
  const PAD = { top: 14, right: 8, bottom: 22, left: 34 };

  const values = points.map((p) => p.value);
  let min = Math.min(...values);
  let max = Math.max(...values);

  // Guarantee a domain wide enough that the three gridline labels round to
  // distinct integers; otherwise a flat series renders as "47, 47, 46".
  const MIN_SPAN = 4;
  if (max - min < MIN_SPAN) {
    const mid = (min + max) / 2;
    min = mid - MIN_SPAN / 2;
    max = mid + MIN_SPAN / 2;
  } else {
    // Pad the range so the line never sits flat on an edge.
    const span = max - min;
    min -= span * 0.12;
    max += span * 0.12;
  }
  min = Math.max(invert ? 1 : 0, min);

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const x = (i: number) => PAD.left + (i / (points.length - 1)) * innerW;
  const y = (v: number) => {
    const t = (v - min) / (max - min);
    return PAD.top + (invert ? t : 1 - t) * innerH;
  };

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.length - 1).toFixed(1)},${(PAD.top + innerH).toFixed(1)} L${x(0).toFixed(1)},${(PAD.top + innerH).toFixed(1)} Z`;

  const gridValues = [min, min + (max - min) / 2, max];
  const gradientId = `g-${color.replace('#', '')}-${invert ? 'i' : 'n'}`;

  const last = points[points.length - 1];

  return (
    <figure className={className}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height }}
        role="img"
        aria-label={`${label}. ${points.length} points from ${points[0].date} to ${last.date}, latest value ${last.value}${suffix}.`}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {gridValues.map((v, i) => (
          <g key={i}>
            <line
              x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)}
              stroke="#E3E8EF" strokeWidth="1" vectorEffect="non-scaling-stroke"
            />
            <text x={PAD.left - 6} y={y(v) + 3.5} textAnchor="end" fontSize="9" fill="#9AA5B4">
              {Math.round(v)}
            </text>
          </g>
        ))}

        <path d={area} fill={`url(#${gradientId})`} />
        <path
          d={line} fill="none" stroke={color} strokeWidth="2.25"
          strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"
        />
        <circle cx={x(points.length - 1)} cy={y(last.value)} r="3.5" fill={color} stroke="#fff" strokeWidth="1.75" />

        <text x={PAD.left} y={H - 6} fontSize="9" fill="#9AA5B4">{points[0].date}</text>
        <text x={W - PAD.right} y={H - 6} fontSize="9" fill="#9AA5B4" textAnchor="end">{last.date}</text>
      </svg>
    </figure>
  );
}

/** Compact inline trend used inside table rows. */
export function Sparkline({
  points, color = '#1466D8', invert = false, width = 90, height = 26,
}: { points: Point[]; color?: string; invert?: boolean; width?: number; height?: number }) {
  if (points.length < 2) return <span className="text-[0.75rem] text-body/50">—</span>;

  const values = points.map((p) => p.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) { min -= 1; max += 1; }

  const x = (i: number) => (i / (points.length - 1)) * (width - 2) + 1;
  const y = (v: number) => {
    const t = (v - min) / (max - min);
    return (invert ? t : 1 - t) * (height - 4) + 2;
  };

  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="overflow-visible">
      <path d={d} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** Horizontal bar list, used for engine and competitor breakdowns. */
export function BarList({
  rows, suffix = '', max,
}: {
  rows: Array<{ label: string; value: number; color?: string; sub?: string }>;
  suffix?: string;
  max?: number;
}) {
  const ceiling = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-3.5">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex items-center justify-between gap-3 text-[0.82rem]">
            <span className="flex min-w-0 items-center gap-2 font-semibold text-ink">
              {r.color && (
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.color }} aria-hidden="true" />
              )}
              <span className="truncate">{r.label}</span>
            </span>
            <span className="shrink-0 tabular-nums font-bold text-ink">
              {r.value}{suffix}
            </span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-alt">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max(2, (r.value / ceiling) * 100)}%`,
                backgroundColor: r.color ?? '#1466D8',
              }}
            />
          </div>
          {r.sub && <p className="mt-1 text-[0.72rem] text-body">{r.sub}</p>}
        </li>
      ))}
    </ul>
  );
}
