import 'server-only';
import { providerConfigured as keywordProviderConfigured } from './seo/providers/keyword-data';

/**
 * Which external data sources this deployment can actually reach.
 *
 * The UI asks these questions before rendering a panel, so a section backed by
 * nothing renders as "not connected" rather than as an empty chart that looks
 * like a measurement of zero.
 */

export interface SourceStatus {
  connected: boolean;
  /** Provider name when connected, '' otherwise. */
  provider: string;
  /** Shown to the user when not connected. */
  reason: string;
}

export function keywordMetricsSource(): SourceStatus {
  return keywordProviderConfigured()
    ? { connected: true, provider: 'DataForSEO', reason: '' }
    : {
        connected: false,
        provider: '',
        reason:
          'No keyword data provider is connected, so volume, CPC and difficulty are modelled in-product rather than measured.',
      };
}

/**
 * Search-position data.
 *
 * There is no SERP provider integration in this codebase. This function
 * returns `connected: false` unconditionally and deliberately: writing an env
 * check here would imply an adapter exists behind it.
 */
export function rankSource(): SourceStatus {
  return {
    connected: false,
    provider: '',
    reason:
      'SuperTool has no SERP provider integration, so it cannot measure search positions. Any position shown outside the demo workspace would be fabricated, so none is shown.',
  };
}

/** Backlink data. Same situation as rankings: no provider, no index. */
export function backlinkSource(): SourceStatus {
  return {
    connected: false,
    provider: '',
    reason:
      'SuperTool has no backlink provider and no crawl index of its own, so it cannot report referring domains or link authority.',
  };
}
