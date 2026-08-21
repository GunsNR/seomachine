/**
 * The six answer engines tracked by SuperTool.
 *
 * `envKey` names the credential that switches an engine from simulated to
 * live. Everything else is presentation metadata used by the dashboard.
 */
export const ENGINES = [
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    vendor: 'OpenAI',
    color: '#10A37F',
    envKey: 'OPENAI_API_KEY',
    model: 'gpt-4o-search-preview',
    /** Rough share of assistant traffic; used to weight the blended score. */
    audienceWeight: 0.42,
    citesSources: true,
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    vendor: 'Perplexity AI',
    color: '#20808D',
    envKey: 'PERPLEXITY_API_KEY',
    model: 'sonar-pro',
    audienceWeight: 0.14,
    citesSources: true,
  },
  {
    id: 'claude',
    name: 'Claude',
    vendor: 'Anthropic',
    color: '#D97757',
    envKey: 'ANTHROPIC_API_KEY',
    model: 'claude-sonnet-4-5',
    audienceWeight: 0.13,
    citesSources: true,
  },
  {
    id: 'gemini',
    name: 'Gemini',
    vendor: 'Google',
    color: '#4285F4',
    envKey: 'GOOGLE_AI_API_KEY',
    model: 'gemini-2.0-flash',
    audienceWeight: 0.16,
    citesSources: true,
  },
  {
    id: 'grok',
    name: 'Grok',
    vendor: 'xAI',
    color: '#111111',
    envKey: 'XAI_API_KEY',
    model: 'grok-3',
    audienceWeight: 0.05,
    citesSources: true,
  },
  {
    id: 'google-ai-mode',
    name: 'Google AI Mode',
    vendor: 'Google Search',
    color: '#EA4335',
    envKey: 'SERP_API_KEY',
    model: 'ai-overview',
    audienceWeight: 0.10,
    citesSources: true,
  },
] as const;

export type EngineId = (typeof ENGINES)[number]['id'];
export type Engine = (typeof ENGINES)[number];

export const ENGINE_IDS = ENGINES.map((e) => e.id) as EngineId[];

export function getEngine(id: string): Engine | undefined {
  return ENGINES.find((e) => e.id === id);
}

export function engineName(id: string): string {
  return getEngine(id)?.name ?? id;
}

/** True when a real API credential is configured for this engine. */
export function isEngineLive(id: EngineId): boolean {
  const engine = getEngine(id);
  return !!engine && !!process.env[engine.envKey];
}

export function liveEngines(): EngineId[] {
  return ENGINE_IDS.filter(isEngineLive);
}
