import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { billingEnabled, markCancelled, stripe, syncSubscription } from '@/lib/billing';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Stripe webhook — the only path that may change a workspace's plan.
 *
 * The raw body is required for signature verification, so it is read as text
 * before any parsing. Events are recorded by id and re-delivered events are
 * acknowledged without being applied twice.
 */
export async function POST(req: Request) {
  if (!billingEnabled()) {
    return NextResponse.json({ error: 'Billing is not configured.' }, { status: 501 });
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    // Without the signing secret we cannot tell a real event from a forged
    // one, and acting on a forged event would hand out entitlements.
    return NextResponse.json(
      { error: 'STRIPE_WEBHOOK_SECRET is not configured.' },
      { status: 501 },
    );
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header.' }, { status: 400 });
  }

  const raw = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(raw, signature, secret);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Signature verification failed.';
    return NextResponse.json({ error: `Invalid signature: ${message}` }, { status: 400 });
  }

  // Stripe retries on any non-2xx, so a duplicate is expected, not exceptional.
  const seen = await db.processedWebhookEvent.findUnique({ where: { id: event.id } });
  if (seen) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const checkout = event.data.object as Stripe.Checkout.Session;
        if (checkout.subscription) {
          const id =
            typeof checkout.subscription === 'string'
              ? checkout.subscription
              : checkout.subscription.id;
          await syncSubscription(await stripe().subscriptions.retrieve(id));
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.trial_will_end':
        await syncSubscription(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.deleted':
        await markCancelled(event.data.object as Stripe.Subscription);
        break;

      case 'invoice.payment_failed':
      case 'invoice.paid': {
        // Re-read the subscription rather than trusting the invoice's copy of
        // the status, which can lag.
        const invoice = event.data.object as Stripe.Invoice & { subscription?: string | Stripe.Subscription };
        const sub = invoice.subscription;
        if (sub) {
          const id = typeof sub === 'string' ? sub : sub.id;
          await syncSubscription(await stripe().subscriptions.retrieve(id));
        }
        break;
      }

      default:
        // Unhandled types are acknowledged so Stripe stops retrying them.
        break;
    }

    await db.processedWebhookEvent.create({ data: { id: event.id, type: event.type } });
    return NextResponse.json({ received: true });
  } catch (err) {
    // Return 500 so Stripe retries; the event is not recorded as processed.
    console.error(`billing: failed to handle ${event.type} (${event.id})`, err);
    return NextResponse.json({ error: 'Failed to process event.' }, { status: 500 });
  }
}
