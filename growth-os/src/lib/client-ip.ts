/**
 * Client IP for rate limiting. X-Forwarded-For is only trusted when the
 * deployment says how many proxies sit in front (TRUST_PROXY_HOPS). The
 * client is then the entry that many hops from the right; anything to its
 * left was supplied by the client and can be forged. Without the setting,
 * every request shares one bucket ("untrusted") and the per-site cap does the work.
 */
export function clientIp(headers: Headers): string {
  const hops = Number(process.env.TRUST_PROXY_HOPS ?? "0");
  if (!Number.isInteger(hops) || hops < 1) return "untrusted";
  const chain = (headers.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return chain[chain.length - hops] ?? "untrusted";
}
