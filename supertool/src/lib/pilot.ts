import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';
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
 * Four rules shape everything below.
 *
 * **Explicit, never inferred, and never approximately.** `PILOT_MODE` has three
 * states, not two. Unset or `false` means open, which a deployment may
 * legitimately want. `true` means invitation-only. **Anything else is a
 * configuration error and blocks every signup** — `1`, `yes` and `on` included.
 * An operator who writes one of those meant to close the door; treating the
 * value as "not true, so open" would leave a public signup form on a
 * deployment whose owner believes it is closed, which is the worst of the three
 * possible readings.
 *
 * **Fail closed, not open.** Once the gate is engaged, a missing or malformed
 * allowlist, or a missing or weak invitation code, refuses every signup. The
 * alternative — treating unreadable configuration as "no restriction" — turns a
 * typo in an environment variable into an open signup form on a public URL,
 * which is the exact failure this module exists to prevent.
 *
 * **Knowing an address is not proof.** An allowlist alone authenticates
 * nothing: an address is not a secret, and anyone who learns one before its
 * owner signs up can claim that account. `PILOT_INVITE_CODE` is the second
 * factor — a shared secret the operator hands to invitees out of band. It is
 * not a per-person token and does not pretend to be one; it raises the bar from
 * "guess who was invited" to "hold a 32-character secret", which is the right
 * bar for a pilot and the wrong one for a public programme.
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
 *
 * **The invitation code never leaves this module.** It is read from the
 * environment, compared in constant time against a presented value, and never
 * returned, logged, hashed into a log line, persisted, or included in any
 * response. `PilotGate` carries it because the comparison happens here; nothing
 * else may read that field.
 */

export const PILOT_MODE_ENV = 'PILOT_MODE';
export const PILOT_ALLOWLIST_ENV = 'PILOT_ALLOWED_EMAILS';
export const PILOT_INVITE_CODE_ENV = 'PILOT_INVITE_CODE';

/**
 * Minimum invitation-code length.
 *
 * 32 characters is what `openssl rand -base64 24` produces and is far past
 * anything an online attacker can reach through a rate-limited form.
 */
export const MIN_INVITE_CODE_LENGTH = 32;

/**
 * Minimum distinct characters in an invitation code.
 *
 * A length check alone accepts `aaaaaaaa…` and `12341234…`, which are 32
 * characters of nothing. This is a padding-and-repetition guard, **not** an
 * entropy estimator: it cannot tell a random string from a memorable one, and
 * it is not trying to. Any output of `openssl rand -base64 24` clears 12
 * distinct characters comfortably, and the real guarantee comes from
 * generating the code that way rather than from this check passing.
 */
const MIN_DISTINCT_CHARACTERS = 12;

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
 * address is not on the list, the code is wrong or absent, the configuration is
 * unusable, or an account already exists. Four different facts, one
 * indistinguishable response — otherwise the form becomes an oracle that
 * answers "is this address invited?", "is this address registered?" and, worst,
 * "was that code right?" to anyone who asks.
 *
 * It is also the message a legitimately invited person sees when they mistype
 * something, so it says what to do next rather than only what went wrong.
 */
export const PILOT_REFUSAL_MESSAGE =
  'This pilot is invitation-only. Check the email address and invitation code you were sent. ' +
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

/** What `PILOT_MODE` is set to, as a decision rather than a boolean. */
export type PilotModeSetting =
  /** Unset or an explicit `false`. Signup stays open. */
  | 'off'
  /** Exactly `true`. Invitation-only. */
  | 'on'
  /** Set to something else entirely. A configuration error. */
  | 'invalid';

export function pilotModeSetting(env: EnvLike = process.env): PilotModeSetting {
  const raw = (env[PILOT_MODE_ENV] ?? '').trim().toLowerCase();
  if (raw === '') return 'off';
  if (raw === 'true') return 'on';
  if (raw === 'false') return 'off';
  return 'invalid';
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

/** Why the gate is refusing everything. Reported only where a token is required. */
export type PilotClosedReason =
  | 'invalid-mode-flag'
  | 'missing-allowlist'
  | 'invalid-allowlist'
  | 'missing-invite-code'
  | 'weak-invite-code';

export type PilotGate =
  /** The gate is off. Signup behaves as it always has. */
  | { mode: 'open' }
  /** The gate is engaged and unusable. Every signup is refused. */
  | { mode: 'closed'; reason: PilotClosedReason; invalidEntries: number }
  /**
   * The gate is engaged and working. Only these addresses, presenting this
   * code, may sign up.
   *
   * `inviteCode` is a secret. Read it only to pass it to
   * `inviteCodeMatches`; never log, return, persist or otherwise surface it.
   */
  | { mode: 'gated'; allowed: ReadonlySet<string>; inviteCode: string };

/** Whether a configured code is long and varied enough to be worth having. */
export function inviteCodeIsStrong(code: string): boolean {
  if (code.length < MIN_INVITE_CODE_LENGTH) return false;
  return new Set(code).size >= MIN_DISTINCT_CHARACTERS;
}

/**
 * Constant-time comparison of a presented code against the configured one.
 *
 * Both sides are digested first so the comparison is over two fixed-length
 * buffers. Comparing the raw strings would mean either refusing a
 * length mismatch up front — which leaks the configured length one probe at a
 * time — or feeding `timingSafeEqual` buffers it throws on. Hashing removes the
 * question: every comparison does identical work whatever was presented.
 *
 * The digests exist for the length of this call and are never returned or
 * logged. Hashing a secret *into a log line* is exactly as forbidden as
 * printing it.
 */
export function inviteCodeMatches(configured: string, presented: string): boolean {
  const a = createHash('sha256').update(configured).digest();
  const b = createHash('sha256').update(presented.trim()).digest();
  return timingSafeEqual(a, b);
}

/** Read the environment and decide what signup should do. */
export function pilotGate(env: EnvLike = process.env): PilotGate {
  const setting = pilotModeSetting(env);

  if (setting === 'off') return { mode: 'open' };

  // A value that is neither `true` nor `false` is an operator who meant
  // something and did not get it. Refuse rather than guess which.
  if (setting === 'invalid') {
    return { mode: 'closed', reason: 'invalid-mode-flag', invalidEntries: 0 };
  }

  const { allowed, invalid } = parseAllowlist(env[PILOT_ALLOWLIST_ENV]);

  if (invalid > 0) return { mode: 'closed', reason: 'invalid-allowlist', invalidEntries: invalid };
  if (allowed.length === 0) {
    return { mode: 'closed', reason: 'missing-allowlist', invalidEntries: 0 };
  }

  // Trimmed, because trailing whitespace in a pasted secret is a real hazard
  // and an invisible one. The presented value is trimmed the same way.
  const inviteCode = (env[PILOT_INVITE_CODE_ENV] ?? '').trim();

  if (!inviteCode) return { mode: 'closed', reason: 'missing-invite-code', invalidEntries: 0 };
  if (!inviteCodeIsStrong(inviteCode)) {
    return { mode: 'closed', reason: 'weak-invite-code', invalidEntries: 0 };
  }

  return { mode: 'gated', allowed: new Set(allowed), inviteCode };
}

export interface SignupAttempt {
  /** Already normalised — see `normalizeEmail`. */
  email: string;
  /** Whatever the caller supplied, or '' when they supplied nothing. */
  inviteCode: string;
}

/**
 * Whether this attempt may create an account.
 *
 * Both conditions are evaluated before either is consulted, so a wrong address
 * and a wrong code cost the same work. Short-circuiting on the address would
 * make "not invited" measurably cheaper than "wrong code", which is a
 * distinction the single refusal message exists to deny.
 */
export function isSignupAllowed(gate: PilotGate, attempt: SignupAttempt): boolean {
  switch (gate.mode) {
    case 'open':
      return true;
    case 'closed':
      return false;
    case 'gated': {
      const emailOk = gate.allowed.has(attempt.email);
      const codeOk = inviteCodeMatches(gate.inviteCode, attempt.inviteCode);
      return emailOk && codeOk;
    }
  }
}

/** Whether signup accepts anyone, i.e. the gate is not engaged at all. */
export function signupIsOpen(env: EnvLike = process.env): boolean {
  return pilotGate(env).mode === 'open';
}

export type SignupPosture = 'open' | 'invitation-only' | `misconfigured:${PilotClosedReason}`;

/**
 * The deployment's signup posture, for the detailed health view.
 *
 * An operator whose configuration is broken sees an identical refusal to
 * everyone else — that is the point of the single message — so they need
 * somewhere else to find out, and a reason rather than just a flag. This is
 * that somewhere. It names which variable is wrong and never its contents: no
 * address, no code, no length, no digest.
 *
 * It is reported only behind `HEALTH_TOKEN`. The public probe says nothing
 * about it, because "this deployment's invite configuration is broken" is a
 * useful thing for an attacker to know and a useless thing for a load balancer.
 */
export function signupPosture(env: EnvLike = process.env): SignupPosture {
  const gate = pilotGate(env);
  if (gate.mode === 'open') return 'open';
  if (gate.mode === 'closed') return `misconfigured:${gate.reason}`;
  return 'invitation-only';
}

/**
 * Whether pilot configuration is present while the gate is off.
 *
 * A deployment in this state looks protected in its environment variables and
 * is not. Worth a warning line at the one place that can see both facts.
 * Checks presence only — the code's value is never inspected here.
 */
export function pilotConfigSetButModeOff(env: EnvLike = process.env): boolean {
  if (pilotModeSetting(env) !== 'off') return false;
  const hasList = (env[PILOT_ALLOWLIST_ENV] ?? '').trim().length > 0;
  const hasCode = (env[PILOT_INVITE_CODE_ENV] ?? '').trim().length > 0;
  return hasList || hasCode;
}
