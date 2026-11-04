/**
 * Money is integer minor units plus an explicit ISO-4217 currency.
 * Amounts in different currencies are never summed without a documented
 * conversion — sumByCurrency keeps them apart.
 */

const MINOR_DIGITS: Record<string, number> = { JPY: 0, KRW: 0, BHD: 3, KWD: 3 };

export function minorDigits(currency: string): number {
  return MINOR_DIGITS[currency.toUpperCase()] ?? 2;
}

/** Parse a human-typed amount ("1,250.50", "$900") into minor units. Rejects ambiguity. */
export function parseMoney(input: string, currency: string): number {
  const cleaned = String(input).trim().replace(/[$€£,\s]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) throw new Error(`Not an amount: "${input}"`);
  const digits = minorDigits(currency);
  const [whole, frac = ""] = cleaned.replace("-", "").split(".");
  if (frac.length > digits) throw new Error(`Too many decimal places for ${currency}`);
  const minor = Number(whole) * 10 ** digits + Number((frac + "000").slice(0, digits) || "0");
  if (!Number.isSafeInteger(minor)) throw new Error("Amount out of range");
  return cleaned.startsWith("-") ? -minor : minor;
}

export function formatMoney(minor: number | null | undefined, currency: string, opts: { compact?: boolean } = {}): string {
  if (minor === null || minor === undefined) return "—";
  const digits = minorDigits(currency);
  const value = minor / 10 ** digits;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: opts.compact ? 0 : digits,
    maximumFractionDigits: opts.compact ? 0 : digits,
    notation: opts.compact && Math.abs(value) >= 100000 ? "compact" : "standard",
  }).format(value);
}

export type MoneyRow = { amountMinor: number; currency: string };

export function sumByCurrency(rows: MoneyRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) out[r.currency] = (out[r.currency] ?? 0) + r.amountMinor;
  return out;
}

/**
 * Revenue-to-cost ratio = attributed revenue / specified marketing cost.
 * Returns null (unavailable) on a zero or missing denominator or mixed
 * currencies — never Infinity, never a guess.
 */
export function revenueToCostRatio(revenue: MoneyRow | null, cost: MoneyRow | null): number | null {
  if (!revenue || !cost) return null;
  if (revenue.currency !== cost.currency) return null;
  if (cost.amountMinor <= 0) return null;
  return revenue.amountMinor / cost.amountMinor;
}
