import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { globSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ROLES,
  assertCan,
  can,
  normalizeRole,
  permissionsFor,
  ForbiddenError,
  type Permission,
  type Role,
} from '@/lib/rbac';

/**
 * Roles, and the routes that must enforce them.
 *
 * `Membership.role` existed before Phase 2 and nothing read it. Every
 * authenticated member could delete any project, rotate any API key and change
 * billing. A column that looks like a control but is not one is worse than no
 * column: it makes a reviewer believe a boundary exists.
 */

const APP_ROUTES = resolve(__dirname, '../src/app/api/app');

describe('the permission table', () => {
  it('orders roles from most to least privileged without gaps', () => {
    const counts = ROLES.map((r) => permissionsFor(r).length);
    // owner ⊇ admin ⊇ member ⊇ viewer, strictly decreasing.
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
    expect(new Set(counts).size).toBe(counts.length);
  });

  it('nests each role inside the one above it', () => {
    const order: Role[] = ['viewer', 'member', 'admin', 'owner'];
    for (let i = 0; i < order.length - 1; i++) {
      const lower = permissionsFor(order[i]);
      const higher = permissionsFor(order[i + 1]);
      for (const p of lower) {
        expect(higher, `${order[i + 1]} must include ${p} from ${order[i]}`).toContain(p);
      }
    }
  });

  it('lets only the owner touch billing or the organisation', () => {
    for (const role of ROLES) {
      const owned = role === 'owner';
      expect(can(role, 'billing:manage'), role).toBe(owned);
      expect(can(role, 'org:manage'), role).toBe(owned);
    }
  });

  it('never lets a viewer write anything', () => {
    const writes: Permission[] = [
      'measurement:run', 'project:write', 'content:write', 'publish:execute',
      'project:delete', 'apikey:manage', 'member:manage', 'org:manage', 'billing:manage',
    ];
    for (const p of writes) expect(can('viewer', p), p).toBe(false);
  });

  it('lets every role read', () => {
    for (const role of ROLES) {
      expect(can(role, 'project:read'), role).toBe(true);
      expect(can(role, 'measurement:read'), role).toBe(true);
      // Export stays open to everyone: the privacy policy promises a customer
      // can always retrieve their own data.
      expect(can(role, 'export:read'), role).toBe(true);
    }
  });
});

describe('an unrecognised role is the least privileged, never the most', () => {
  it('treats an unknown string as viewer', () => {
    // A typo, a legacy value, or a row written by an older version must not
    // grant ownership by accident.
    for (const value of ['', 'admjn', 'superuser', 'root', 'OWNER', null, undefined]) {
      expect(normalizeRole(value as string | null | undefined), String(value)).toBe('viewer');
      expect(can(value as string, 'project:delete'), String(value)).toBe(false);
      expect(can(value as string, 'billing:manage'), String(value)).toBe(false);
    }
  });

  it('is case-sensitive rather than helpfully lenient', () => {
    // 'OWNER' normalising to 'owner' would mean a database with inconsistent
    // casing silently grants more than it appears to.
    expect(normalizeRole('OWNER')).toBe('viewer');
  });
});

describe('assertCan', () => {
  it('throws ForbiddenError naming the role but never the resource', () => {
    try {
      assertCan('viewer', 'project:delete');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenError);
      const e = err as ForbiddenError;
      expect(e.role).toBe('viewer');
      expect(e.permission).toBe('project:delete');
      // Naming the resource would let a probe learn what exists.
      expect(e.message).not.toMatch(/project_|proj_|id/i);
    }
  });

  it('passes silently when the role holds the permission', () => {
    expect(() => assertCan('owner', 'billing:manage')).not.toThrow();
    expect(() => assertCan('member', 'measurement:run')).not.toThrow();
  });
});

/**
 * The structural check: a mutating route that forgets its permission is the
 * regression this whole module exists to prevent, and it is invisible in a unit
 * test of the permission table. So the route files themselves are inspected.
 */
describe('every mutating dashboard route declares a permission', () => {
  const files = globSync('**/route.ts', { cwd: APP_ROUTES }).map((f) => ({
    path: f,
    source: readFileSync(resolve(APP_ROUTES, f), 'utf8'),
  }));

  it('finds the route files at all', () => {
    // Guards against this suite silently passing because the glob broke.
    expect(files.length).toBeGreaterThan(8);
  });

  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    it(`declares a permission on every ${method} handler`, () => {
      const offenders: string[] = [];

      for (const { path, source } of files) {
        if (!new RegExp(`export const ${method}\\b|export async function ${method}\\b`).test(source)) {
          continue;
        }

        // Either style is acceptable: the withSession permission argument, or
        // an explicit can()/assertCan() guard in a hand-rolled handler.
        const guarded =
          /withSession\([\s\S]*?\}, '[a-z]+:[a-z]+'\)/.test(source) ||
          /can\(session\.role, '[a-z]+:[a-z]+'\)/.test(source) ||
          /assertCan\(/.test(source);

        // The account route changes only the caller's own password, which is
        // authenticated by the current password rather than by role.
        if (path.startsWith('account/')) continue;

        if (!guarded) offenders.push(`${path} (${method})`);
      }

      expect(offenders, `unguarded mutating handlers: ${offenders.join(', ')}`).toEqual([]);
    });
  }
});
