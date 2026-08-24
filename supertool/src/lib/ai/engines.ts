/**
 * The answer surfaces SuperTool knows about, and what has actually been
 * verified about each one.
 *
 * A surface is only measurable when three things are true at once:
 *
 *   1. There is a compliant, official way to ask it a question.
 *   2. The adapter enables that vendor's web-retrieval tool, so the answer
 *      reflects a search rather than the model's parametric recall.
 *   3. The vendor's current official documentation has been read and the model
 *      identifier confirmed against it.
 *
 * Any one of those failing forces `availability: 'unavailable'` with a stated
 * reason. That is deliberately strict, and Gate 1 made it stricter than Gate 0
 * did, because of a distinction Gate 0 missed:
 *
 *   Asking an UNGROUNDED model "which SEO tool is best" does not measure AI
 *   search visibility. It measures what the model absorbed during training,
 *   months earlier, with no retrieval and no citations. Publishing that as
 *   "AI visibility" is the same category of error as answering Google AI Mode
 *   with Gemini — a real number about the wrong thing.
 *
 * Availability is therefore DERIVED from the audit fields below rather than
 * hand-set, so a surface cannot drift back to "available" without someone
 * changing a fact about it.
 */

/** How SuperTool reaches a surface. */
export type AccessMethod =
  /** The vendor's own developer API, called directly with a credential. */
  | 'official-api'
  /** No compliant source is wired up, so the surface cannot be measured. */
  | 'none';

export type EngineAvailability = 'available' | 'unavailable';

/**
 * Whether the adapter actually asks the vendor to search the web.
 *
 * This is a property of SuperTool's own request code, so it is known with
 * certainty by reading the adapter — no network access required.
 */
export type GroundingStatus =
  /** The adapter enables the vendor's web-retrieval tool. */
  | 'enabled'
  /** The model performs retrieval intrinsically, with no tool to enable. */
  | 'intrinsic'
  /** The adapter makes a plain completion call. No retrieval happens. */
  | 'absent';

/**
 * Whether the vendor's current official documentation has been read and the
 * model identifier confirmed against it.
 *
 * `source` must be an official vendor documentation URL. Third-party articles,
 * blog posts, search-result snippets and model knowledge are NOT verification
 * and must never be recorded here.
 */
export type DocVerification =
  | { state: 'verified'; source: string; checkedAt: string }
  | { state: 'unverified'; reason: string };

export interface EngineDef {
  id: string;
  name: string;
  vendor: string;
  color: string;
  /** Credential that switches this surface on. `null` when none can. */
  envKey: string | null;
  /** Exact model asked. `null` for surfaces with no API. */
  model: string | null;
  accessMethod: AccessMethod;
  grounding: GroundingStatus;
  docs: DocVerification;
  /**
   * Unvalidated internal estimate of assistant usage share, used only to order
   * surfaces in the UI. It is not measured, not sourced, and must never be
   * presented to a customer as a statistic.
   */
  audienceWeightEstimate: number;
  /** Extra reason on top of the derived ones, when a surface has one. */
  note?: string;
}

/**
 * Why no engine currently carries `docs.state: 'verified'`.
 *
 * Every official provider documentation domain — platform.openai.com,
 * developers.openai.com, docs.anthropic.com, ai.google.dev, docs.x.ai,
 * docs.perplexity.ai — is blocked by this environment's network egress proxy.
 * Verification therefore could not be performed, and the rule is that
 * unverified means unavailable. Substituting a third-party summary, or my own
 * recollection of a model identifier, would be exactly the kind of unsourced
 * claim Gate 0 removed from this product.
 */
const EGRESS_BLOCKED =
  'Official vendor documentation could not be reached from the build environment ' +
  '(all provider doc domains are blocked by the network egress proxy), so the model ' +
  'identifier and API contract could not be confirmed against a primary source.';

const ENGINE_DEFS = [
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    vendor: 'OpenAI',
    color: '#10A37F',
    envKey: 'OPENAI_API_KEY',
    model: 'gpt-4o-search-preview',
    accessMethod: 'official-api',
    // The adapter posts to /v1/chat/completions with no web_search tool. Whether
    // this particular preview model retrieves intrinsically could not be
    // confirmed against OpenAI's documentation, so it is not assumed to.
    grounding: 'absent',
    docs: { state: 'unverified', reason: EGRESS_BLOCKED },
    audienceWeightEstimate: 0.42,
    note:
      'Pinned to a preview model identifier. Preview models can be withdrawn at short ' +
      'notice, and the adapter passes no retrieval tool, so answers would reflect training ' +
      'data rather than a search.',
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    vendor: 'Perplexity AI',
    color: '#20808D',
    envKey: 'PERPLEXITY_API_KEY',
    model: 'sonar-pro',
    accessMethod: 'official-api',
    // Sonar models retrieve as part of answering; there is no tool to enable.
    // The adapter already reads the provider's `citations` field.
    grounding: 'intrinsic',
    docs: { state: 'unverified', reason: EGRESS_BLOCKED },
    audienceWeightEstimate: 0.14,
  },
  {
    id: 'claude',
    name: 'Claude',
    vendor: 'Anthropic',
    color: '#D97757',
    envKey: 'ANTHROPIC_API_KEY',
    model: 'claude-sonnet-4-5',
    accessMethod: 'official-api',
    // The adapter posts to /v1/messages with no `tools` array at all, so no web
    // search tool is enabled and no citations can come back.
    grounding: 'absent',
    docs: { state: 'unverified', reason: EGRESS_BLOCKED },
    audienceWeightEstimate: 0.13,
    note:
      'The adapter sends no tools, so the model answers from training data and returns ' +
      'no citations. Citation rate against this surface would always be zero for reasons ' +
      'that have nothing to do with the brand.',
  },
  {
    id: 'gemini',
    name: 'Gemini',
    vendor: 'Google',
    color: '#4285F4',
    envKey: 'GOOGLE_AI_API_KEY',
    model: 'gemini-2.0-flash',
    accessMethod: 'official-api',
    // The adapter calls generateContent with no google_search tool, then parses
    // groundingMetadata that consequently can never be populated.
    grounding: 'absent',
    docs: { state: 'unverified', reason: EGRESS_BLOCKED },
    audienceWeightEstimate: 0.16,
    note:
      'The adapter parses groundingMetadata but never requests grounding, so that field ' +
      'is always empty. It reads as "no citations found" when the truth is "no search ran".',
  },
  {
    id: 'grok',
    name: 'Grok',
    vendor: 'xAI',
    color: '#111111',
    envKey: 'XAI_API_KEY',
    model: 'grok-3',
    accessMethod: 'official-api',
    // Plain chat/completions with no search parameters.
    grounding: 'absent',
    docs: { state: 'unverified', reason: EGRESS_BLOCKED },
    audienceWeightEstimate: 0.05,
    note: 'The adapter passes no live-search parameters, so no retrieval happens.',
  },
  {
    id: 'google-ai-mode',
    name: 'Google AI Mode',
    vendor: 'Google Search',
    color: '#EA4335',
    envKey: null,
    model: null,
    accessMethod: 'none',
    grounding: 'absent',
    docs: { state: 'unverified', reason: 'No official API exists to document.' },
    audienceWeightEstimate: 0.1,
    note:
      'Google AI Mode has no official API, and no compliant third-party source is ' +
      'connected. It was previously answered by the Gemini developer API, which is a ' +
      'different surface with different retrieval — so that mapping was removed rather ' +
      'than relabelled.',
  },
] as const satisfies readonly EngineDef[];

export type EngineId = (typeof ENGINE_DEFS)[number]['id'];

/**
 * Why this surface cannot be measured, or null when it can.
 *
 * Order matters: the most fundamental problem is reported first, so an operator
 * fixes the blocking issue rather than the cosmetic one.
 */
function deriveUnavailableReason(e: EngineDef): string | null {
  const reasons: string[] = [];

  if (e.accessMethod === 'none') {
    reasons.push('There is no compliant public API for this surface.');
  }
  if (e.grounding === 'absent' && e.accessMethod !== 'none') {
    reasons.push(
      'The adapter does not enable web retrieval, so answers would come from the ' +
        "model's training data rather than a search. That is not AI search visibility.",
    );
  }
  if (e.docs.state === 'unverified') {
    reasons.push(`Model and API contract unverified: ${e.docs.reason}`);
  }
  if (e.note) reasons.push(e.note);

  return reasons.length ? reasons.join(' ') : null;
}

export interface Engine extends Omit<EngineDef, 'id'> {
  id: EngineId;
  availability: EngineAvailability;
  unavailableReason?: string;
  /**
   * Whether a demo workspace may render sample text for this surface.
   *
   * Demo data is explicitly labelled as generated sample text and is never a
   * measurement of any assistant, so showing it for a surface whose adapter is
   * merely unfinished is a UI demonstration, not a claim. Showing it for a
   * surface with NO public API at all would be different in kind — it would
   * fabricate a product capability — so that is never permitted.
   *
   * Live mode is unaffected: an unavailable surface is never called and never
   * simulated in a live workspace, whatever this says.
   */
  simulatableInDemo: boolean;
}

/**
 * The registry, with availability derived rather than declared.
 *
 * Nothing hand-sets `availability`. To make a surface measurable you must
 * change a fact about it — enable grounding, verify the docs — which is the
 * point.
 */
export const ENGINES: readonly Engine[] = ENGINE_DEFS.map((e) => {
  const reason = deriveUnavailableReason(e);
  const base = {
    ...e,
    id: e.id as EngineId,
    simulatableInDemo: e.accessMethod === 'official-api',
  };
  return reason
    ? { ...base, availability: 'unavailable' as const, unavailableReason: reason }
    : { ...base, availability: 'available' as const };
});

export const ENGINE_IDS = ENGINE_DEFS.map((e) => e.id) as EngineId[];

export function getEngine(id: string): Engine | undefined {
  return ENGINES.find((e) => e.id === id);
}

export function engineName(id: string): string {
  return getEngine(id)?.name ?? id;
}

/** True when a compliant, grounded, documentation-verified source exists. */
export function isEngineAvailable(id: string): boolean {
  return getEngine(id)?.availability === 'available';
}

/**
 * Surfaces that can be asked a question today.
 *
 * Everything that fans out over engines iterates this, not ENGINES, so an
 * unavailable surface can never produce an observation. This list is currently
 * empty, and that is the honest state of the product: see the Gate 1 provider
 * audit in docs/release-truth-audit.md.
 */
export const MEASURABLE_ENGINES: readonly Engine[] = ENGINES.filter(
  (e) => e.availability === 'available',
);

export const MEASURABLE_ENGINE_IDS = MEASURABLE_ENGINES.map((e) => e.id) as EngineId[];

/** True when this surface is available *and* its credential is configured. */
export function isEngineLive(id: string): boolean {
  const engine = getEngine(id);
  return (
    !!engine &&
    engine.availability === 'available' &&
    !!engine.envKey &&
    !!process.env[engine.envKey]
  );
}

export function liveEngines(): EngineId[] {
  return ENGINE_IDS.filter(isEngineLive);
}

/** Surfaces that are available but have no credential configured. */
export function unconfiguredEngines(): EngineId[] {
  return MEASURABLE_ENGINE_IDS.filter((id) => !isEngineLive(id));
}

/** Surfaces that cannot be measured at all, with the reason attached. */
export function unavailableEngines(): EngineId[] {
  return ENGINE_IDS.filter((id) => !isEngineAvailable(id));
}

/** Engines whose only blocker is documentation verification. */
export function blockedOnDocsOnly(): EngineId[] {
  return ENGINES.filter(
    (e) =>
      e.accessMethod !== 'none' &&
      e.grounding !== 'absent' &&
      e.docs.state === 'unverified',
  ).map((e) => e.id) as EngineId[];
}

/** Engines whose adapter would need grounding wired up before they can count. */
export function blockedOnGrounding(): EngineId[] {
  return ENGINES.filter((e) => e.accessMethod !== 'none' && e.grounding === 'absent').map(
    (e) => e.id,
  ) as EngineId[];
}

/**
 * Surfaces a demo workspace may render sample text for.
 *
 * Never used by a live workspace. See `Engine.simulatableInDemo`.
 */
export const DEMO_ENGINES: readonly Engine[] = ENGINES.filter((e) => e.simulatableInDemo);

export const DEMO_ENGINE_IDS = DEMO_ENGINES.map((e) => e.id) as EngineId[];
