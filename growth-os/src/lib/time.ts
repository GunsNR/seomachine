/**
 * Scheduling rules (documented in replica/spec.md REQ-SCH-01):
 *  - Storage is always a UTC instant plus the IANA zone a human chose.
 *  - A wall-clock time that does not exist (spring-forward gap) moves forward
 *    by the size of the gap: 02:30 on the US spring-forward day → 03:30.
 *  - An ambiguous wall-clock time (fall-back overlap) resolves to the FIRST
 *    occurrence (the earlier instant, still on daylight time).
 *  - "Same local time tomorrow" is computed in local time, so a daily 9am post
 *    stays at 9am local across a DST change (the UTC hour shifts).
 */

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function partsInZone(instant: Date, tz: string): Parts {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p: Record<string, number> = {};
  for (const x of f.formatToParts(instant)) if (x.type !== "literal") p[x.type] = Number(x.value);
  return { year: p.year!, month: p.month!, day: p.day!, hour: p.hour! % 24, minute: p.minute!, second: p.second! };
}

/** Offset of `tz` from UTC at `instant`, in minutes (New York in winter → -300). */
export function offsetMinutes(instant: Date, tz: string): number {
  const p = partsInZone(instant, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60000);
}

export type LocalDateTime = { year: number; month: number; day: number; hour: number; minute: number };

/** Convert a local wall-clock time in `tz` to a UTC instant, applying the gap/overlap rules above. */
export function zonedToUtc(local: LocalDateTime, tz: string): Date {
  if (!isValidTimeZone(tz)) throw new Error(`Unknown time zone: ${tz}`);
  const naive = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
  // Candidate offsets: the offset 1 day before and after cover both sides of any transition.
  const before = offsetMinutes(new Date(naive - 86400000), tz);
  const after = offsetMinutes(new Date(naive + 86400000), tz);
  const candidates = [...new Set([before, after])]
    .map((off) => new Date(naive - off * 60000))
    .filter((d) => {
      const p = partsInZone(d, tz);
      return p.year === local.year && p.month === local.month && p.day === local.day && p.hour === local.hour && p.minute === local.minute;
    })
    .sort((a, b) => a.getTime() - b.getTime());
  if (candidates.length > 0) return candidates[0]!; // overlap → first occurrence
  // Gap: the wall time does not exist. Shift forward by the gap size.
  // Interpreting it with the pre-transition offset lands exactly `gap` later
  // on the post-transition clock: 02:30 EST-intent → 03:30 EDT.
  return new Date(naive - before * 60000);
}

/** Format an instant in a zone for display, e.g. "Tue, Nov 3, 9:00 AM EST". */
export function formatInZone(instant: Date | string | null | undefined, tz: string, opts: Intl.DateTimeFormatOptions = {}): string {
  if (!instant) return "—";
  const d = typeof instant === "string" ? new Date(instant) : instant;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short", ...opts,
  }).format(d);
}

export function formatDate(instant: Date | string | null | undefined, tz: string): string {
  return formatInZone(instant, tz, { weekday: undefined, hour: undefined, minute: undefined, timeZoneName: undefined, year: "numeric" });
}

/** The same local wall time `days` later in `tz`. */
export function addLocalDays(instant: Date, days: number, tz: string): Date {
  const p = partsInZone(instant, tz);
  const next = new Date(Date.UTC(p.year, p.month - 1, p.day + days));
  return zonedToUtc({ year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate(), hour: p.hour, minute: p.minute }, tz);
}

/** Parse "YYYY-MM-DDTHH:mm" (an <input type="datetime-local"> value) in `tz`. */
export function parseLocalInput(value: string, tz: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!m) throw new Error("Use the date and time picker (YYYY-MM-DD HH:mm)");
  return zonedToUtc({ year: +m[1]!, month: +m[2]!, day: +m[3]!, hour: +m[4]!, minute: +m[5]! }, tz);
}

/** Inverse of parseLocalInput, for prefilling inputs. */
export function toLocalInput(instant: Date, tz: string): string {
  const p = partsInZone(instant, tz);
  const z = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${z(p.month)}-${z(p.day)}T${z(p.hour)}:${z(p.minute)}`;
}

export function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / 86400000);
}

export function relativeDays(instant: Date | null | undefined, now = new Date()): string {
  if (!instant) return "no date";
  const d = Math.round((instant.getTime() - now.getTime()) / 86400000);
  if (d === 0) return "today";
  if (d === -1) return "1 day overdue";
  if (d < 0) return `${-d} days overdue`;
  if (d === 1) return "tomorrow";
  return `in ${d} days`;
}
