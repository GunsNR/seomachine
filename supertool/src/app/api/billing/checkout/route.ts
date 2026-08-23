import { NextResponse } from 'next/server';
import { z } from 'zod';
import { billingEnabled, ensureCustomer, priceIdFor, stripe, TRIAL_DAYS } from '@/lib/billing';
import { db } from '@/lib/db';
import { PLANS, type PlanId } from '@/lib/plan';
import { fail, withSession } from '@/lib/route-helpers';
import { brand } from '../../../../../brand.config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  plan: z.enum(Object.keys(PLANS) as [PlanId, ...PlanId[]]),
  interval: z.enum(['month', 'year']).default('month'),
});

/** Creates a Stripe Checkout session for the chosen plan. */
export const POST = withSession(Body, async ({ session, body }) => {
  if (!billingEnabled()) {
    return fail('Billing is not configured on this deployment.', 501);
  }

  const priceId = priceIdFor(body.plan, body.interval);
  if (!priceId) {
    return fail(
      `No Stripe price is configured for the ${PLANS[body.plan].label} plan billed ${body.interval}ly.`,
      501,
    );
  }

  const [org, user] = await Promise.all([
    db.organization.findUnique({ where: { id: session.orgId } }),
    db.user.findUnique({ where: { id: session.id } }),
  ]);
  if (!org || !user) return fail('Account not found.', 404);

  const customerId = await ensureCustomer(session.orgId, user.email, user.name);
  const base = (process.env.NEXT_PUBLIC_SITE_URL || brand.url).replace(/\/$/, '');

  // Only offer a trial to a workspace that has never had one.
  const eligibleForTrial = !org.stripeSubscriptionId && org.subscriptionStatus !== 'canceled';

  const checkout = await stripe().checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${base}/app/billing?checkout=success`,
    cancel_url: `${base}/app/billing?checkout=cancelled`,
    allow_promotion_codes: true,
    billing_address_collection: 'auto',
    // Carried through to the subscription so the webhook can resolve the
    // workspace even if the customer lookup ever fails.
    subscription_data: {
      metadata: { orgId: session.orgId },
      ...(eligibleForTrial ? { trial_period_days: TRIAL_DAYS } : {}),
    },
    metadata: { orgId: session.orgId, plan: body.plan },
  });

  if (!checkout.url) return fail('Stripe did not return a checkout URL.', 502);

  return NextResponse.json({ ok: true, url: checkout.url });
});
