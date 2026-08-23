import { redirect } from 'next/navigation';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { PageHeader, Panel, StatTile } from '@/components/app/ui';
import { getSession } from '@/lib/auth';
import { priceIdFor, statusLabel } from '@/lib/billing';
import { PLANS, getEntitlements, type PlanId } from '@/lib/plan';
import { ManageBillingButton, PlanPicker } from './BillingActions';

export const dynamic = 'force-dynamic';

const TAGLINES: Record<PlanId, string> = {
  starter: 'For founders and single-site brands proving the channel.',
  growth: 'For marketing teams running content as a channel.',
  scale: 'For agencies and multi-brand portfolios.',
};

const PRICES: Record<PlanId, { monthly: number; annual: number }> = {
  starter: { monthly: 79, annual: 65 },
  growth: { monthly: 249, annual: 199 },
  scale: { monthly: 749, annual: 599 },
};

export default async function BillingPage({
  searchParams,
}: { searchParams: Promise<{ checkout?: string }> }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const { checkout } = await searchParams;
  const { plan, planId, subscription, usage } = await getEntitlements(session.orgId);

  // A plan is only selectable if a Stripe price exists for it.
  const configured = (Object.keys(PLANS) as PlanId[]).filter(
    (id) => priceIdFor(id, 'month') || priceIdFor(id, 'year'),
  );

  const planOptions = (configured.length ? configured : (Object.keys(PLANS) as PlanId[])).map((id) => ({
    id,
    label: PLANS[id].label,
    monthly: PRICES[id].monthly,
    annual: PRICES[id].annual,
    tagline: TAGLINES[id],
    current: id === planId,
    features: [
      PLANS[id].projects === Infinity
        ? 'Unlimited projects'
        : `${PLANS[id].projects} project${PLANS[id].projects === 1 ? '' : 's'}`,
      `${PLANS[id].prompts.toLocaleString()} tracked prompts`,
      `${PLANS[id].keywords.toLocaleString()} keywords`,
      `${PLANS[id].frequency} checks`,
      ...(PLANS[id].whiteLabel ? ['White-label reporting'] : []),
      ...(PLANS[id].apiAccess ? ['REST API access'] : []),
    ],
  }));

  return (
    <>
      <PageHeader
        title="Billing"
        sub="Your plan, usage and payment details."
        action={subscription.hasStripeCustomer ? <ManageBillingButton /> : undefined}
      />

      <div className="mt-6 space-y-6">
        {checkout === 'success' && (
          <p className="flex items-start gap-3 rounded-xl bg-ok/10 p-4 text-[0.9rem] text-ink ring-1 ring-ok/25">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-ok" aria-hidden="true" />
            <span>
              <strong className="font-semibold">Payment received.</strong> Stripe confirms
              subscriptions asynchronously, so if your plan below still looks unchanged, give it a
              few seconds and refresh.
            </span>
          </p>
        )}

        {checkout === 'cancelled' && (
          <p className="rounded-xl bg-surface-alt p-4 text-[0.9rem] text-body ring-1 ring-line">
            Checkout was cancelled. Nothing has been charged.
          </p>
        )}

        {!subscription.billingEnabled && (
          <p className="rounded-xl bg-brand-light p-4 text-[0.85rem] leading-relaxed text-ink ring-1 ring-brand/20">
            <strong className="font-semibold">Self-hosted mode.</strong> No Stripe keys are
            configured, so billing is disabled and every feature is unlocked. Set{' '}
            <code className="rounded bg-white px-1.5 py-0.5">STRIPE_SECRET_KEY</code> and the price
            ids to charge for this deployment.
          </p>
        )}

        {subscription.billingEnabled && !subscription.entitled && (
          <p className="flex items-start gap-3 rounded-xl bg-warn/10 p-4 text-[0.9rem] text-ink ring-1 ring-warn/30">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warn" aria-hidden="true" />
            <span>
              <strong className="font-semibold">
                {subscription.status === 'past_due' ? 'Your last payment failed.' : 'Your trial has ended.'}
              </strong>{' '}
              Your data is safe and you can still read and export everything. Running checks,
              crawls and publishing are paused until a plan is active.
            </span>
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile label="Plan" value={plan.label} sub={statusLabel(subscription)} />
          <StatTile
            label="Status"
            value={subscription.entitled ? 'Active' : 'Paused'}
            tone={subscription.entitled ? 'good' : 'warn'}
            sub={subscription.entitled ? 'All features available' : 'Reads and exports only'}
          />
          <StatTile
            label="Renews"
            value={
              subscription.currentPeriodEnd
                ? subscription.currentPeriodEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                : '—'
            }
            sub={subscription.cancelAtPeriodEnd ? 'Cancels on this date' : 'Next billing date'}
          />
          <StatTile
            label="Usage"
            value={`${usage.prompts}/${plan.prompts === Infinity ? '∞' : plan.prompts}`}
            sub="Tracked prompts"
          />
        </div>

        <Panel
          title={subscription.hasStripeCustomer ? 'Change plan' : 'Choose a plan'}
          sub={
            subscription.billingEnabled
              ? 'Checkout and invoices are handled by Stripe. Cancel any time from the billing portal.'
              : 'Prices shown for reference. Configure Stripe to enable checkout.'
          }
        >
          <div className="p-5">
            <PlanPicker plans={planOptions} disabled={!subscription.billingEnabled} />
            {subscription.billingEnabled && configured.length === 0 && (
              <p className="mt-5 rounded-lg bg-warn/10 p-3.5 text-[0.82rem] text-ink ring-1 ring-warn/25">
                Stripe is connected but no price ids are set, so checkout cannot start. Add
                <code className="mx-1 rounded bg-white px-1.5 py-0.5">STRIPE_PRICE_GROWTH_MONTHLY</code>
                and friends — the full list is in <code className="rounded bg-white px-1.5 py-0.5">.env.example</code>.
              </p>
            )}
          </div>
        </Panel>
      </div>
    </>
  );
}
