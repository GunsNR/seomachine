import { PrismaClient, Prisma } from "@prisma/client";

/**
 * Tenant guard.
 *
 * Every model that carries `workspaceId` is tenant-owned. A query on one of
 * those models that does not constrain `workspaceId` is refused at runtime,
 * before it reaches Postgres. This is defence in depth on top of the
 * application checks in lib/auth.ts: forgetting a filter fails loudly in tests
 * instead of quietly leaking another client's rows.
 *
 * `systemDb` skips the guard. It is used only by: authentication (sessions,
 * memberships), the worker's job claim, and the public site renderer resolving
 * a slug. Each of those call sites re-scopes by workspace immediately after.
 */

const UNGUARDED = new Set(["User", "Session", "AuthToken", "Workspace", "Membership", "RateLimitCounter", "Job"]);

export const TENANT_MODELS: ReadonlySet<string> = new Set(
  Prisma.dmmf.datamodel.models
    .filter((m) => !UNGUARDED.has(m.name) && m.fields.some((f) => f.name === "workspaceId"))
    .map((m) => m.name),
);

export class TenantScopeError extends Error {
  constructor(model: string, operation: string) {
    super(`Refused ${model}.${operation}: tenant-owned query without workspaceId`);
    this.name = "TenantScopeError";
  }
}

function hasWorkspace(where: unknown): boolean {
  if (!where || typeof where !== "object") return false;
  const w = where as Record<string, unknown>;
  const v = w.workspaceId;
  if (typeof v === "string" && v.length > 0) return true;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.equals === "string") return true;
    if (Array.isArray(o.in) && o.in.length > 0 && o.in.every((x) => typeof x === "string")) return true;
  }
  // Compound unique inputs such as { workspaceId_emailNormalized: {...} }
  for (const [k, val] of Object.entries(w)) {
    if (k.startsWith("workspaceId_") && val && typeof val === "object" && typeof (val as Record<string, unknown>).workspaceId === "string") return true;
  }
  if (Array.isArray(w.AND)) return w.AND.some(hasWorkspace);
  return false;
}

function dataHasWorkspace(data: unknown): boolean {
  if (Array.isArray(data)) return data.length > 0 && data.every(dataHasWorkspace);
  return !!data && typeof data === "object" && typeof (data as Record<string, unknown>).workspaceId === "string";
}

export function assertTenantArgs(model: string, operation: string, args: Record<string, unknown> | undefined): void {
  if (!TENANT_MODELS.has(model)) return;
  const a = args ?? {};
  switch (operation) {
    case "create":
      if (!dataHasWorkspace(a.data)) throw new TenantScopeError(model, operation);
      return;
    case "createMany":
    case "createManyAndReturn":
      if (!dataHasWorkspace(a.data)) throw new TenantScopeError(model, operation);
      return;
    case "upsert":
      if (!hasWorkspace(a.where) || !dataHasWorkspace(a.create)) throw new TenantScopeError(model, operation);
      return;
    default:
      if (!hasWorkspace(a.where)) throw new TenantScopeError(model, operation);
  }
}

function makeClient() {
  const base = new PrismaClient({ log: process.env.PRISMA_LOG ? ["query"] : process.env.VITEST ? ["warn"] : ["warn", "error"] });
  const guarded = base.$extends({
    name: "tenant-guard",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          assertTenantArgs(model, operation, args as Record<string, unknown>);
          return query(args);
        },
      },
    },
  });
  return { base, guarded };
}

type Clients = ReturnType<typeof makeClient>;
const g = globalThis as unknown as { __growthDb?: Clients };
const clients = g.__growthDb ?? makeClient();
if (process.env.NODE_ENV !== "production") g.__growthDb = clients;

/** Tenant-guarded client. Use this everywhere except the documented exceptions. */
export const db = clients.guarded;
/** Unguarded. Auth, worker claim and public slug resolution only. */
export const systemDb = clients.base;

export type Db = typeof db;
export type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];
