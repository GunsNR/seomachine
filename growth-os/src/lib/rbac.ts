export type Role = "owner" | "admin" | "member" | "client";

export type Permission =
  | "crm.read" | "crm.write"
  | "outcome.confirm"
  | "content.write" | "content.approve"
  | "site.write" | "site.publish" | "site.approve"
  | "seo.read" | "seo.write"
  | "reports.read"
  | "settings.manage" | "members.manage" | "live.toggle" | "workspace.pause"
  | "portal.view";

const MATRIX: Record<Role, ReadonlySet<Permission>> = {
  owner: new Set<Permission>([
    "crm.read", "crm.write", "outcome.confirm", "content.write", "content.approve", "site.write", "site.publish", "site.approve",
    "seo.read", "seo.write", "reports.read", "settings.manage", "members.manage", "live.toggle", "workspace.pause", "portal.view",
  ]),
  admin: new Set<Permission>([
    "crm.read", "crm.write", "outcome.confirm", "content.write", "content.approve", "site.write", "site.publish", "site.approve",
    "seo.read", "seo.write", "reports.read", "settings.manage", "members.manage", "workspace.pause", "portal.view",
  ]),
  member: new Set<Permission>(["crm.read", "crm.write", "outcome.confirm", "content.write", "site.write", "seo.read", "seo.write", "reports.read"]),
  // A client sees only their own portal: confirm outcomes, approve work, read reports.
  client: new Set<Permission>(["outcome.confirm", "content.approve", "site.approve", "reports.read", "portal.view"]),
};

export function can(role: string, permission: Permission): boolean {
  return (MATRIX as Record<string, ReadonlySet<Permission>>)[role]?.has(permission) ?? false;
}

export function isStaff(role: string): boolean {
  return role === "owner" || role === "admin" || role === "member";
}

export class PermissionError extends Error {
  constructor(public permission: string) {
    super(`You don't have permission to do this (${permission}). Ask a workspace owner for access.`);
    this.name = "PermissionError";
  }
}

export function assertCan(role: string, permission: Permission): void {
  if (!can(role, permission)) throw new PermissionError(permission);
}
