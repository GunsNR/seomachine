/** Lower-cased, trimmed email, or null if it is not plausibly an address. */
export function normalizeEmail(input: string | null | undefined): string | null {
  const e = String(input ?? "").trim().toLowerCase();
  if (!e) return null;
  if (e.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) return null;
  return e;
}

/**
 * Digits-only phone, US numbers given a leading 1. A shared phone number is a
 * household/office hint, never proof of the same person — callers must not
 * merge contacts on it.
 */
export function normalizePhone(input: string | null | undefined): string {
  const d = String(input ?? "").replace(/\D/g, "");
  if (d.length === 10) return `1${d}`;
  if (d.length === 11 && d.startsWith("1")) return d;
  return d.length >= 7 && d.length <= 15 ? d : "";
}

export function displayName(c: { firstName?: string | null; lastName?: string | null; email?: string | null }): string {
  const n = `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim();
  return n || c.email || "Unnamed contact";
}

export function slugify(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_-]+/g, "-").slice(0, 64) || "item";
}
