import { CAPABILITY_IDS, CAPABILITIES, isSellable, type CapabilityId } from './capabilities';

/**
 * The delivery roadmap, as data rather than prose.
 *
 * docs/master-roadmap.md is the readable version of this file. This is the
 * enforceable one.
 *
 * The reason the roadmap lives in code at all is a specific failure mode. A
 * roadmap written only in Markdown drifts away from the product in one
 * direction almost every time: the document starts describing intended work in
 * the present tense, and eventually someone reads a roadmap row as a statement
 * of what ships today. Gate 0 removed exactly that class of claim from the
 * marketing surface. Phase 0 makes it structurally hard to reintroduce through
 * a planning document instead.
 *
 * The binding rule, enforced by `tests/constitution.test.ts`:
 *
 *   A capability may be sellable ONLY if the phase that delivers it is
 *   complete. Listing a capability in a future phase can never make it
 *   sellable — it is evidence the capability is NOT ready.
 *
 * So the roadmap cannot be used to talk a feature into existence. Moving a
 * phase to `complete` is the only way to unlock a sellable capability, and that
 * move is itself gated on the phase's acceptance criteria and on the capability
 * registry's own evidence requirements.
 */

export type PhaseState = 'complete' | 'in-progress' | 'not-started';

export type PhaseId =
  | 'foundation'
  | 'phase-0'
  | 'phase-1'
  | 'phase-2'
  | 'phase-3'
  | 'phase-4'
  | 'phase-5'
  | 'phase-6'
  | 'phase-7'
  | 'phase-8'
  | 'phase-9';

export interface Phase {
  id: PhaseId;
  /** Short name used in the roadmap document and in reports. */
  title: string;
  state: PhaseState;
  /** Phases that must be complete before this one can be. */
  dependsOn: readonly PhaseId[];
  /**
   * Capabilities this phase first makes real.
   *
   * Every capability in the registry belongs to exactly one phase. A
   * capability sitting in a non-complete phase is a promise, not a product.
   *
   * This is delivery, not final status. A capability delivered by the
   * foundation at `beta` may still be waiting on a later phase to earn
   * `verified` — WordPress publishing is delivered and sold today, and Phase 3
   * is what validates it against a real installation. The phase that delivers
   * a capability is the one that had to exist for it to be sellable at all.
   */
  delivers: readonly CapabilityId[];
  /** What must be true before this phase may be marked complete. */
  acceptanceCriteria: readonly string[];
  /**
   * Things this phase cannot finish without something only the product owner
   * can supply — credentials, money, a legal review, a real customer.
   * Empty means the phase is entirely executable in-repo.
   */
  externallyBlocked: readonly string[];
}

const PHASES: readonly Phase[] = [
  {
    id: 'foundation',
    title: 'Truth Gate 0 and Measurement Gate 1',
    state: 'complete',
    dependsOn: [],
    delivers: [
      // Everything already shippable, plus the capabilities Gate 0 and Gate 1
      // deliberately withdrew. A withdrawn capability belongs here rather than
      // in a future phase: the decision that it is not sellable has already
      // been made and tested, and a later phase would imply it is merely
      // waiting its turn.
      'site_audit',
      'geo_scoring',
      'content_briefs',
      'keyword_research',
      'csv_export',
      'measurement_foundation',
      'scheduled_runs',
      'wordpress_publishing',
      'elementor_widgets',
      'public_api',
      'billing',
      'transactional_email',
      'lead_attribution',
      'google_ai_mode',
    ],
    acceptanceCriteria: [
      'No live failure is ever replaced with simulated output.',
      'Simulation appears only in demo mode and is labelled at row, run, API, export and UI level.',
      'Every capability in the registry carries source, evidence and external-validation fields.',
      'Public marketing sells nothing the registry marks non-sellable.',
      'AI visibility is stored as immutable MeasurementRun and Observation records.',
      'Failed and unavailable observations are excluded from rate denominators and reported as coverage.',
    ],
    externallyBlocked: [],
  },
  {
    id: 'phase-0',
    title: 'Product constitution and executable blueprint',
    state: 'in-progress',
    dependsOn: ['foundation'],
    delivers: [],
    acceptanceCriteria: [
      'One unambiguous product constitution exists in the repository.',
      'Current, target and planned capabilities are mapped against the real source tree.',
      'The roadmap is dependency-aware and carries acceptance criteria per phase.',
      'A competitive scorecard and its evidence rules exist.',
      'A data-provider and legal-review strategy exists.',
      'A UX system and research plan exist.',
      'Continuous-improvement governance is written down.',
      'No public claim changed merely because it appears in the target roadmap.',
      'CI remains green, including every Gate 0 and Gate 1 truth and measurement check.',
    ],
    externallyBlocked: [],
  },
  {
    id: 'phase-1',
    title: 'Grounded provider activation',
    state: 'not-started',
    dependsOn: ['phase-0'],
    delivers: ['ai_visibility_tracking', 'citation_monitoring', 'competitor_share_of_voice'],
    acceptanceCriteria: [
      'Each available engine has a grounded retrieval path taken from that vendor’s current official documentation.',
      'Documentation verification cites a first-party vendor URL and a retrieval date.',
      'Stored observations carry provider, model, tool, prompt version, locale, timing, usage, cost, sources and provenance.',
      'No silent fallback exists on any path.',
      'A real credentialed call has succeeded and is recorded as repeatable evidence.',
      'Engines that fail any check stay unavailable with a published reason.',
    ],
    externallyBlocked: [
      'Provider API credentials (OpenAI, Anthropic, Google, Perplexity, xAI) — none are configured.',
      'Network egress to official vendor documentation domains, which this build environment blocks.',
      'Per-call provider spend for live contract tests and canaries.',
      'Legal review of each provider’s terms for storage and redistribution of returned content.',
    ],
  },
  {
    id: 'phase-2',
    title: 'Production data, jobs, tenancy and security',
    state: 'not-started',
    dependsOn: ['phase-1'],
    delivers: ['teams_rbac', 'byo_provider_keys'],
    acceptanceCriteria: [
      'PostgreSQL with reviewed migrations replaces SQLite and `prisma db push`.',
      'A migration runs cleanly against a representative copy of real data.',
      'Restoration and rollback or forward-fix have been rehearsed.',
      'Runs are durable and resumable through a real job system.',
      'Tenant and role boundaries are enforced and covered by regression tests.',
      'SSRF protection resolves DNS and defends against redirects and rebinding.',
      'API keys carry scopes, quotas and a rotation flow.',
      'CORS is explicit rather than wildcard on /api/v1.',
      'Billing entitlements are correct for trialing, active, past-due, canceled and misconfigured states.',
    ],
    externallyBlocked: [
      'A hosted PostgreSQL instance.',
      'A representative data copy to rehearse migration against.',
    ],
  },
  {
    id: 'phase-3',
    title: 'First-party integrations and verified publishing',
    state: 'not-started',
    dependsOn: ['phase-2'],
    delivers: ['google_search_console', 'google_analytics'],
    acceptanceCriteria: [
      'Search Console, GA4 and Business Profile connect through real authorization flows where permitted.',
      'Source freshness and disconnection states are visible in the product.',
      'WordPress and Elementor workflows are exercised against a real installation in supported versions.',
      'Publishing, revision and rollback are demonstrated end to end.',
      'No capability status is upgraded without external evidence attached to the registry row.',
    ],
    externallyBlocked: [
      'Google Cloud project, OAuth client and consent screen.',
      'A real WordPress installation with Elementor for verification.',
      'Stripe test-mode account.',
      'A transactional email provider account and verified sending domain.',
    ],
  },
  {
    id: 'phase-4',
    title: 'Core classic SEO intelligence',
    state: 'not-started',
    dependsOn: ['phase-3'],
    delivers: ['rank_tracking', 'backlink_tracking', 'local_device_tracking'],
    acceptanceCriteria: [
      'Provider-independent contracts exist for keyword, SERP, rank, backlink, competitor and crawl data.',
      'Measured data replaces every seeded or modelled placeholder on these surfaces.',
      'Every metric is attributable to a provider and legally usable under that provider’s terms.',
      'Scheduled tracking and alerts run reliably.',
      'Technical crawl findings reproduce across runs.',
    ],
    externallyBlocked: [
      'Licensed SERP, rank and backlink data provider contracts.',
      'Recurring provider spend and a documented unit-cost model.',
      'Legal review of storage and redistribution rights per provider.',
    ],
  },
  {
    id: 'phase-5',
    title: 'Action-first product and original design system',
    state: 'not-started',
    dependsOn: ['phase-4'],
    delivers: [],
    acceptanceCriteria: [
      'The information architecture is rebuilt around a single cross-module Action Center.',
      'The five priority workflows reach at least 90% unassisted completion with representative users.',
      'Mobile approval and reporting are first-class.',
      'WCAG 2.2 AA is met on priority pages.',
      'p75 LCP ≤ 2.5s, INP ≤ 200ms and CLS ≤ 0.1 on priority pages, enforced in CI or observability.',
      'Loading, empty, partial, stale, estimated, insufficient-evidence, failed, unavailable, demo and permission-denied states are all designed.',
      'No fabricated proof appears anywhere in the marketing system.',
    ],
    externallyBlocked: [
      'Access to representative users for moderated usability testing.',
    ],
  },
  {
    id: 'phase-6',
    title: 'Content, approval and execution engine',
    state: 'not-started',
    dependsOn: ['phase-5'],
    delivers: ['content_generation', 'approval_workflow'],
    acceptanceCriteria: [
      'Research, gaps, briefs, drafting, technical fixes, internal links and schema connect into one action chain.',
      'Action provenance and change history are preserved for every executed action.',
      'Preview and rollback are safe and demonstrated.',
      'Fact and policy checks run before publication.',
      'No autonomous mass publishing of low-value pages is possible.',
      'Outcomes link back to the action that caused them without asserting causation.',
    ],
    externallyBlocked: [],
  },
  {
    id: 'phase-7',
    title: 'Local, agency, reporting, API and SaaS controls',
    state: 'not-started',
    dependsOn: ['phase-6'],
    delivers: ['white_label_reporting'],
    acceptanceCriteria: [
      'A real agency portfolio workflow passes end to end.',
      'Client views reveal only authorized information.',
      'Entitlements and quotas behave correctly under failure states.',
      'Reports are reproducible from stored data.',
      'Unit economics and provider costs are observable per organization.',
    ],
    externallyBlocked: [
      'Google Business Profile API access approval.',
      'A white-label domain and certificate strategy.',
    ],
  },
  {
    id: 'phase-8',
    title: 'Pilot evidence and calibration',
    state: 'not-started',
    dependsOn: ['phase-7'],
    delivers: [],
    acceptanceCriteria: [
      'At least five representative real customers or projects use the product. Demos do not count.',
      'Onboarding, the weekly workflow, publishing and reporting are used in reality.',
      'Measurement noise and data quality are documented from real runs.',
      'Recommendation precision and false-positive rate are reviewed against outcomes.',
      'Usability failures found in pilot are fixed.',
      'Real outcomes are documented with written permission before any public use.',
      'Pricing and packaging are informed by observed usage and cost.',
    ],
    externallyBlocked: [
      'Five real customers or client projects willing to pilot.',
      'Written permission before any customer outcome becomes a public claim.',
    ],
  },
  {
    id: 'phase-9',
    title: 'Controlled improvement plane and launch hardening',
    state: 'not-started',
    dependsOn: ['phase-8'],
    delivers: [],
    acceptanceCriteria: [
      'Improvement proposals are ranked by evidence, not enthusiasm.',
      'Model and provider changes pass shadow evaluation and canary release before general availability.',
      'No system can self-deploy to production.',
      'Marketing claims are generated from verified capability evidence.',
      'Launch checklist, support process, rollback and incident drills all pass.',
    ],
    externallyBlocked: [
      'Production hosting, monitoring and error-tracking accounts.',
      'An on-call and incident-response commitment.',
    ],
  },
] as const;

export const ROADMAP: readonly Phase[] = PHASES;

export const PHASE_IDS: readonly PhaseId[] = PHASES.map((p) => p.id);

export function getPhase(id: PhaseId): Phase | undefined {
  return PHASES.find((p) => p.id === id);
}

export function phasesByState(state: PhaseState): readonly Phase[] {
  return PHASES.filter((p) => p.state === state);
}

/** The phase responsible for a capability, or undefined if none claims it. */
export function phaseFor(id: CapabilityId): Phase | undefined {
  return PHASES.find((p) => p.delivers.includes(id));
}

/**
 * Capabilities whose status contradicts their phase.
 *
 * A non-empty result means the roadmap and the product disagree about what
 * ships today — the exact drift Phase 0 exists to prevent. Returned as data so
 * both the test suite and a human reading the report see the same list.
 */
export function claimsAheadOfDelivery(): Array<{
  capability: CapabilityId;
  status: string;
  phase: PhaseId | null;
  phaseState: PhaseState | null;
}> {
  return CAPABILITY_IDS.filter((id) => isSellable(id))
    .map((id) => {
      const phase = phaseFor(id);
      return {
        capability: id,
        status: CAPABILITIES[id].status,
        phase: phase?.id ?? null,
        phaseState: phase?.state ?? null,
      };
    })
    .filter((row) => row.phaseState !== 'complete');
}

/** Every capability not yet claimed by any phase. */
export function unassignedCapabilities(): CapabilityId[] {
  return CAPABILITY_IDS.filter((id) => !phaseFor(id));
}

/** Phases marked complete while something they depend on is not. */
export function brokenDependencies(): Array<{ phase: PhaseId; unmet: PhaseId }> {
  const out: Array<{ phase: PhaseId; unmet: PhaseId }> = [];
  for (const p of PHASES) {
    if (p.state !== 'complete') continue;
    for (const dep of p.dependsOn) {
      const d = getPhase(dep);
      if (!d || d.state !== 'complete') out.push({ phase: p.id, unmet: dep });
    }
  }
  return out;
}

/** Everything the product owner must supply, grouped by the phase that needs it. */
export function externalBlockers(): Array<{ phase: PhaseId; title: string; blockers: readonly string[] }> {
  return PHASES.filter((p) => p.externallyBlocked.length > 0).map((p) => ({
    phase: p.id,
    title: p.title,
    blockers: p.externallyBlocked,
  }));
}
