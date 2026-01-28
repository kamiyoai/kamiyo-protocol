import type { Evaluator, IAgentRuntime, Memory, State } from '../types.js';
import { getBridgeContext, publishQualityAttestation } from '../bridge.js';

export const qualityPublisherEvaluator: Evaluator = {
  name: 'dkgQualityPublisher',
  description: 'Automatically publishes quality attestations to DKG after API interactions',
  similes: ['dkg publisher', 'quality recorder'],
  examples: [
    {
      context: 'Agent completed an API call with quality evaluation',
      messages: [
        { user: 'agent', content: { text: 'API call to api.example.com completed with 85% quality' } },
      ],
      outcome: 'Quality attestation published to DKG',
    },
  ],

  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    // Only trigger if auto-publish is enabled
    const autoPublish = runtime.getSetting?.('AUTO_PUBLISH_QUALITY') !== 'false';
    if (!autoPublish) return false;

    // Check if message contains quality evaluation results
    const content = message.content;
    return !!(
      content.qualityScore !== undefined ||
      content.quality !== undefined ||
      (typeof content.text === 'string' && content.text.includes('quality'))
    );
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State
  ): Promise<{ published: boolean; ual?: string }> => {
    try {
      const ctx = await getBridgeContext(runtime);
      const content = message.content;

      // Extract quality data from message content
      const qualityScore = extractQualityScore(content);
      const providerId = extractProviderId(content, state);

      if (qualityScore === undefined || !providerId) {
        return { published: false };
      }

      const result = await publishQualityAttestation(ctx, {
        providerId,
        qualityScore,
        explanation: typeof content.text === 'string' ? content.text : undefined,
        escrowId: content.escrowId as string | undefined,
        transactionHash: content.transactionHash as string | undefined,
      }, runtime.agentId);

      return { published: true, ual: result.ual };
    } catch (err) {
      console.error('[DKG Quality Publisher] Error:', err);
      return { published: false };
    }
  },
};

function extractQualityScore(content: Record<string, unknown>): number | undefined {
  if (typeof content.qualityScore === 'number') return content.qualityScore;
  if (typeof content.quality === 'number') return content.quality;

  if (typeof content.text === 'string') {
    const match = content.text.match(/(\d+(?:\.\d+)?)\s*%?\s*quality/i);
    if (match) return parseFloat(match[1]);
  }

  return undefined;
}

function extractProviderId(content: Record<string, unknown>, state?: State): string | undefined {
  if (typeof content.providerId === 'string') return content.providerId;
  if (typeof content.provider === 'string') return content.provider;
  if (typeof content.endpoint === 'string') {
    try {
      const url = new URL(content.endpoint);
      return url.hostname;
    } catch {
      return content.endpoint;
    }
  }

  // Try to extract from state
  if (state?.currentProvider) return state.currentProvider as string;

  return undefined;
}
