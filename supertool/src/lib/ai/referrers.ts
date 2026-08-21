/**
 * Answer-engine referrer detection.
 *
 * Lives outside the route file because Next.js route modules may only export
 * route handlers and their config.
 */
import { ENGINE_IDS, type EngineId } from './engines';

const ENGINE_REFERRERS: Array<[RegExp, EngineId]> = [
  [/chat\.openai\.com|chatgpt\.com/i, 'chatgpt'],
  [/perplexity\.ai/i, 'perplexity'],
  [/claude\.ai|anthropic\.com/i, 'claude'],
  [/gemini\.google\.com|bard\.google\.com/i, 'gemini'],
  [/grok\.com|x\.ai/i, 'grok'],
  [/google\.[a-z.]+\/search.*udm=50|google\.[a-z.]+\/aimode/i, 'google-ai-mode'],
];

/** Map a referrer URL to an engine id, or '' when it is not an answer engine. */
export function detectEngine(referrer: string): EngineId | '' {
  if (!referrer) return '';
  for (const [pattern, id] of ENGINE_REFERRERS) {
    if (pattern.test(referrer)) return id;
  }
  return '';
}

/** True when the value is one of the six tracked engine ids. */
export function isKnownEngine(value: string): value is EngineId {
  return (ENGINE_IDS as string[]).includes(value);
}
