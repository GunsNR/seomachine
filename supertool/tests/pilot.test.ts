import { describe, expect, it } from 'vitest';
import {
  allowlistSetButPilotModeOff,
  isSignupAllowed,
  normalizeEmail,
  parseAllowlist,
  PILOT_ALLOWLIST_ENV,
  PILOT_MODE_ENV,
  PILOT_REFUSAL_MESSAGE,
  pilotGate,
  pilotModeEnabled,
  signupPosture,
} from '@/lib/pilot';

/**
 * The gate's decision table, tested without a route or a database.
 *
 * `tests/pilot-signup.test.ts` proves the route actually consults this. These
 * prove it decides the right thing, including the cases that are hard to reach
 * through HTTP: a list of nothing but commas, a flag that says `1`, an entry
 * with a space in it.
 */

const env = (over: Record<string, string | undefined> = {}) => ({ ...over });

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

describe('pilotModeEnabled', () => {
  it('is on only for a literal true', () => {
    expect(pilotModeEnabled(env({ [PILOT_MODE_ENV]: 'true' }))).toBe(true);
    expect(pilotModeEnabled(env({ [PILOT_MODE_ENV]: 'TRUE' }))).toBe(true);
    expect(pilotModeEnabled(env({ [PILOT_MODE_ENV]: '  true  ' }))).toBe(true);
  });

  it('is off for truthy-looking values, so a typo cannot half-enable it', () => {
    for (const value of ['1', 'yes', 'on', 'enabled', 'True!', '']) {
      expect(pilotModeEnabled(env({ [PILOT_MODE_ENV]: value })), value).toBe(false);
    }
  });

  it('is off when unset', () => {
    expect(pilotModeEnabled(env())).toBe(false);
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

describe('pilotGate', () => {
  it('is open when the flag is off, whatever the allowlist says', () => {
    const gate = pilotGate(env({ [PILOT_ALLOWLIST_ENV]: 'someone@example.com' }));
    expect(gate.mode).toBe('open');
  });

  it('gates on a valid allowlist', () => {
    const gate = pilotGate(
      env({ [PILOT_MODE_ENV]: 'true', [PILOT_ALLOWLIST_ENV]: 'Izzy@Example.com' }),
    );
    expect(gate.mode).toBe('gated');
    if (gate.mode !== 'gated') throw new Error('unreachable');
    expect(gate.allowed.has('izzy@example.com')).toBe(true);
  });

  it('fails closed when the flag is on and the list is missing', () => {
    const gate = pilotGate(env({ [PILOT_MODE_ENV]: 'true' }));
    expect(gate).toMatchObject({ mode: 'closed', reason: 'missing-allowlist' });
  });

  it('fails closed when the list is present but empty', () => {
    const gate = pilotGate(env({ [PILOT_MODE_ENV]: 'true', [PILOT_ALLOWLIST_ENV]: ' , , ' }));
    expect(gate).toMatchObject({ mode: 'closed', reason: 'missing-allowlist' });
  });

  it('fails closed on a malformed entry rather than silently dropping it', () => {
    // The alternative — keep the good addresses, ignore the bad one — locks one
    // invited person out while everything looks healthy. Refuse the list.
    const gate = pilotGate(
      env({ [PILOT_MODE_ENV]: 'true', [PILOT_ALLOWLIST_ENV]: 'good@example.com, oops' }),
    );
    expect(gate).toMatchObject({ mode: 'closed', reason: 'invalid-allowlist', invalidEntries: 1 });
  });
});

describe('isSignupAllowed', () => {
  const gated = pilotGate(
    env({ [PILOT_MODE_ENV]: 'true', [PILOT_ALLOWLIST_ENV]: 'izzy@example.com, second@example.com' }),
  );

  it('admits an allowlisted address', () => {
    expect(isSignupAllowed(gated, 'izzy@example.com')).toBe(true);
    expect(isSignupAllowed(gated, 'second@example.com')).toBe(true);
  });

  it('refuses anything else', () => {
    expect(isSignupAllowed(gated, 'stranger@example.com')).toBe(false);
  });

  it('matches on the normalized form', () => {
    expect(isSignupAllowed(gated, normalizeEmail('  IZZY@Example.com '))).toBe(true);
  });

  it('refuses everything when the gate failed closed', () => {
    const closed = pilotGate(env({ [PILOT_MODE_ENV]: 'true' }));
    expect(isSignupAllowed(closed, 'izzy@example.com')).toBe(false);
  });

  it('admits everything when the gate is off', () => {
    expect(isSignupAllowed(pilotGate(env()), 'anyone@example.com')).toBe(true);
  });
});

describe('signupPosture', () => {
  it('reports the shape of the configuration for the health view', () => {
    expect(signupPosture(env())).toBe('open');
    expect(
      signupPosture(env({ [PILOT_MODE_ENV]: 'true', [PILOT_ALLOWLIST_ENV]: 'a@example.com' })),
    ).toBe('invitation-only');
    expect(signupPosture(env({ [PILOT_MODE_ENV]: 'true' }))).toBe('misconfigured-allowlist');
  });
});

describe('allowlistSetButPilotModeOff', () => {
  it('flags the deployment that looks protected and is not', () => {
    expect(allowlistSetButPilotModeOff(env({ [PILOT_ALLOWLIST_ENV]: 'a@example.com' }))).toBe(true);
  });

  it('is quiet when the pair is coherent', () => {
    expect(allowlistSetButPilotModeOff(env())).toBe(false);
    expect(
      allowlistSetButPilotModeOff(
        env({ [PILOT_MODE_ENV]: 'true', [PILOT_ALLOWLIST_ENV]: 'a@example.com' }),
      ),
    ).toBe(false);
  });
});

describe('PILOT_REFUSAL_MESSAGE', () => {
  it('says the pilot is invitation-only without naming a reason', () => {
    expect(PILOT_REFUSAL_MESSAGE).toMatch(/invitation-only/i);
  });

  it('never hints at whether the address exists or is allowlisted', () => {
    expect(PILOT_REFUSAL_MESSAGE).not.toMatch(/already (exists|registered)|not (invited|allowed)|allowlist/i);
  });
});
