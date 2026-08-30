// Deliberately NOT `server-only`: reached from the job worker through
// `plan.ts`, which runs outside a request. Like that module, this one imports
// the Prisma client and the Stripe SDK, so a client import fails at build time
// regardless of the marker.
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

/** Statuses under which the workspace keeps full access outright. */
const ENTITLED = new Set(['trialing', 'active']);

/**
 * How long a failed payment keeps working.
 *
 * `past_due` was previously in `ENTITLED`, so a subscription whose payment
 * failed retained full access indefinitely — a card that stopped working in
 * January still bought unlimited provider calls in June. Removing it outright
 * would be the opposite error: Stripe reports `past_due` for a card that will
 * retry successfully in a few hours, and cutting a paying customer off over a
 * transient decline is its own kind of wrong.
 *
 * So a failed payment opens a bounded grace window instead. Inside it, nothing
 * changes. Outside it, resource-consuming actions stop while reads and exports
 * stay open, exactly as for any other unentitled state.
 */
export const PAST_DUE_GRACE_DAYS = 7;

/** True while a past-due subscription is still inside its grace window. */
export function withinPastDueGrace(
  pastDueSince: Date | null | undefined,
  now = new Date(),
): boolean {
  // No recorded start means the webhook has not stamped it yet. Treat the
  // grace period as running rather than already spent: the customer should not
  // lose access because of our bookkeeping gap.
  if (!pastDueSince) return true;
  return now.getTime() - pastDueSince.getTime() < PAST_DUE_GRACE_DAYS * 86_400_000;
}

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
  /** First moment Stripe reported a failed payment, if it has. */
  pastDueSince: Date | null;
  /** True while a failed payment is still inside its grace window. */
  inPastDueGrace: boolean;
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

  const inPastDueGrace = status === 'past_due' && withinPastDueGrace(org?.pastDueSince ?? null);

  const trialDaysLeft =
    trialing && trialEndsAt
      ? Math.max(0, Math.ceil((trialEndsAt.getTime() - Date.now()) / 86_400_000))
      : null;

  return {
    plan,
    status,
    entitled:
      !billingEnabled() || ((ENTITLED.has(status) && !trialExpired) || inPastDueGrace),
    pastDueSince: org?.pastDueSince ?? null,
    inPastDueGrace,
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

  // Stamp the first past-due transition and clear it on recovery, so the grace
  // window measures from the failure rather than from whenever we last looked.
  // Re-entering past_due after a successful payment starts a fresh window.
  const becamePastDue = subscription.status === 'past_due';
  const pastDueSince = becamePastDue ? (org.pastDueSince ?? new Date()) : null;

  await db.organization.update({
    where: { id: org.id },
    data: {
      plan: plan ?? org.plan,
      stripeSubscriptionId: subscription.id,
      subscriptionStatus: subscription.status,
      currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
      trialEndsAt: subscription.trial_end ? new Date(subscription.trial_end * 1000) : org.trialEndsAt,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      pastDueSince,
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
