import { NextResponse } from 'next/server';
import { billingEnabled, stripe } from '@/lib/billing';
import { db } from '@/lib/db';
import { fail, withSession } from '@/lib/route-helpers';
import { brand } from '../../../../../brand.config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Opens the Stripe customer portal, where the customer manages payment
 * methods, invoices, plan changes and cancellation. Delegating this to Stripe
 * avoids rebuilding — and having to keep compliant — a billing UI.
 */
export const POST = withSession(null, async ({ session }) => {
  if (!billingEnabled()) {
    return fail('Billing is not configured on this deployment.', 501);
  }

  const org = await db.organization.findUnique({ where: { id: session.orgId } });
  if (!org?.stripeCustomerId) {
    return fail('No billing account yet. Choose a plan first.', 409);
  }

  const base = (process.env.NEXT_PUBLIC_SITE_URL || brand.url).replace(/\/$/, '');

  const portal = await stripe().billingPortal.sessions.create({
    customer: org.stripeCustomerId,
    return_url: `${base}/app/billing`,
  });

  return NextResponse.json({ ok: true, url: portal.url });
});
