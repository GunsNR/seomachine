/**
 * The single source of truth for what SuperTool can actually do.
 *
 * Every customer-facing surface — pricing tables, plan feature lists, feature
 * pages, in-app empty states — reads from this registry rather than from prose
 * written by hand. That is the point: a capability cannot be advertised into
 * existence, because the copy is generated from the same record that says
 * whether the thing works.
 *
 * `status` is the gate:
 *   verified    Implemented, covered by automated tests, and exercised against
 *               the real external dependency it needs (or it has none).
 *   beta        Implemented and tested in-repo, but not yet validated against
 *               the live third-party system it depends on.
 *   demo_only   Exists and can be demonstrated with sample data, but must not
 *               be relied on as a measurement of anything real.
 *   unavailable Not usable today. Frequently a thing that was previously
 *               advertised and has now been withdrawn.
 *   planned     Intended, not started.
 *
 * Only `verified` and `beta` may appear in anything sold. `capabilities.test.ts`
 * enforces that, and enforces that this file and docs/release-truth-audit.md
 * agree with each other.
 */

export type CapabilityStatus = 'verified' | 'beta' | 'demo_only' | 'unavailable' | 'planned';

export interface Capability {
  id: string;
  /** Customer-facing name. Must not promise more than `status` supports. */
  label: string;
  status: CapabilityStatus;
  /** Where the numbers on this surface genuinely come from. */
  source: string;
  /** The automated test or check that backs `status`. */
  evidence: string;
  /** What has *not* been proven outside this repository. */
  externalValidation: string;
  /**
   * The strongest sentence marketing is permitted to use. Sellable
   * capabilities get a claim; everything else gets an explicit disclaimer,
   * which is what gets rendered if the id is referenced anywhere public.
   */
  marketingLanguage: string;
  owner: string;
  /** ISO date this row was last checked against the source code. */
  lastVerified: string;
}

/** Statuses that may appear in a plan's feature list or any public claim. */
export const SELLABLE_STATUSES: readonly CapabilityStatus[] = ['verified', 'beta'] as const;

const VERIFIED_ON = '2026-08-23';
const OWNER = 'product-owner';

const REGISTRY = {
  ai_visibility_tracking: {
    label: 'AI visibility tracking',
    status: 'unavailable',
    source:
      'Adapters exist for OpenAI, Anthropic, Google Gemini, Perplexity and xAI developer APIs, and Gate 1 added run-scoped observations, repeated sampling, coverage and confidence intervals. But the Gate 1 provider audit found that four of the five adapters make a plain completion call with no web-retrieval tool, and no adapter has had its model confirmed against the vendor’s current official documentation. Every surface is therefore marked unavailable and nothing is measured.',
    evidence:
      'tests/provider-audit.test.ts, tests/measurement-run.test.ts, tests/measurement-stats.test.ts',
    externalValidation:
      'None. No provider credential has been exercised, and official vendor documentation is unreachable from the build environment, so no model identifier could be verified against a primary source.',
    marketingLanguage:
      'Not available. The measurement pipeline is built and tested, but no answer engine currently meets the bar for a trustworthy measurement — see docs/release-truth-audit.md.',
  },
  citation_monitoring: {
    label: 'Citation monitoring',
    status: 'unavailable',
    source:
      'Citation URLs returned by a provider, plus URLs parsed out of the answer text. Blocked by the same audit as AI visibility tracking: an ungrounded adapter returns no citations at all, so a citation rate against it would be zero for reasons unrelated to the brand.',
    evidence: 'tests/ai.test.ts, tests/provider-audit.test.ts',
    externalValidation: 'Never validated against real provider citation payloads.',
    marketingLanguage:
      'Not available. Citation evidence requires a grounded answer engine, and none is currently connected.',
  },
  competitor_share_of_voice: {
    label: 'Competitor share of voice',
    status: 'unavailable',
    source: 'Prose mentions of each named competitor within observed answers, URLs excluded.',
    evidence: 'tests/ai.test.ts',
    externalValidation: 'Never validated against real answers.',
    marketingLanguage:
      'Not available. Depends on observed answers, and no answer engine is currently measurable.',
  },
  site_audit: {
    label: 'Site audit',
    status: 'verified',
    source: 'SuperTool crawls the URL you give it and applies a fixed rule set to what it fetches.',
    evidence: 'tests/crawler.integration.test.ts, tests/scoring.test.ts',
    externalValidation: 'None required — the audit reads only the site under test.',
    marketingLanguage:
      'Crawls your pages and reports technical, on-page, schema and answer-readiness issues with a fix for each.',
  },
  geo_scoring: {
    label: 'Answer-readiness scoring',
    status: 'beta',
    source:
      'A nine-signal heuristic over the page text. The weights were chosen by hand and have never been tested against whether a page later earned a citation.',
    evidence: 'tests/scoring.test.ts',
    externalValidation:
      'No held-out dataset, no outcome data. The score is not known to predict anything.',
    marketingLanguage:
      'Grades a draft against nine structural signals and names what to change. It is a modelled, experimental heuristic with hand-chosen weights — not a validated prediction of citations, and not recalibrated by Gate 1.',
  },
  content_briefs: {
    label: 'Content briefs',
    status: 'beta',
    source: 'Generated from the project keyword set and the prompt set.',
    evidence: 'tests/brief.test.ts',
    externalValidation: 'Briefs are not benchmarked against live SERP data — no SERP provider is connected.',
    marketingLanguage: 'Produces an outline, target questions and a word-count target for a page you plan to write.',
  },
  keyword_research: {
    label: 'Keyword research',
    status: 'beta',
    source:
      'DataForSEO search volume and CPC when credentials are configured; an in-product model otherwise. Difficulty is always partly modelled — no provider supplies organic difficulty directly.',
    evidence: 'tests/keyword-data.test.ts, tests/keywords.test.ts, tests/estimate.test.ts',
    externalValidation:
      'The DataForSEO adapter has never been run against the live API in this environment.',
    marketingLanguage:
      'Volume and CPC from DataForSEO when you connect it, clearly labelled estimates when you do not.',
  },
  csv_export: {
    label: 'CSV and JSON export',
    status: 'verified',
    source: 'Your own stored rows, written out unchanged.',
    evidence: 'tests/csv.test.ts',
    externalValidation: 'None required.',
    marketingLanguage: 'Export every project — prompts, checks, keywords, audits and articles — as CSV or JSON at any time.',
  },
  scheduled_runs: {
    label: 'Scheduled runs',
    status: 'beta',
    source:
      'A cron endpoint that works out which projects are due from the last measurement run and starts a new one through the same orchestrator as a manual run.',
    evidence: 'tests/measurement-run.test.ts, CI boot check in .github/workflows/supertool.yml',
    externalValidation:
      'Gate 1 made runs durable and retries idempotent: the run row is written before any provider call, each observation is persisted as it completes, and a uniqueness constraint means a retry fills gaps rather than duplicating. There is still no distributed queue or lock, so two schedulers running concurrently is untested. Gate 2 owns durable queueing.',
    marketingLanguage: 'Re-runs your prompt set on a schedule so you have a trend rather than a snapshot.',
  },
  wordpress_publishing: {
    label: 'WordPress publishing',
    status: 'beta',
    source: 'WordPress core REST API with an application password, posting native block markup.',
    evidence: 'tests/wordpress.test.ts, tests/wordpress.integration.test.ts (both against a stubbed API)',
    externalValidation:
      'Never executed against a real WordPress installation. No PHPUnit suite and no plugin activation test exist.',
    marketingLanguage:
      'Publishes drafts to WordPress as native blocks through the REST API. Validated against a stubbed API, not yet against a live site.',
  },
  elementor_widgets: {
    label: 'Elementor templates',
    status: 'beta',
    source: 'Six template JSON files and free-tier widget registration in the plugin.',
    evidence: 'CI JSON validation in .github/workflows/supertool.yml',
    externalValidation:
      'Never imported into, or rendered by, a real Elementor installation. Compatibility is inferred from the file format only.',
    marketingLanguage: 'Ships Elementor templates and widgets. Not yet verified against a live Elementor install.',
  },
  public_api: {
    label: 'Project API keys',
    status: 'beta',
    source:
      'Hashed per-project keys authenticating the /api/v1 endpoints the WordPress plugin uses. Scoped, revocable, expiring, and rotatable with a 24-hour overlap during which the pair shares one daily budget. The daily quota is enforced atomically per tenant-scoped key group: admission and increment are one database statement, so simultaneous requests cannot exceed the limit.',
    evidence:
      'tests/crypto.test.ts, tests/apikey-scopes.test.ts, tests/apikey-rotation.test.ts, tests/apikey-quota.test.ts',
    externalValidation:
      'Never exercised by a third-party integrator against a real deployment. Rotation and atomic quota admission are proven in tests against PostgreSQL, including concurrent admission, not in production use.',
    marketingLanguage: 'Issue a per-project API key so the WordPress plugin — or your own scripts — can read your data.',
  },
  billing: {
    label: 'Subscriptions and billing',
    status: 'beta',
    source: 'Stripe Checkout and Billing Portal, with idempotent webhook handling.',
    evidence: 'tests/billing.test.ts',
    externalValidation: 'Never run against a real Stripe account, not even in test mode.',
    marketingLanguage: 'Subscriptions are handled by Stripe Checkout.',
  },
  transactional_email: {
    label: 'Transactional email',
    status: 'beta',
    source: 'Resend or SMTP, whichever is configured.',
    evidence: 'tests/email.test.ts, tests/password-reset.test.ts',
    externalValidation: 'No message has been delivered through a real provider from this environment.',
    marketingLanguage: 'Sends password resets and account email through your configured provider.',
  },

  measurement_foundation: {
    label: 'Run-scoped measurement with confidence intervals',
    status: 'beta',
    source:
      'Immutable MeasurementRun and Observation records. Every rate is computed inside one run, identified by run id and never by date; failed and unavailable observations are excluded from rate denominators and reported as coverage; binary rates carry a 95% Wilson interval; run-to-run spread is reported separately from the within-run interval.',
    evidence:
      'tests/measurement-stats.test.ts, tests/measurement-run.test.ts, docs/measurement-spec.md',
    externalValidation:
      'The arithmetic and the run lifecycle are unit- and database-tested. They have never operated on a live provider response, because no engine is currently measurable.',
    marketingLanguage:
      'Every figure is tied to a specific run, states how much of that run produced data, and carries a confidence interval rather than a bare percentage.',
  },

  /* ---- Not sellable ---------------------------------------------------- */

  lead_attribution: {
    label: 'Referral telemetry',
    status: 'demo_only',
    source:
      'A public endpoint the WordPress plugin calls with a caller-supplied referrer. It can be forged by anyone, is matched by substring rather than by parsed hostname, and records an anonymous visit rather than a verified lead.',
    evidence: 'None. There is no test asserting the events are trustworthy, because they are not.',
    externalValidation:
      'The attribution chain from an assistant answer to a real conversion has never been demonstrated end to end.',
    marketingLanguage:
      'Not sold. Referral events are unverified and forgeable; they are shown only in the demo workspace, and never described as leads.',
  },
  rank_tracking: {
    label: 'Rank tracking',
    status: 'unavailable',
    source: 'No SERP provider is connected. The only ranking rows that exist anywhere are seeded demo data.',
    evidence: 'tests/provenance.test.ts asserts a live project cannot be shown seeded rankings.',
    externalValidation: 'Not applicable — the capability does not exist.',
    marketingLanguage:
      'Not available. SuperTool does not track search positions today; a SERP provider integration is required first.',
  },
  backlink_tracking: {
    label: 'Backlink tracking',
    status: 'unavailable',
    source: 'No backlink provider and no crawl index. Existing rows are seeded demo data.',
    evidence: 'tests/provenance.test.ts',
    externalValidation: 'Not applicable — the capability does not exist.',
    marketingLanguage:
      'Not available. SuperTool has no backlink index and no provider integration.',
  },
  content_generation: {
    label: 'Content generation',
    status: 'unavailable',
    source: 'Nothing writes article body copy. Briefs and scoring exist; drafting does not.',
    evidence: 'No route or library generates article text.',
    externalValidation: 'Not applicable — the capability does not exist.',
    marketingLanguage: 'Not available. SuperTool briefs and scores content; it does not write it.',
  },
  google_search_console: {
    label: 'Search Console integration',
    status: 'planned',
    source: 'No OAuth flow, no property connection and no query of the Search Console API exists in this codebase.',
    evidence: 'None.',
    externalValidation: 'Not started.',
    marketingLanguage: 'Not available.',
  },
  google_analytics: {
    label: 'GA4 integration',
    status: 'planned',
    source: 'No GA4 property connection and no Data API client exists in this codebase.',
    evidence: 'None.',
    externalValidation: 'Not started.',
    marketingLanguage: 'Not available.',
  },
  local_device_tracking: {
    label: 'City and device level tracking',
    status: 'planned',
    source: 'None. Runs carry no locale, city or device dimension at all.',
    evidence: 'None.',
    externalValidation: 'Not started.',
    marketingLanguage: 'Not available.',
  },
  approval_workflow: {
    label: 'Review and approval workflow',
    status: 'planned',
    source: 'None. Publishing goes straight from the dashboard to WordPress with no review step.',
    evidence: 'None.',
    externalValidation: 'Not started.',
    marketingLanguage: 'Not available.',
  },
  teams_rbac: {
    label: 'Multi-seat workspaces',
    status: 'planned',
    source:
      'Membership rows carry a role column, but no code reads it, there is no invitation flow, and every member has full access.',
    evidence: 'None.',
    externalValidation: 'Not started.',
    marketingLanguage: 'Not available. Roles exist in the schema but are not enforced.',
  },
  white_label_reporting: {
    label: 'White-label reporting',
    status: 'planned',
    source: 'No report renderer, no PDF pipeline and no per-tenant branding exists in this codebase.',
    evidence: 'None.',
    externalValidation: 'Not started.',
    marketingLanguage: 'Not available.',
  },
  byo_provider_keys: {
    label: 'Bring your own provider keys',
    status: 'planned',
    source:
      'Provider credentials are read from deployment environment variables only. There is no per-tenant credential store.',
    evidence: 'None.',
    externalValidation: 'Not started.',
    marketingLanguage: 'Not available.',
  },
  google_ai_mode: {
    label: 'Google AI Mode tracking',
    status: 'unavailable',
    source:
      'No official API and no compliant third-party source. Previously answered by the Gemini developer API, which is a different surface; that mapping has been removed.',
    evidence: 'tests/provenance.test.ts asserts this surface is never called and never simulated.',
    externalValidation: 'Not applicable — the capability does not exist.',
    marketingLanguage:
      'Not available. Google AI Mode cannot be measured compliantly today, so SuperTool does not claim to measure it.',
  },
} as const;

export type CapabilityId = keyof typeof REGISTRY;

/** The registry, with the repetitive fields filled in. */
export const CAPABILITIES: Record<CapabilityId, Capability> = Object.fromEntries(
  Object.entries(REGISTRY).map(([id, c]) => [id, { ...c, id, owner: OWNER, lastVerified: VERIFIED_ON }]),
) as Record<CapabilityId, Capability>;

export const CAPABILITY_IDS = Object.keys(CAPABILITIES) as CapabilityId[];

export function getCapability(id: CapabilityId): Capability {
  return CAPABILITIES[id];
}

/** True when this capability may appear in a plan, a price or a public claim. */
export function isSellable(id: CapabilityId): boolean {
  return SELLABLE_STATUSES.includes(CAPABILITIES[id].status);
}

export function capabilitiesByStatus(status: CapabilityStatus): Capability[] {
  return CAPABILITY_IDS.map((id) => CAPABILITIES[id]).filter((c) => c.status === status);
}

/**
 * The line a plan feature list shows for a capability.
 *
 * Throws for a capability that is not sellable, so a non-shippable feature
 * cannot be added to a pricing table by accident — the build fails instead of
 * the customer being misled.
 */
export function planFeatureLabel(id: CapabilityId, detail?: string): string {
  if (!isSellable(id)) {
    throw new Error(
      `Capability "${id}" has status "${CAPABILITIES[id].status}" and cannot appear in a plan.`,
    );
  }
  return detail ? `${CAPABILITIES[id].label} — ${detail}` : CAPABILITIES[id].label;
}

/** Statuses that must never be rendered on a public marketing surface as a feature. */
export function isPubliclyClaimable(id: CapabilityId): boolean {
  return isSellable(id);
}
