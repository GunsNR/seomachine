'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Counts up to `value` once the tile scrolls into view. Users who prefer
 * reduced motion get the final number immediately.
 */
export function StatCounter({
  value, suffix = '', duration = 1400,
}: { value: number; suffix?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (done) return;
    const node = ref.current;
    if (!node) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { setDisplay(value); setDone(true); return; }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        setDone(true);

        const start = performance.now();
        let frame = 0;
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / duration);
          // easeOutExpo — fast start, settles precisely on the value.
          const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
          setDisplay(Math.round(eased * value));
          if (t < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
      },
      { threshold: 0.35 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [value, duration, done]);

  return (
    <span ref={ref}>
      {display.toLocaleString()}
      {suffix}
    </span>
  );
}
