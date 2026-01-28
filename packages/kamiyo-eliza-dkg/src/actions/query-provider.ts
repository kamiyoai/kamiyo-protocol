import type { Action, IAgentRuntime, Memory, State, HandlerCallback } from '../types.js';
import { getBridgeContext, queryProviderQuality, queryProvidersByReputation } from '../bridge.js';

export const queryProviderQualityAction: Action = {
  name: 'QUERY_PROVIDER_QUALITY',
  description: 'Query quality attestations for a service provider from the OriginTrail Decentralized Knowledge Graph',
  similes: ['check provider', 'lookup quality', 'provider reputation', 'dkg query'],
  examples: [
    [
      {
        user: 'agent',
        content: { text: 'Check the quality history for api.example.com on DKG' },
      },
      {
        user: 'assistant',
        content: {
          text: 'Provider api.example.com has average rating 87.5 from 12 reviews',
          action: 'QUERY_PROVIDER_QUALITY',
        },
      },
    ],
  ],

  validate: async (runtime: IAgentRuntime, _message: Memory): Promise<boolean> => {
    const endpoint = runtime.getSetting?.('DKG_ENDPOINT') || process.env.DKG_ENDPOINT;
    return !!endpoint;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    options?: { [key: string]: unknown },
    callback?: HandlerCallback
  ): Promise<{
    providerId: string;
    avgRating: number | null;
    reviewCount: number;
    found: boolean;
  }> => {
    const ctx = await getBridgeContext(runtime);

    const providerId = (options?.providerId as string) || extractProviderId(message.content.text);

    if (!providerId) {
      const errorMsg = 'Missing required parameter: providerId';
      if (callback) {
        await callback({ text: errorMsg });
      }
      return { providerId: '', avgRating: null, reviewCount: 0, found: false };
    }

    try {
      const stats = await queryProviderQuality(ctx, providerId);

      if (!stats) {
        const responseText = `No quality attestations found for provider ${providerId} on DKG.`;
        if (callback) {
          await callback({ text: responseText });
        }
        return { providerId, avgRating: null, reviewCount: 0, found: false };
      }

      const recentList = stats.recentRatings
        .slice(0, 5)
        .map((r) => `  - ${r.rating.toFixed(1)} on ${r.date.split('T')[0]}`)
        .join('\n');

      const responseText = `Provider quality from DKG:
Provider: ${providerId}
Average Rating: ${stats.avgRating.toFixed(1)}/100
Total Reviews: ${stats.reviewCount}
Recent Ratings:
${recentList}`;

      if (callback) {
        await callback({
          text: responseText,
          content: {
            providerId: stats.providerId,
            avgRating: stats.avgRating,
            reviewCount: stats.reviewCount,
            recentRatings: stats.recentRatings,
          },
        });
      }

      return {
        providerId: stats.providerId,
        avgRating: stats.avgRating,
        reviewCount: stats.reviewCount,
        found: true,
      };
    } catch (err) {
      const errorMsg = `Failed to query provider quality: ${err instanceof Error ? err.message : err}`;
      if (callback) {
        await callback({ text: errorMsg });
      }
      return { providerId, avgRating: null, reviewCount: 0, found: false };
    }
  },
};

export const findTrustedProvidersAction: Action = {
  name: 'FIND_TRUSTED_PROVIDERS',
  description: 'Find service providers with reputation above a threshold from the OriginTrail DKG',
  similes: ['find providers', 'trusted providers', 'good providers', 'reputable services'],
  examples: [
    [
      {
        user: 'agent',
        content: { text: 'Find providers with quality above 80 on DKG' },
      },
      {
        user: 'assistant',
        content: {
          text: 'Found 5 providers with rating above 80',
          action: 'FIND_TRUSTED_PROVIDERS',
        },
      },
    ],
  ],

  validate: async (runtime: IAgentRuntime, _message: Memory): Promise<boolean> => {
    const endpoint = runtime.getSetting?.('DKG_ENDPOINT') || process.env.DKG_ENDPOINT;
    return !!endpoint;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    options?: { [key: string]: unknown },
    callback?: HandlerCallback
  ): Promise<{
    providers: Array<{ providerId: string; avgRating: number; reviewCount: number }>;
    minScore: number;
  }> => {
    const ctx = await getBridgeContext(runtime);

    const minScore = (options?.minScore as number) || extractMinScore(message.content.text) ||
      parseInt(runtime.getSetting?.('KAMIYO_MIN_REPUTATION') || '60');

    try {
      const providers = await queryProvidersByReputation(ctx, minScore);

      if (providers.length === 0) {
        const responseText = `No providers found with rating above ${minScore} on DKG.`;
        if (callback) {
          await callback({ text: responseText });
        }
        return { providers: [], minScore };
      }

      const providerList = providers
        .slice(0, 10)
        .map((p) => `  - ${p.providerId}: ${p.avgRating.toFixed(1)} (${p.reviewCount} reviews)`)
        .join('\n');

      const responseText = `Trusted providers from DKG (min score: ${minScore}):
Found ${providers.length} providers:
${providerList}`;

      if (callback) {
        await callback({
          text: responseText,
          content: { providers, minScore },
        });
      }

      return { providers, minScore };
    } catch (err) {
      const errorMsg = `Failed to find trusted providers: ${err instanceof Error ? err.message : err}`;
      if (callback) {
        await callback({ text: errorMsg });
      }
      return { providers: [], minScore };
    }
  },
};

function extractProviderId(text: string): string | undefined {
  const urlMatch = text.match(/(?:provider|for|check)\s+(https?:\/\/[^\s]+|[a-zA-Z0-9.-]+\.[a-z]{2,})/i);
  if (urlMatch) return urlMatch[1];

  const addressMatch = text.match(/(?:provider|for|check)\s+(0x[a-fA-F0-9]{40})/i);
  if (addressMatch) return addressMatch[1];

  return undefined;
}

function extractMinScore(text: string): number | undefined {
  const scoreMatch = text.match(/(?:above|over|minimum|min|>=?)\s*(\d+)/i);
  if (scoreMatch) return parseInt(scoreMatch[1]);
  return undefined;
}
