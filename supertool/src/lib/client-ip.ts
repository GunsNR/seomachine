/**
 * Client IP extraction, with an explicit trust boundary.
 *
 * `X-Forwarded-For` is a client-supplied header. Anyone can send one. The old
 * code took the leftmost entry unconditionally, which means the "identity" used
 * for rate limiting was whatever the caller typed — so the limiter could be
 * bypassed by rotating a header value, and a shared limit could be poisoned by
 * forging someone else's address.
 *
 * The fix is to know how many proxies actually sit in front of the app. Each
 * trusted proxy appends exactly one entry to the right-hand side of XFF, so
 * with N trusted proxies the Nth-from-the-right entry is the one the closest
 * trusted proxy observed, and everything to its left is caller-controlled
 * fiction.
 *
 * `TRUSTED_PROXY_COUNT` defaults to 0, which means: trust nothing in the
 * header, use the socket address. That default is deliberately the safe one —
 * a misconfigured deployment under-trusts rather than over-trusts.
 */

/**
 * Just the shape these helpers read.
 *
 * Deliberately not `NodeJS.ProcessEnv`, which requires `NODE_ENV` and so cannot
 * be satisfied by a literal — that would force every test to construct a whole
 * environment to check one variable.
 */
export type EnvLike = Record<string, string | undefined>;

export const TRUSTED_PROXY_ENV = 'TRUSTED_PROXY_COUNT';

export function trustedProxyCount(env: EnvLike = process.env): number {
  const raw = env[TRUSTED_PROXY_ENV];
  if (!raw) return 0;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  // A pathological value would walk off the end of every header; cap it.
  return Math.min(n, 10);
}

/**
 * Pick the client address from a forwarded chain.
 *
 * Exported separately from `clientIp` so the trust arithmetic can be tested
 * without constructing a Request.
 *
 * @param chain    Entries from `X-Forwarded-For`, left to right.
 * @param proxies  How many trusted proxies sit in front of this process.
 * @param socket   The directly-connected peer, if known.
 */
export function pickForwardedIp(
  chain: readonly string[],
  proxies: number,
  socket = '',
): string {
  const entries = chain.map((e) => e.trim()).filter(Boolean);

  // Trust nothing in the header.
  if (proxies <= 0) return socket;

  // Fewer entries than trusted proxies means the header is shorter than the
  // deployment says it should be — the chain is not what we expected, so fall
  // back to the socket rather than reading an attacker-chosen entry.
  if (entries.length < proxies) return socket;

  return entries[entries.length - proxies] ?? socket;
}

/**
 * Best available client address for this request.
 *
 * Returns '' when nothing trustworthy is available. Callers must treat '' as
 * "unknown" rather than as an identity — bucketing every unknown caller
 * together is correct, since that is exactly what they are.
 */
export function clientIp(req: Request, env: EnvLike = process.env): string {
  const proxies = trustedProxyCount(env);

  const socket =
    req.headers.get('x-real-ip')?.trim() ||
    // Set by some platforms ahead of any user-controlled header.
    req.headers.get('cf-connecting-ip')?.trim() ||
    '';

  const forwarded = req.headers.get('x-forwarded-for');
  if (!forwarded) return socket;

  return pickForwardedIp(forwarded.split(','), proxies, socket);
}

/**
 * A rate-limit bucket key.
 *
 * When no address can be trusted, every such caller shares one bucket. That is
 * a deliberate trade: it is better for anonymous traffic to contend with itself
 * than for an unauthenticated caller to mint unlimited identities.
 */
export function clientKey(req: Request, scope: string, env: EnvLike = process.env): string {
  const ip = clientIp(req, env);
  return `${scope}:${ip || 'untrusted'}`;
}
