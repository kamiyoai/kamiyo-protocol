import type { Provider, IAgentRuntime, Memory, State } from '../types.js';
import { getBridgeContext, queryProviderQuality } from '../bridge.js';

export const dkgQualityProvider: Provider = {
  get: async (runtime: IAgentRuntime, message: Memory, _state?: State): Promise<string> => {
    // Extract any provider mentions from the message
    const providerId = extractProviderFromMessage(message.content.text);

    if (!providerId) {
      return '';
    }

    try {
      const ctx = await getBridgeContext(runtime);
      const stats = await queryProviderQuality(ctx, providerId);

      if (!stats) {
        return `[DKG] No quality data found for provider ${providerId}`;
      }

      const minReputation = parseInt(runtime.getSetting?.('KAMIYO_MIN_REPUTATION') || '60');
      const trustLevel = stats.avgRating >= minReputation ? 'TRUSTED' : 'UNTRUSTED';

      return `[DKG Quality Data]
Provider: ${stats.providerId}
Trust Level: ${trustLevel}
Average Rating: ${stats.avgRating.toFixed(1)}/100
Review Count: ${stats.reviewCount}
Recent Ratings: ${stats.recentRatings.slice(0, 3).map(r => r.rating.toFixed(0)).join(', ')}
Recommendation: ${stats.avgRating >= minReputation ? 'Safe to interact' : 'Exercise caution - below trust threshold'}`;
    } catch (err) {
      return `[DKG] Error fetching quality data: ${err instanceof Error ? err.message : 'Unknown error'}`;
    }
  },
};

function extractProviderFromMessage(text: string): string | undefined {
  // Look for URLs
  const urlMatch = text.match(/(https?:\/\/[^\s]+)/i);
  if (urlMatch) {
    try {
      const url = new URL(urlMatch[1]);
      return url.hostname;
    } catch {
      // Not a valid URL
    }
  }

  // Look for domain names
  const domainMatch = text.match(/([a-zA-Z0-9][-a-zA-Z0-9]*\.[a-zA-Z]{2,}(?:\.[a-zA-Z]{2,})?)/);
  if (domainMatch) return domainMatch[1];

  // Look for addresses
  const addressMatch = text.match(/(0x[a-fA-F0-9]{40})/);
  if (addressMatch) return addressMatch[1];

  return undefined;
}
