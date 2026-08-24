/**
 * Roles and permissions.
 *
 * `Membership.role` existed before Phase 2 and was never read. Every
 * authenticated member of an organisation could do everything: delete
 * projects, rotate API keys, change billing. The column implied a boundary the
 * code did not enforce, which is worse than having no column at all, because it
 * reads like a control.
 *
 * This module is pure — no I/O, no database — so the permission table can be
 * tested exhaustively without a fixture.
 */

export type Role = 'owner' | 'admin' | 'member' | 'viewer';

export const ROLES: readonly Role[] = ['owner', 'admin', 'member', 'viewer'] as const;

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

/**
 * An unknown role string is treated as the *least* privileged role, never the
 * most. A typo in the database must not grant ownership.
 */
export function normalizeRole(value: string | null | undefined): Role {
  return value && isRole(value) ? value : 'viewer';
}

export type Permission =
  // Reading
  | 'project:read'
  | 'measurement:read'
  | 'export:read'
  // Ordinary work
  | 'measurement:run'
  | 'project:write'
  | 'content:write'
  | 'publish:execute'
  // Administration
  | 'project:delete'
  | 'apikey:manage'
  | 'member:manage'
  | 'org:manage'
  // Money
  | 'billing:manage';

/**
 * What each role may do.
 *
 * Written out per role rather than as an inheritance chain. A chain is shorter,
 * but it makes "what exactly can a member do?" a question you answer by
 * mentally unrolling three levels — and that is how a permission ends up
 * somewhere nobody intended.
 */
const GRANTS: Record<Role, readonly Permission[]> = {
  viewer: ['project:read', 'measurement:read', 'export:read'],

  member: [
    'project:read',
    'measurement:read',
    'export:read',
    'measurement:run',
    'content:write',
  ],

  admin: [
    'project:read',
    'measurement:read',
    'export:read',
    'measurement:run',
    'content:write',
    'project:write',
    'publish:execute',
    'project:delete',
    'apikey:manage',
    'member:manage',
  ],

  // Only the owner touches billing or the organisation itself.
  owner: [
    'project:read',
    'measurement:read',
    'export:read',
    'measurement:run',
    'content:write',
    'project:write',
    'publish:execute',
    'project:delete',
    'apikey:manage',
    'member:manage',
    'org:manage',
    'billing:manage',
  ],
};

export function can(role: Role | string | null | undefined, permission: Permission): boolean {
  return GRANTS[normalizeRole(typeof role === 'string' ? role : role ?? undefined)].includes(
    permission,
  );
}

export function permissionsFor(role: Role | string | null | undefined): readonly Permission[] {
  return GRANTS[normalizeRole(typeof role === 'string' ? role : role ?? undefined)];
}

/** Raised when an authenticated user lacks the permission for an action. */
export class ForbiddenError extends Error {
  constructor(
    public readonly permission: Permission,
    public readonly role: Role,
  ) {
    super(`Your role (${role}) cannot perform this action.`);
    this.name = 'ForbiddenError';
  }
}

/**
 * Throw unless `role` holds `permission`.
 *
 * The message names the role but never the resource, so a probe cannot use the
 * error text to learn whether a given project exists.
 */
export function assertCan(role: Role | string | null | undefined, permission: Permission): void {
  const normalized = normalizeRole(typeof role === 'string' ? role : role ?? undefined);
  if (!can(normalized, permission)) throw new ForbiddenError(permission, normalized);
}
