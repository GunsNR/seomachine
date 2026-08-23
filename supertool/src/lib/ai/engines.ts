/**
 * The answer surfaces SuperTool knows about.
 *
 * A surface is only measurable when there is a compliant, official way to ask
 * it a question. `accessMethod` records what that way is; `availability`
 * records whether it exists at all today. A surface marked `unavailable` is
 * never called, never simulated into a customer workspace, and never counted
 * as a live engine anywhere in the product.
 *
 * This is deliberately conservative. Naming a surface after a consumer product
 * ("Google AI Mode") while actually querying a different vendor endpoint
 * (the Gemini developer API) would make every number derived from it false, so
 * that mapping was removed rather than relabelled.
 */

/** How SuperTool reaches a surface. */
export type AccessMethod =
  /** The vendor's own developer API, called directly with a credential. */
  | 'official-api'
  /** No compliant source is wired up, so the surface cannot be measured. */
  | 'none';

export type EngineAvailability = 'available' | 'unavailable';

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
  availability: EngineAvailability;
  /**
   * Unvalidated internal estimate of assistant usage share, used only to order
   * surfaces in the UI. It is not measured, not sourced, and must never be
   * presented to a customer as a statistic.
   */
  audienceWeightEstimate: number;
  citesSources: boolean;
  /** Plain-English reason shown in the UI when `availability` is unavailable. */
  unavailableReason?: string;
}

export const ENGINES = [
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    vendor: 'OpenAI',
    color: '#10A37F',
    envKey: 'OPENAI_API_KEY',
    model: 'gpt-4o-search-preview',
    accessMethod: 'official-api',
    availability: 'available',
    audienceWeightEstimate: 0.42,
    citesSources: true,
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    vendor: 'Perplexity AI',
    color: '#20808D',
    envKey: 'PERPLEXITY_API_KEY',
    model: 'sonar-pro',
    accessMethod: 'official-api',
    availability: 'available',
    audienceWeightEstimate: 0.14,
    citesSources: true,
  },
  {
    id: 'claude',
    name: 'Claude',
    vendor: 'Anthropic',
    color: '#D97757',
    envKey: 'ANTHROPIC_API_KEY',
    model: 'claude-sonnet-4-5',
    accessMethod: 'official-api',
    availability: 'available',
    audienceWeightEstimate: 0.13,
    citesSources: true,
  },
  {
    id: 'gemini',
    name: 'Gemini',
    vendor: 'Google',
    color: '#4285F4',
    envKey: 'GOOGLE_AI_API_KEY',
    model: 'gemini-2.0-flash',
    accessMethod: 'official-api',
    availability: 'available',
    audienceWeightEstimate: 0.16,
    citesSources: true,
  },
  {
    id: 'grok',
    name: 'Grok',
    vendor: 'xAI',
    color: '#111111',
    envKey: 'XAI_API_KEY',
    model: 'grok-3',
    accessMethod: 'official-api',
    availability: 'available',
    audienceWeightEstimate: 0.05,
    citesSources: true,
  },
  {
    id: 'google-ai-mode',
    name: 'Google AI Mode',
    vendor: 'Google Search',
    color: '#EA4335',
    envKey: null,
    model: null,
    accessMethod: 'none',
    availability: 'unavailable',
    audienceWeightEstimate: 0.1,
    citesSources: true,
    unavailableReason:
      'Google AI Mode has no official API, and no compliant third-party source is connected. ' +
      'It was previously answered by the Gemini developer API, which is a different surface with ' +
      'different retrieval — so those results were removed rather than relabelled. This surface ' +
      'is not measured and is not counted in any score.',
  },
] as const satisfies readonly EngineDef[];

export type EngineId = (typeof ENGINES)[number]['id'];
export type Engine = (typeof ENGINES)[number];

export const ENGINE_IDS = ENGINES.map((e) => e.id) as EngineId[];

export function getEngine(id: string): Engine | undefined {
  return ENGINES.find((e) => e.id === id);
}

export function engineName(id: string): string {
  return getEngine(id)?.name ?? id;
}

/** True when a compliant source exists for this surface at all. */
export function isEngineAvailable(id: string): boolean {
  return getEngine(id)?.availability === 'available';
}

/**
 * Surfaces that can be asked a question today. Everything that fans out over
 * engines — manual runs, scheduled runs, the free tool — iterates this, not
 * ENGINES, so an unavailable surface can never produce a row.
 */
export const MEASURABLE_ENGINES = ENGINES.filter(
  (e) => e.availability === 'available',
) as readonly Engine[];

export const MEASURABLE_ENGINE_IDS = MEASURABLE_ENGINES.map((e) => e.id) as EngineId[];

/** True when this surface is available *and* its credential is configured. */
export function isEngineLive(id: string): boolean {
  const engine = getEngine(id);
  return !!engine && engine.availability === 'available' && !!engine.envKey && !!process.env[engine.envKey];
}

export function liveEngines(): EngineId[] {
  return ENGINE_IDS.filter(isEngineLive);
}

/** Surfaces that are available but have no credential configured. */
export function unconfiguredEngines(): EngineId[] {
  return MEASURABLE_ENGINE_IDS.filter((id) => !isEngineLive(id));
}

/** Surfaces with no compliant source at all. */
export function unavailableEngines(): EngineId[] {
  return ENGINE_IDS.filter((id) => !isEngineAvailable(id));
}
