import { describe, expect, it } from 'vitest';
import {
  PAST_DUE_GRACE_DAYS,
  planForPriceId,
  priceIdFor,
  statusLabel,
  withinPastDueGrace,
  type SubscriptionState,
} from '@/lib/billing';

const state = (over: Partial<SubscriptionState> = {}): SubscriptionState => ({
  plan: 'growth', status: 'active', entitled: true, trialing: false,
  trialDaysLeft: null, currentPeriodEnd: null, cancelAtPeriodEnd: false,
  hasStripeCustomer: true, billingEnabled: true,
  pastDueSince: null, inPastDueGrace: false, ...over,
});

describe('priceIdFor / planForPriceId', () => {
  it('reads the price id from the environment per plan and interval', () => {
    process.env.STRIPE_PRICE_GROWTH_MONTHLY = 'price_growth_m';
    process.env.STRIPE_PRICE_GROWTH_ANNUAL = 'price_growth_y';
    expect(priceIdFor('growth', 'month')).toBe('price_growth_m');
    expect(priceIdFor('growth', 'year')).toBe('price_growth_y');
  });

  it('returns null when a price is not configured', () => {
    delete process.env.STRIPE_PRICE_SCALE_MONTHLY;
    expect(priceIdFor('scale', 'month')).toBeNull();
  });

  it('maps a price id back to its plan in both intervals', () => {
    process.env.STRIPE_PRICE_STARTER_MONTHLY = 'price_starter_m';
    process.env.STRIPE_PRICE_STARTER_ANNUAL = 'price_starter_y';
    expect(planForPriceId('price_starter_m')).toBe('starter');
    expect(planForPriceId('price_starter_y')).toBe('starter');
  });

  it('returns null for an unknown price rather than guessing a plan', () => {
    // Guessing here would silently move a customer between tiers.
    expect(planForPriceId('price_not_ours')).toBeNull();
  });
});

describe('statusLabel', () => {
  it('names the self-hosted case', () => {
    expect(statusLabel(state({ billingEnabled: false }))).toBe('Self-hosted');
  });

  it('counts down a trial and singularises the last day', () => {
    expect(statusLabel(state({ status: 'trialing', trialing: true, trialDaysLeft: 9 }))).toBe('Trial · 9 days left');
    expect(statusLabel(state({ status: 'trialing', trialing: true, trialDaysLeft: 1 }))).toBe('Trial · 1 day left');
  });

  it('says a trial has ended at zero days', () => {
    expect(statusLabel(state({ status: 'trialing', trialing: true, trialDaysLeft: 0 }))).toBe('Trial ended');
  });

  it('distinguishes active from cancelling', () => {
    expect(statusLabel(state())).toBe('Active');
    expect(statusLabel(state({ cancelAtPeriodEnd: true }))).toBe('Cancels at period end');
  });

  it('surfaces a failed payment plainly', () => {
    expect(statusLabel(state({ status: 'past_due' }))).toBe('Payment failed');
    expect(statusLabel(state({ status: 'canceled' }))).toBe('Cancelled');
  });
});

/**
 * Phase 2: a failed payment opens a bounded grace window rather than
 * indefinite full access.
 *
 * `past_due` used to sit in the entitled set outright, so a card that stopped
 * working in January still bought unlimited provider calls in June. Removing it
 * entirely would be the opposite error — Stripe reports `past_due` for a card
 * that will retry successfully within hours, and cutting off a paying customer
 * over a transient decline is its own kind of wrong.
 */
describe('past-due grace window', () => {
  it('keeps a just-failed payment working', () => {
    expect(withinPastDueGrace(new Date(Date.now() - 60_000))).toBe(true);
  });

  it('keeps working up to the boundary', () => {
    const almost = new Date(Date.now() - (PAST_DUE_GRACE_DAYS * 86_400_000 - 60_000));
    expect(withinPastDueGrace(almost)).toBe(true);
  });

  it('stops once the window is spent', () => {
    const expired = new Date(Date.now() - (PAST_DUE_GRACE_DAYS * 86_400_000 + 60_000));
    expect(withinPastDueGrace(expired)).toBe(false);
  });

  it('grants grace when the start was never stamped', () => {
    // A bookkeeping gap on our side must not cost the customer access.
    expect(withinPastDueGrace(null)).toBe(true);
    expect(withinPastDueGrace(undefined)).toBe(true);
  });

  it('is a bounded window, not an open door', () => {
    expect(PAST_DUE_GRACE_DAYS).toBeGreaterThan(0);
    expect(PAST_DUE_GRACE_DAYS).toBeLessThanOrEqual(14);
  });
});
