// Deliberately NOT `server-only`: entitlement is re-checked inside the job
// worker, which runs as a plain Node process rather than a request. The marker
// throws there, and a worker that cannot ask "is this org still entitled?"
// would perform unpaid work. Nothing is lost by dropping it: this module
// imports the Prisma client, so Next's bundler already fails loudly on any
// client import of it.
import { getSubscription } from './billing';
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

/**
 * Raised when a workspace's subscription has lapsed.
 *
 * Deliberately separate from a plan limit: the fix is billing, not upgrading,
 * and the product responds differently — reads and exports stay open so a
 * lapsed customer can still get their data out, which the privacy policy
 * promises. Only actions that consume resources are blocked.
 */
export class SubscriptionRequiredError extends Error {
  constructor(public readonly status: string) {
    super(
      status === 'trialing'
        ? 'Your free trial has ended. Choose a plan to keep running checks.'
        : status === 'past_due'
          ? 'Your last payment failed. Update your card to keep running checks.'
          : 'Your subscription is not active. Choose a plan to keep running checks.',
    );
    this.name = 'SubscriptionRequiredError';
  }
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
  await assertEntitled(orgId);

  const org = await db.organization.findUnique({ where: { id: orgId } });
  const plan = getPlan(org?.plan ?? 'starter');
  const limit = plan[resource];

  if (limit === Infinity) return;

  const usage = await getUsage(orgId);
  if (usage[resource] + adding > limit) {
    throw new PlanLimitError(resource, limit, plan.label);
  }
}

/**
 * Guards any action that consumes resources — running engine checks, crawling,
 * publishing. Reads and exports deliberately do not call this.
 */
export async function assertEntitled(orgId: string): Promise<void> {
  const subscription = await getSubscription(orgId);
  if (!subscription.entitled) {
    throw new SubscriptionRequiredError(subscription.status);
  }
}

/** Remaining headroom per resource, for the settings screen. */
export async function getEntitlements(orgId: string) {
  const [org, usage, subscription] = await Promise.all([
    db.organization.findUnique({ where: { id: orgId } }),
    getUsage(orgId),
    getSubscription(orgId),
  ]);
  const plan = getPlan(org?.plan ?? 'starter');

  return {
    plan,
    planId: (org?.plan ?? 'starter') as PlanId,
    subscription,
    usage,
    remaining: {
      projects: plan.projects === Infinity ? Infinity : Math.max(0, plan.projects - usage.projects),
      prompts: plan.prompts === Infinity ? Infinity : Math.max(0, plan.prompts - usage.prompts),
      keywords: plan.keywords === Infinity ? Infinity : Math.max(0, plan.keywords - usage.keywords),
    },
  };
}
