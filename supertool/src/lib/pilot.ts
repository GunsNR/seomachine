import 'server-only';
import { z } from 'zod';

/**
 * The private-pilot signup gate.
 *
 * The product's signup route is open by design: a self-hosted install has
 * nobody to invite it, and gating it there would be wrong. A hosted private
 * pilot is the opposite situation — the deployment has exactly one intended
 * user and a public URL — so the gate is opt-in, driven entirely by
 * environment, and enforced on the server.
 *
 * Three rules shape everything below.
 *
 * **Explicit, never inferred.** `PILOT_MODE` switches the gate on only when it
 * is literally `true`. A truthy-looking `1`, `yes` or `on` does not count. An
 * operator who mistypes the flag gets the open behaviour they can see rather
 * than a silent half-state, and `PILOT_ALLOWED_EMAILS` on its own never
 * activates anything — a list that looks like protection but is not would be
 * the worst outcome of the three.
 *
 * **Fail closed, not open.** Once the gate is on, a missing or malformed
 * allowlist refuses every signup. The alternative — treating an unreadable
 * allowlist as "no restriction" — turns a typo in an environment variable into
 * an open signup form on a public URL, which is the exact failure this module
 * exists to prevent.
 *
 * **One malformed entry invalidates the list.** A stray character in a
 * comma-separated variable would otherwise silently drop one person's access,
 * and they would find out by being unable to sign up while the deployment
 * looked healthy. Refusing the whole list surfaces the mistake immediately, in
 * the operator's own logs and in the detailed health view.
 *
 * This module is deliberately pure: it reads an environment-shaped object and
 * returns a decision. It performs no I/O, logs nothing, and knows nothing about
 * requests — so the route can be tested through it, and it can be tested
 * without a route.
 */

export const PILOT_MODE_ENV = 'PILOT_MODE';
export const PILOT_ALLOWLIST_ENV = 'PILOT_ALLOWED_EMAILS';

/**
 * Just the shape these helpers read.
 *
 * Matches `lib/client-ip.ts` rather than `NodeJS.ProcessEnv`, which requires
 * `NODE_ENV` and so cannot be satisfied by a literal in a test.
 */
export type EnvLike = Record<string, string | undefined>;

/**
 * The single refusal message.
 *
 * Every rejected signup gets this exact string, whatever the reason: the
 * address is not on the list, the list is unusable, or an account already
 * exists. Three different facts, one indistinguishable response — otherwise
 * the form becomes an oracle that answers "is this address invited?" and "is
 * this address registered?" to anyone who asks.
 *
 * It is also the message a legitimately invited person sees when they mistype
 * their address, so it says what to do next rather than only what went wrong.
 */
export const PILOT_REFUSAL_MESSAGE =
  'This pilot is invitation-only. If you were invited, use the address the invitation was sent to. ' +
  'If you already have an account, sign in instead.';

/**
 * The canonical form of an address, for both allowlist matching and storage.
 *
 * Trim and lowercase, and nothing else. It is tempting to go further — strip
 * Gmail dots, drop `+` tags — but this value is compared against
 * `User.email`, which the signup route writes using exactly this
 * transformation. Any normalisation applied here and not there would let an
 * allowlisted address fail to match its own account, and any applied to both
 * would silently merge addresses their owners consider distinct.
 */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Whether the pilot gate is switched on. Exact match on `true`, by design. */
export function pilotModeEnabled(env: EnvLike = process.env): boolean {
  return (env[PILOT_MODE_ENV] ?? '').trim().toLowerCase() === 'true';
}

const EmailEntry = z.string().email();

export interface ParsedAllowlist {
  /** Normalised, deduplicated addresses, in first-seen order. */
  allowed: string[];
  /** How many comma-separated entries did not parse as email addresses. */
  invalid: number;
}

/**
 * Split `PILOT_ALLOWED_EMAILS` into addresses.
 *
 * Empty entries — a trailing comma, a doubled separator — are whitespace, not
 * mistakes, and are dropped silently. Anything else that is not an address is
 * counted as invalid so the caller can refuse the whole list.
 */
export function parseAllowlist(raw: string | undefined): ParsedAllowlist {
  const allowed: string[] = [];
  const seen = new Set<string>();
  let invalid = 0;

  for (const part of (raw ?? '').split(',')) {
    const candidate = normalizeEmail(part);
    if (!candidate) continue;

    if (!EmailEntry.safeParse(candidate).success) {
      invalid++;
      continue;
    }

    if (seen.has(candidate)) continue;
    seen.add(candidate);
    allowed.push(candidate);
  }

  return { allowed, invalid };
}

export type PilotGate =
  /** The gate is off. Signup behaves as it always has. */
  | { mode: 'open' }
  /** The gate is on and unusable. Every signup is refused. */
  | { mode: 'closed'; reason: 'missing-allowlist' | 'invalid-allowlist'; invalidEntries: number }
  /** The gate is on and working. Only these addresses may sign up. */
  | { mode: 'gated'; allowed: ReadonlySet<string> };

/** Read the environment and decide what signup should do. */
export function pilotGate(env: EnvLike = process.env): PilotGate {
  if (!pilotModeEnabled(env)) return { mode: 'open' };

  const { allowed, invalid } = parseAllowlist(env[PILOT_ALLOWLIST_ENV]);

  if (invalid > 0) return { mode: 'closed', reason: 'invalid-allowlist', invalidEntries: invalid };
  if (allowed.length === 0) {
    return { mode: 'closed', reason: 'missing-allowlist', invalidEntries: 0 };
  }

  return { mode: 'gated', allowed: new Set(allowed) };
}

/**
 * Whether this address may create an account.
 *
 * Takes an already-normalised address. Normalising here instead would let a
 * caller forget to normalise the value it then writes to the database, which
 * is the mismatch `normalizeEmail`'s comment warns about.
 */
export function isSignupAllowed(gate: PilotGate, normalizedEmail: string): boolean {
  switch (gate.mode) {
    case 'open':
      return true;
    case 'closed':
      return false;
    case 'gated':
      return gate.allowed.has(normalizedEmail);
  }
}

/**
 * One word for the deployment's signup posture, for the detailed health view.
 *
 * An operator whose allowlist is malformed sees an identical refusal to
 * everyone else — that is the point of the single message — so they need
 * somewhere else to find out. This is that somewhere. It reports the shape of
 * the configuration and never the addresses in it.
 */
export function signupPosture(
  env: EnvLike = process.env,
): 'open' | 'invitation-only' | 'misconfigured-allowlist' {
  const gate = pilotGate(env);
  if (gate.mode === 'open') return 'open';
  if (gate.mode === 'closed') return 'misconfigured-allowlist';
  return 'invitation-only';
}

/**
 * Whether an allowlist is configured while the gate is off.
 *
 * A deployment in this state looks protected in its environment variables and
 * is not. Worth a warning line at the one place that can see both facts.
 */
export function allowlistSetButPilotModeOff(env: EnvLike = process.env): boolean {
  return !pilotModeEnabled(env) && normalizeEmail(env[PILOT_ALLOWLIST_ENV] ?? '').length > 0;
}
