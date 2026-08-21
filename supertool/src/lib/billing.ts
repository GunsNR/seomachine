import 'server-only';
import Stripe from 'stripe';
import { db } from './db';
import { PLANS, type PlanId } from './plan';

/**
 * Stripe billing.
 *
 * The subscription in Stripe is the source of truth for entitlements; the
 * `plan` column is a cache written only by the webhook. Nothing on the client
 * can grant itself a tier — a checkout returns the user to the app, but their
 * plan does not change until Stripe tells us it did.
 */

export const TRIAL_DAYS = 14;

let client: Stripe | null = null;

/** Lazily constructed so the app boots without Stripe configured. */
export function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not configured.');
  if (!client) client = new Stripe(key, { apiVersion: '2025-08-27.basil' });
  return client;
}

export function billingEnabled(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/** Price id per plan and interval, from the environment. */
export function priceIdFor(plan: PlanId, interval: 'month' | 'year'): string | null {
  const key = `STRIPE_PRICE_${plan.toUpperCase()}_${interval === 'year' ? 'ANNUAL' : 'MONTHLY'}`;
  return process.env[key] || null;
}

/** Reverse lookup, so a webhook can map an incoming price back to a plan. */
export function planForPriceId(priceId: string): PlanId | null {
  for (const plan of Object.keys(PLANS) as PlanId[]) {
    for (const interval of ['month', 'year'] as const) {
      if (priceIdFor(plan, interval) === priceId) return plan;
    }
  }
  return null;
}

/** Statuses under which the workspace keeps full access. */
const ENTITLED = new Set(['trialing', 'active', 'past_due']);

export interface SubscriptionState {
  plan: PlanId;
  status: string;
  /** False once a trial has lapsed or a subscription has been cancelled. */
  entitled: boolean;
  trialing: boolean;
  trialDaysLeft: number | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  hasStripeCustomer: boolean;
  billingEnabled: boolean;
}

/**
 * Resolves what an organisation is currently entitled to.
 *
 * When billing is not configured at all, every workspace is entitled — that is
 * the self-hosted case, and gating a self-hosted install behind a payment
 * processor nobody set up would be nonsense.
 */
export async function getSubscription(orgId: string): Promise<SubscriptionState> {
  const org = await db.organization.findUnique({ where: { id: orgId } });

  const plan = ((org?.plan ?? 'starter') in PLANS ? org!.plan : 'starter') as PlanId;
  const status = org?.subscriptionStatus ?? 'trialing';
  const trialEndsAt = org?.trialEndsAt ?? null;

  const trialing = status === 'trialing';
  const trialExpired = trialing && !!trialEndsAt && trialEndsAt.getTime() < Date.now();

  const trialDaysLeft =
    trialing && trialEndsAt
      ? Math.max(0, Math.ceil((trialEndsAt.getTime() - Date.now()) / 86_400_000))
      : null;

  return {
    plan,
    status,
    entitled: !billingEnabled() || (ENTITLED.has(status) && !trialExpired),
    trialing,
    trialDaysLeft,
    currentPeriodEnd: org?.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: org?.cancelAtPeriodEnd ?? false,
    hasStripeCustomer: Boolean(org?.stripeCustomerId),
    billingEnabled: billingEnabled(),
  };
}

/** Finds or creates the Stripe customer for an organisation. */
export async function ensureCustomer(orgId: string, email: string, name: string): Promise<string> {
  const org = await db.organization.findUnique({ where: { id: orgId } });
  if (!org) throw new Error('Organization not found.');
  if (org.stripeCustomerId) return org.stripeCustomerId;

  const customer = await stripe().customers.create({
    email,
    name: org.name || name,
    // Lets the webhook find the workspace even if our own lookup fails.
    metadata: { orgId },
  });

  await db.organization.update({
    where: { id: orgId },
    data: { stripeCustomerId: customer.id },
  });

  return customer.id;
}

/**
 * Applies a Stripe subscription to the organisation record.
 * This is the only path that may change a workspace's plan.
 */
export async function syncSubscription(subscription: Stripe.Subscription): Promise<void> {
  const customerId =
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;

  const org =
    (await db.organization.findFirst({ where: { stripeCustomerId: customerId } })) ??
    (subscription.metadata?.orgId
      ? await db.organization.findUnique({ where: { id: subscription.metadata.orgId } })
      : null);

  if (!org) {
    console.error(`billing: no organization for Stripe customer ${customerId}`);
    return;
  }

  const item = subscription.items.data[0];
  const priceId = item?.price?.id ?? '';
  const plan = planForPriceId(priceId);

  // An unmapped price means the environment and the Stripe account disagree.
  // Keep the existing plan rather than silently downgrading a paying customer.
  if (priceId && !plan) {
    console.error(`billing: price ${priceId} is not mapped to a plan; keeping ${org.plan}`);
  }

  const periodEnd = item?.current_period_end ?? null;

  await db.organization.update({
    where: { id: org.id },
    data: {
      plan: plan ?? org.plan,
      stripeSubscriptionId: subscription.id,
      subscriptionStatus: subscription.status,
      currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
      trialEndsAt: subscription.trial_end ? new Date(subscription.trial_end * 1000) : org.trialEndsAt,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
  });
}

/** Marks a workspace as no longer subscribed. Entitlements fall away with it. */
export async function markCancelled(subscription: Stripe.Subscription): Promise<void> {
  const customerId =
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;

  const org = await db.organization.findFirst({ where: { stripeCustomerId: customerId } });
  if (!org) return;

  await db.organization.update({
    where: { id: org.id },
    data: {
      subscriptionStatus: 'canceled',
      stripeSubscriptionId: null,
      cancelAtPeriodEnd: false,
    },
  });
}

/** Starts the trial clock for a brand-new workspace. */
export async function startTrial(orgId: string): Promise<void> {
  await db.organization.update({
    where: { id: orgId },
    data: {
      subscriptionStatus: 'trialing',
      trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 86_400_000),
    },
  });
}

/** Human-readable label for a subscription status. */
export function statusLabel(state: SubscriptionState): string {
  if (!state.billingEnabled) return 'Self-hosted';
  if (state.status === 'trialing') {
    return state.trialDaysLeft === null
      ? 'Trial'
      : state.trialDaysLeft === 0
        ? 'Trial ended'
        : `Trial · ${state.trialDaysLeft} day${state.trialDaysLeft === 1 ? '' : 's'} left`;
  }
  if (state.status === 'active') return state.cancelAtPeriodEnd ? 'Cancels at period end' : 'Active';
  if (state.status === 'past_due') return 'Payment failed';
  if (state.status === 'canceled') return 'Cancelled';
  return state.status;
}
