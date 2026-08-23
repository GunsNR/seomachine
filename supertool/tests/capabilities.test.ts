import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CAPABILITIES,
  CAPABILITY_IDS,
  SELLABLE_STATUSES,
  isSellable,
  planFeatureLabel,
} from '@/lib/capabilities';
import { PRICING, PRICING_DISCLOSURE } from '@/content/site';

const AUDIT_DOC = resolve(__dirname, '../../docs/release-truth-audit.md');

describe('capability registry', () => {
  it('gives every capability a status, a source and an evidence field', () => {
    for (const id of CAPABILITY_IDS) {
      const c = CAPABILITIES[id];
      expect(c.status, id).toBeTruthy();
      expect(c.source.length, id).toBeGreaterThan(10);
      expect(c.evidence.length, id).toBeGreaterThan(3);
      expect(c.externalValidation.length, id).toBeGreaterThan(10);
      expect(c.marketingLanguage.length, id).toBeGreaterThan(10);
      expect(c.owner, id).toBeTruthy();
      expect(c.lastVerified, id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('treats only verified and beta as sellable', () => {
    expect([...SELLABLE_STATUSES].sort()).toEqual(['beta', 'verified']);
    expect(isSellable('site_audit')).toBe(true);
    expect(isSellable('rank_tracking')).toBe(false);
    expect(isSellable('white_label_reporting')).toBe(false);
  });

  it('states plainly that unavailable and planned capabilities are not available', () => {
    for (const id of CAPABILITY_IDS) {
      const c = CAPABILITIES[id];
      if (c.status === 'unavailable' || c.status === 'planned' || c.status === 'demo_only') {
        expect(c.marketingLanguage.toLowerCase(), id).toMatch(/not (available|sold)/);
      }
    }
  });

  it('refuses to render a plan label for anything not sellable', () => {
    expect(() => planFeatureLabel('rank_tracking')).toThrow(/rank_tracking/);
    expect(() => planFeatureLabel('backlink_tracking')).toThrow();
    expect(() => planFeatureLabel('content_generation')).toThrow();
    expect(() => planFeatureLabel('teams_rbac')).toThrow();
    expect(() => planFeatureLabel('byo_provider_keys')).toThrow();
    expect(() => planFeatureLabel('google_ai_mode')).toThrow();
    expect(planFeatureLabel('site_audit')).toBe(CAPABILITIES.site_audit.label);
  });

  it('records the withdrawn capabilities that used to be advertised', () => {
    // Each of these appeared in the pricing table or a feature page before the
    // Gate 0 pass. They must stay in the registry, marked, so that removing
    // them from the copy cannot be quietly undone.
    const withdrawn = [
      'rank_tracking', 'backlink_tracking', 'content_generation',
      'google_search_console', 'google_analytics', 'local_device_tracking',
      'approval_workflow', 'teams_rbac', 'white_label_reporting',
      'byo_provider_keys', 'google_ai_mode',
    ] as const;
    for (const id of withdrawn) {
      expect(isSellable(id), `${id} must not be sellable`).toBe(false);
    }
  });
});

describe('pricing is generated from the registry', () => {
  it('lists only sellable capabilities on every plan', () => {
    for (const plan of PRICING) {
      for (const id of plan.capabilities) {
        expect(isSellable(id), `${plan.name} lists ${id}`).toBe(true);
      }
    }
  });

  it('renders every plan feature label without throwing', () => {
    for (const plan of PRICING) {
      for (const id of plan.capabilities) {
        expect(planFeatureLabel(id)).toBeTruthy();
      }
    }
  });

  it('states what no plan includes', () => {
    const text = PRICING_DISCLOSURE.join(' ').toLowerCase();
    for (const term of ['position tracking', 'backlink', 'white-label', 'google ai mode']) {
      expect(text, term).toContain(term);
    }
  });

  it('never sells a capability by name in a plan limit string', () => {
    // Limits are quotas only. A limit like "White-label reporting" would slip
    // an unshippable feature past the registry check above.
    const banned = /white.label|backlink|rank track|search console|ga4|seat|bring your own|content generation/i;
    for (const plan of PRICING) {
      for (const limit of plan.limits) {
        expect(banned.test(limit), `${plan.name}: ${limit}`).toBe(false);
      }
    }
  });
});

describe('docs/release-truth-audit.md agrees with the registry', () => {
  const doc = readFileSync(AUDIT_DOC, 'utf8');

  it('documents every capability', () => {
    for (const id of CAPABILITY_IDS) {
      expect(doc, id).toContain(`\`${id}\``);
    }
  });

  it('records the same status the code enforces', () => {
    for (const id of CAPABILITY_IDS) {
      const row = doc.split('\n').find((line) => line.includes(`\`${id}\``));
      expect(row, id).toBeTruthy();
      expect(row, id).toContain(CAPABILITIES[id].status);
    }
  });
});
