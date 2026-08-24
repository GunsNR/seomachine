/**
 * Local price table for cost estimation.
 *
 * These are NOT fetched from any provider billing API and are NOT reconciled
 * against an invoice. Every figure derived from them is labelled an estimate,
 * per docs/measurement-spec.md §8.
 *
 * A missing entry yields a cost of 0, which means "not estimated" rather than
 * "free". Callers report how many observations actually carried usage data so
 * the two are distinguishable.
 */

export interface TokenPrice {
  /** USD per million input tokens. */
  inputPerMillion: number;
  /** USD per million output tokens. */
  outputPerMillion: number;
  /** Where the figure came from, so it can be re-checked. */
  note: string;
}

const UNVERIFIED =
  'Indicative list price recorded for estimation only; not verified against the vendor ' +
  'pricing page from this environment and not reconciled against billing.';

const PRICES: Record<string, TokenPrice> = {
  chatgpt: { inputPerMillion: 2.5, outputPerMillion: 10, note: UNVERIFIED },
  perplexity: { inputPerMillion: 3, outputPerMillion: 15, note: UNVERIFIED },
  claude: { inputPerMillion: 3, outputPerMillion: 15, note: UNVERIFIED },
  gemini: { inputPerMillion: 0.1, outputPerMillion: 0.4, note: UNVERIFIED },
  grok: { inputPerMillion: 3, outputPerMillion: 15, note: UNVERIFIED },
};

/**
 * Estimated USD cost of one observation.
 *
 * Returns 0 when the engine has no price entry or the provider reported no
 * usage. Zero here means "not estimated", and the run summary reports the count
 * of observations that did carry usage so a zero total is never mistaken for a
 * free run.
 */
export function estimateCostUsd(engine: string, inputTokens: number, outputTokens: number): number {
  const price = PRICES[engine];
  if (!price) return 0;
  const cost =
    (inputTokens / 1_000_000) * price.inputPerMillion +
    (outputTokens / 1_000_000) * price.outputPerMillion;
  // Six decimals: a single small call can genuinely cost less than a cent, and
  // rounding to cents per observation would silently floor a run to zero.
  return Math.round(cost * 1_000_000) / 1_000_000;
}

export function priceNote(engine: string): string | null {
  return PRICES[engine]?.note ?? null;
}
