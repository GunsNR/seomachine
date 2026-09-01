import { describe, expect, it } from 'vitest';
import {
  inviteCodeIsStrong,
  inviteCodeMatches,
  isSignupAllowed,
  MIN_INVITE_CODE_LENGTH,
  normalizeEmail,
  parseAllowlist,
  PILOT_ALLOWLIST_ENV,
  PILOT_INVITE_CODE_ENV,
  PILOT_MODE_ENV,
  PILOT_REFUSAL_MESSAGE,
  pilotConfigSetButModeOff,
  pilotGate,
  pilotModeSetting,
  signupIsOpen,
  signupPosture,
} from '@/lib/pilot';

/**
 * The gate's decision table, tested without a route or a database.
 *
 * `tests/pilot-signup.test.ts` proves the route consults this. These prove it
 * decides the right thing, including the cases that are hard to reach through
 * HTTP: a flag that says `1`, a list of nothing but commas, a code that is 32
 * characters of the same letter.
 */

const env = (over: Record<string, string | undefined> = {}) => ({ ...over });

/** A code of the right shape. Test fixture, never a real secret. */
const CODE = 'Kq7w-Zx2m-Rb9t-Vn4h-Ld6y-Pj3s-Ac8e';

const gatedEnv = (over: Record<string, string | undefined> = {}) =>
  env({
    [PILOT_MODE_ENV]: 'true',
    [PILOT_ALLOWLIST_ENV]: 'izzy@example.com, second@example.com',
    [PILOT_INVITE_CODE_ENV]: CODE,
    ...over,
  });

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  Izzy@Example.COM  ')).toBe('izzy@example.com');
  });

  it('is idempotent', () => {
    const once = normalizeEmail(' A@B.com ');
    expect(normalizeEmail(once)).toBe(once);
  });

  it('does not strip dots or plus tags', () => {
    // Deliberate. The signup route writes User.email with exactly this
    // transformation, so anything applied here and not there would let an
    // allowlisted address fail to match its own account.
    expect(normalizeEmail('First.Last+pilot@Example.com')).toBe('first.last+pilot@example.com');
  });
});

describe('pilotModeSetting', () => {
  it('is on only for a literal true', () => {
    for (const value of ['true', 'TRUE', '  true  ', 'True']) {
      expect(pilotModeSetting(env({ [PILOT_MODE_ENV]: value })), value).toBe('on');
    }
  });

  it('is off when unset or explicitly false', () => {
    expect(pilotModeSetting(env())).toBe('off');
    for (const value of ['', '   ', 'false', 'FALSE', ' False ']) {
      expect(pilotModeSetting(env({ [PILOT_MODE_ENV]: value })), value).toBe('off');
    }
  });

  it('treats every other non-empty value as a configuration error', () => {
    // The important row. Someone writing `1` meant to close the door; reading
    // it as "not true, therefore open" would leave a public signup form on a
    // deployment its owner believes is shut.
    for (const value of ['1', '0', 'yes', 'no', 'on', 'off', 'enabled', 'True!', 'ture']) {
      expect(pilotModeSetting(env({ [PILOT_MODE_ENV]: value })), value).toBe('invalid');
    }
  });
});

describe('parseAllowlist', () => {
  it('splits, trims, lowercases and deduplicates', () => {
    const { allowed, invalid } = parseAllowlist(' One@Example.com , two@example.com,ONE@example.com ');
    expect(allowed).toEqual(['one@example.com', 'two@example.com']);
    expect(invalid).toBe(0);
  });

  it('treats empty entries as whitespace, not mistakes', () => {
    const { allowed, invalid } = parseAllowlist(',,a@example.com,,,b@example.com,');
    expect(allowed).toEqual(['a@example.com', 'b@example.com']);
    expect(invalid).toBe(0);
  });

  it('counts anything that is not an address as invalid', () => {
    const { allowed, invalid } = parseAllowlist('a@example.com, not-an-email, @nope, b@example.com');
    expect(allowed).toEqual(['a@example.com', 'b@example.com']);
    expect(invalid).toBe(2);
  });

  it('returns nothing for an undefined or blank list', () => {
    expect(parseAllowlist(undefined)).toEqual({ allowed: [], invalid: 0 });
    expect(parseAllowlist('   ')).toEqual({ allowed: [], invalid: 0 });
  });
});

describe('inviteCodeIsStrong', () => {
  it('accepts a generated code', () => {
    expect(inviteCodeIsStrong(CODE)).toBe(true);
    // The shape `openssl rand -base64 24` produces.
    expect(inviteCodeIsStrong('Ky2Qn8vLpR4zXwTm6bJdHc3F')).toBe(false); // 24 chars: too short
    expect(inviteCodeIsStrong('Ky2Qn8vLpR4zXwTm6bJdHc3FgS9uYk1B')).toBe(true); // 32 chars
  });

  it('rejects anything shorter than the minimum', () => {
    expect(MIN_INVITE_CODE_LENGTH).toBe(32);
    expect(inviteCodeIsStrong('x'.repeat(MIN_INVITE_CODE_LENGTH - 1))).toBe(false);
    expect(inviteCodeIsStrong('')).toBe(false);
  });

  it('rejects length made of repetition', () => {
    // A length check alone accepts 32 characters of nothing. This is a padding
    // guard, not an entropy estimator, and only claims to catch these.
    expect(inviteCodeIsStrong('a'.repeat(40))).toBe(false);
    expect(inviteCodeIsStrong('abcabcabcabcabcabcabcabcabcabcabcabc')).toBe(false);
    expect(inviteCodeIsStrong('12341234123412341234123412341234')).toBe(false);
  });
});

describe('inviteCodeMatches', () => {
  it('matches an identical code', () => {
    expect(inviteCodeMatches(CODE, CODE)).toBe(true);
  });

  it('trims the presented value, so a pasted code with whitespace still works', () => {
    expect(inviteCodeMatches(CODE, `  ${CODE}\n`)).toBe(true);
  });

  it('rejects a wrong code, including a near miss', () => {
    expect(inviteCodeMatches(CODE, `${CODE}x`)).toBe(false);
    expect(inviteCodeMatches(CODE, CODE.slice(0, -1))).toBe(false);
    expect(inviteCodeMatches(CODE, CODE.toLowerCase())).toBe(false);
    expect(inviteCodeMatches(CODE, '')).toBe(false);
  });

  it('does not throw on a length mismatch', () => {
    // Both sides are digested first, so the comparison is always over two
    // equal-length buffers. Refusing a mismatch up front would leak the
    // configured length one probe at a time, and handing timingSafeEqual
    // unequal buffers would throw.
    expect(() => inviteCodeMatches(CODE, 'x')).not.toThrow();
    expect(() => inviteCodeMatches(CODE, 'y'.repeat(4096))).not.toThrow();
  });
});

describe('pilotGate', () => {
  it('is open when the flag is off, whatever else is set', () => {
    expect(
      pilotGate(env({ [PILOT_ALLOWLIST_ENV]: 'someone@example.com', [PILOT_INVITE_CODE_ENV]: CODE }))
        .mode,
    ).toBe('open');
    expect(pilotGate(env({ [PILOT_MODE_ENV]: 'false' })).mode).toBe('open');
  });

  it('gates when the flag, the list and the code are all valid', () => {
    const gate = pilotGate(gatedEnv());
    expect(gate.mode).toBe('gated');
    if (gate.mode !== 'gated') throw new Error('unreachable');
    expect(gate.allowed.has('izzy@example.com')).toBe(true);
  });

  it('fails closed on a mode flag that is neither true nor false', () => {
    for (const value of ['1', 'yes', 'on']) {
      const gate = pilotGate(gatedEnv({ [PILOT_MODE_ENV]: value }));
      expect(gate, value).toMatchObject({ mode: 'closed', reason: 'invalid-mode-flag' });
    }
  });

  it('fails closed when the allowlist is missing', () => {
    const gate = pilotGate(gatedEnv({ [PILOT_ALLOWLIST_ENV]: undefined }));
    expect(gate).toMatchObject({ mode: 'closed', reason: 'missing-allowlist' });
  });

  it('fails closed when the allowlist is present but empty', () => {
    const gate = pilotGate(gatedEnv({ [PILOT_ALLOWLIST_ENV]: ' , , ' }));
    expect(gate).toMatchObject({ mode: 'closed', reason: 'missing-allowlist' });
  });

  it('fails closed on a malformed entry rather than silently dropping it', () => {
    // The alternative — keep the good addresses, ignore the bad one — locks one
    // invited person out while everything looks healthy. Refuse the list.
    const gate = pilotGate(gatedEnv({ [PILOT_ALLOWLIST_ENV]: 'good@example.com, oops' }));
    expect(gate).toMatchObject({ mode: 'closed', reason: 'invalid-allowlist', invalidEntries: 1 });
  });

  it('fails closed when the invitation code is missing', () => {
    expect(pilotGate(gatedEnv({ [PILOT_INVITE_CODE_ENV]: undefined }))).toMatchObject({
      mode: 'closed',
      reason: 'missing-invite-code',
    });
    expect(pilotGate(gatedEnv({ [PILOT_INVITE_CODE_ENV]: '   ' }))).toMatchObject({
      mode: 'closed',
      reason: 'missing-invite-code',
    });
  });

  it('fails closed when the invitation code is too short or too repetitive', () => {
    expect(pilotGate(gatedEnv({ [PILOT_INVITE_CODE_ENV]: 'short' }))).toMatchObject({
      mode: 'closed',
      reason: 'weak-invite-code',
    });
    expect(pilotGate(gatedEnv({ [PILOT_INVITE_CODE_ENV]: 'a'.repeat(64) }))).toMatchObject({
      mode: 'closed',
      reason: 'weak-invite-code',
    });
  });
});

describe('isSignupAllowed', () => {
  const gated = pilotGate(gatedEnv());

  it('admits an allowlisted address presenting the right code', () => {
    expect(isSignupAllowed(gated, { email: 'izzy@example.com', inviteCode: CODE })).toBe(true);
    expect(isSignupAllowed(gated, { email: 'second@example.com', inviteCode: CODE })).toBe(true);
  });

  it('refuses the right code from an address that is not on the list', () => {
    expect(isSignupAllowed(gated, { email: 'stranger@example.com', inviteCode: CODE })).toBe(false);
  });

  it('refuses an allowlisted address with the wrong code', () => {
    expect(isSignupAllowed(gated, { email: 'izzy@example.com', inviteCode: 'nope' })).toBe(false);
  });

  it('refuses an allowlisted address with no code at all', () => {
    expect(isSignupAllowed(gated, { email: 'izzy@example.com', inviteCode: '' })).toBe(false);
  });

  it('matches the address on its normalized form', () => {
    expect(
      isSignupAllowed(gated, { email: normalizeEmail('  IZZY@Example.com '), inviteCode: CODE }),
    ).toBe(true);
  });

  it('refuses everything when the gate failed closed, code or not', () => {
    const closed = pilotGate(gatedEnv({ [PILOT_MODE_ENV]: 'yes' }));
    expect(isSignupAllowed(closed, { email: 'izzy@example.com', inviteCode: CODE })).toBe(false);
  });

  it('admits everything when the gate is off, with no code required', () => {
    expect(isSignupAllowed(pilotGate(env()), { email: 'anyone@example.com', inviteCode: '' })).toBe(
      true,
    );
  });
});

describe('signupIsOpen', () => {
  it('is true only when the gate is not engaged at all', () => {
    expect(signupIsOpen(env())).toBe(true);
    expect(signupIsOpen(env({ [PILOT_MODE_ENV]: 'false' }))).toBe(true);
    expect(signupIsOpen(gatedEnv())).toBe(false);
    // A misconfigured deployment is not open — it refuses everyone — so the
    // page must show the invitation-only form rather than offer a trial.
    expect(signupIsOpen(gatedEnv({ [PILOT_MODE_ENV]: 'on' }))).toBe(false);
    expect(signupIsOpen(gatedEnv({ [PILOT_INVITE_CODE_ENV]: undefined }))).toBe(false);
  });
});

describe('signupPosture', () => {
  it('names the working states', () => {
    expect(signupPosture(env())).toBe('open');
    expect(signupPosture(env({ [PILOT_MODE_ENV]: 'false' }))).toBe('open');
    expect(signupPosture(gatedEnv())).toBe('invitation-only');
  });

  it('names which variable is wrong, for the operator who cannot see the refusal', () => {
    expect(signupPosture(gatedEnv({ [PILOT_MODE_ENV]: '1' }))).toBe(
      'misconfigured:invalid-mode-flag',
    );
    expect(signupPosture(gatedEnv({ [PILOT_ALLOWLIST_ENV]: undefined }))).toBe(
      'misconfigured:missing-allowlist',
    );
    expect(signupPosture(gatedEnv({ [PILOT_ALLOWLIST_ENV]: 'bad entry' }))).toBe(
      'misconfigured:invalid-allowlist',
    );
    expect(signupPosture(gatedEnv({ [PILOT_INVITE_CODE_ENV]: undefined }))).toBe(
      'misconfigured:missing-invite-code',
    );
    expect(signupPosture(gatedEnv({ [PILOT_INVITE_CODE_ENV]: 'tiny' }))).toBe(
      'misconfigured:weak-invite-code',
    );
  });

  it('never carries the code, an address, or anything derived from them', () => {
    const posture = signupPosture(gatedEnv());
    expect(posture).not.toContain(CODE);
    expect(posture).not.toContain('izzy@example.com');
    expect(posture).not.toMatch(/\d{2,}/); // no lengths, no counts, no digests
  });
});

describe('pilotConfigSetButModeOff', () => {
  it('flags the deployment that looks protected and is not', () => {
    expect(pilotConfigSetButModeOff(env({ [PILOT_ALLOWLIST_ENV]: 'a@example.com' }))).toBe(true);
    expect(pilotConfigSetButModeOff(env({ [PILOT_INVITE_CODE_ENV]: CODE }))).toBe(true);
    expect(
      pilotConfigSetButModeOff(env({ [PILOT_MODE_ENV]: 'false', [PILOT_INVITE_CODE_ENV]: CODE })),
    ).toBe(true);
  });

  it('is quiet when the configuration is coherent', () => {
    expect(pilotConfigSetButModeOff(env())).toBe(false);
    expect(pilotConfigSetButModeOff(gatedEnv())).toBe(false);
    // An invalid flag is its own, louder problem; this warning is about the
    // gate being off while configuration suggests otherwise.
    expect(pilotConfigSetButModeOff(gatedEnv({ [PILOT_MODE_ENV]: '1' }))).toBe(false);
  });
});

describe('PILOT_REFUSAL_MESSAGE', () => {
  it('says the pilot is invitation-only without naming a reason', () => {
    expect(PILOT_REFUSAL_MESSAGE).toMatch(/invitation-only/i);
  });

  it('never hints at which check failed', () => {
    expect(PILOT_REFUSAL_MESSAGE).not.toMatch(
      /already (exists|registered)|not (invited|allowed)|allowlist|wrong code|incorrect code|expired/i,
    );
  });
});
