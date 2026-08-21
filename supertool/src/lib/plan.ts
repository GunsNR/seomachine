import 'server-only';
import { db } from './db';

/**
 * Plan entitlements.
 *
 * These are the numbers the pricing page sells, enforced in one place so the
 * marketing copy and the product cannot drift apart.
 */
export const PLANS = {
  starter: {
    label: 'Starter',
    projects: 1,
    prompts: 25,
    keywords: 250,
    auditPages: 100,
    seats: 1,
    frequency: 'weekly' as const,
    contentEngine: false,
    attribution: false,
    whiteLabel: false,
    apiAccess: false,
  },
  growth: {
    label: 'Growth',
    projects: 5,
    prompts: 150,
    keywords: 2000,
    auditPages: 1000,
    seats: Infinity,
    frequency: 'daily' as const,
    contentEngine: true,
    attribution: true,
    whiteLabel: false,
    apiAccess: false,
  },
  scale: {
    label: 'Scale',
    projects: Infinity,
    prompts: 1000,
    keywords: 20_000,
    auditPages: Infinity,
    seats: Infinity,
    frequency: 'daily' as const,
    contentEngine: true,
    attribution: true,
    whiteLabel: true,
    apiAccess: true,
  },
} as const;

export type PlanId = keyof typeof PLANS;
export type Plan = (typeof PLANS)[PlanId];

export function getPlan(id: string): Plan {
  return PLANS[id as PlanId] ?? PLANS.growth;
}

export interface Usage {
  projects: number;
  prompts: number;
  keywords: number;
}

/** Current consumption for an organisation, across all its projects. */
export async function getUsage(orgId: string): Promise<Usage> {
  const [projects, prompts, keywords] = await Promise.all([
    db.project.count({ where: { orgId } }),
    db.aiPrompt.count({ where: { project: { orgId } } }),
    db.keyword.count({ where: { project: { orgId } } }),
  ]);
  return { projects, prompts, keywords };
}

export class PlanLimitError extends Error {
  constructor(
    public readonly resource: keyof Usage,
    public readonly limit: number,
    public readonly planLabel: string,
  ) {
    super(
      `Your ${planLabel} plan allows ${limit.toLocaleString()} ${resource}. ` +
        `Upgrade to add more.`,
    );
    this.name = 'PlanLimitError';
  }
}

/**
 * Throws PlanLimitError when adding `adding` more of `resource` would exceed
 * the organisation's entitlement. Call before any create.
 */
export async function assertWithinLimit(
  orgId: string,
  resource: keyof Usage,
  adding = 1,
): Promise<void> {
  const org = await db.organization.findUnique({ where: { id: orgId } });
  const plan = getPlan(org?.plan ?? 'growth');
  const limit = plan[resource];

  if (limit === Infinity) return;

  const usage = await getUsage(orgId);
  if (usage[resource] + adding > limit) {
    throw new PlanLimitError(resource, limit, plan.label);
  }
}

/** Remaining headroom per resource, for the settings screen. */
export async function getEntitlements(orgId: string) {
  const org = await db.organization.findUnique({ where: { id: orgId } });
  const plan = getPlan(org?.plan ?? 'growth');
  const usage = await getUsage(orgId);

  return {
    plan,
    planId: (org?.plan ?? 'growth') as PlanId,
    usage,
    remaining: {
      projects: plan.projects === Infinity ? Infinity : Math.max(0, plan.projects - usage.projects),
      prompts: plan.prompts === Infinity ? Infinity : Math.max(0, plan.prompts - usage.prompts),
      keywords: plan.keywords === Infinity ? Infinity : Math.max(0, plan.keywords - usage.keywords),
    },
  };
}
