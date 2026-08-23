import { describe, expect, it } from 'vitest';
import { planForPriceId, priceIdFor, statusLabel, type SubscriptionState } from '@/lib/billing';

const state = (over: Partial<SubscriptionState> = {}): SubscriptionState => ({
  plan: 'growth', status: 'active', entitled: true, trialing: false,
  trialDaysLeft: null, currentPeriodEnd: null, cancelAtPeriodEnd: false,
  hasStripeCustomer: true, billingEnabled: true, ...over,
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
