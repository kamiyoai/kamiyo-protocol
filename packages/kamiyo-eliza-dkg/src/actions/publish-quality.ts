import type { Action, IAgentRuntime, Memory, State, HandlerCallback } from '../types.js';
import { getBridgeContext, publishQualityAttestation } from '../bridge.js';

export const publishQualityAction: Action = {
  name: 'PUBLISH_QUALITY_TO_DKG',
  description: 'Publish a quality attestation for a service provider to the OriginTrail Decentralized Knowledge Graph',
  similes: ['record quality', 'attest quality', 'publish review', 'dkg quality'],
  examples: [
    [
      {
        user: 'agent',
        content: { text: 'Publish quality score 85 for provider api.example.com to DKG' },
      },
      {
        user: 'assistant',
        content: {
          text: 'Published quality attestation to DKG',
          action: 'PUBLISH_QUALITY_TO_DKG',
        },
      },
    ],
  ],

  validate: async (runtime: IAgentRuntime, _message: Memory): Promise<boolean> => {
    const endpoint = runtime.getSetting?.('DKG_ENDPOINT') || process.env.DKG_ENDPOINT;
    const privateKey = runtime.getSetting?.('DKG_PRIVATE_KEY') || process.env.DKG_PRIVATE_KEY;
    return !!endpoint && !!privateKey;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    options?: { [key: string]: unknown },
    callback?: HandlerCallback
  ): Promise<{ ual: string; success: boolean }> => {
    const ctx = await getBridgeContext(runtime);

    // Extract parameters from message or options
    const providerId = (options?.providerId as string) || extractProviderId(message.content.text);
    const qualityScore = (options?.qualityScore as number) || extractQualityScore(message.content.text);
    const explanation = (options?.explanation as string) || message.content.text;
    const escrowId = options?.escrowId as string | undefined;
    const evidenceHash = options?.evidenceHash as string | undefined;

    if (!providerId || qualityScore === undefined) {
      const errorMsg = 'Missing required parameters: providerId and qualityScore';
      if (callback) {
        await callback({ text: errorMsg });
      }
      return { ual: '', success: false };
    }

    try {
      const result = await publishQualityAttestation(ctx, {
        providerId,
        qualityScore,
        explanation,
        escrowId,
        evidenceHash,
      }, runtime.agentId);

      const responseText = `Published quality attestation to DKG.\nProvider: ${providerId}\nScore: ${qualityScore}\nUAL: ${result.ual}`;

      if (callback) {
        await callback({
          text: responseText,
          content: {
            ual: result.ual,
            providerId,
            qualityScore,
            blockchain: result.blockchain,
          },
        });
      }

      return { ual: result.ual, success: true };
    } catch (err) {
      const errorMsg = `Failed to publish quality attestation: ${err instanceof Error ? err.message : err}`;
      if (callback) {
        await callback({ text: errorMsg });
      }
      return { ual: '', success: false };
    }
  },
};

function extractProviderId(text: string): string | undefined {
  // Try to extract provider ID from text (URL, address, or explicit mention)
  const urlMatch = text.match(/(?:provider|for|to)\s+(https?:\/\/[^\s]+|[a-zA-Z0-9.-]+\.[a-z]{2,})/i);
  if (urlMatch) return urlMatch[1];

  const addressMatch = text.match(/(?:provider|for)\s+(0x[a-fA-F0-9]{40})/i);
  if (addressMatch) return addressMatch[1];

  return undefined;
}

function extractQualityScore(text: string): number | undefined {
  // Try to extract quality score from text
  const scoreMatch = text.match(/(?:score|quality|rating)\s*(?:of|:)?\s*(\d+(?:\.\d+)?)/i);
  if (scoreMatch) return parseFloat(scoreMatch[1]);

  const percentMatch = text.match(/(\d+(?:\.\d+)?)\s*%/);
  if (percentMatch) return parseFloat(percentMatch[1]);

  return undefined;
}
