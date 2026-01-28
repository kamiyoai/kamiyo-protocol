import type { Action, IAgentRuntime, Memory, State, HandlerCallback } from '../types.js';
import { getBridgeContext, publishDisputeOutcome } from '../bridge.js';

export const publishDisputeAction: Action = {
  name: 'PUBLISH_DISPUTE_TO_DKG',
  description: 'Publish a dispute resolution outcome to the OriginTrail Decentralized Knowledge Graph',
  similes: ['record dispute', 'publish resolution', 'dkg dispute', 'store dispute outcome'],
  examples: [
    [
      {
        user: 'agent',
        content: { text: 'Publish dispute outcome for escrow abc123 - client wins with 50% refund' },
      },
      {
        user: 'assistant',
        content: {
          text: 'Published dispute outcome to DKG',
          action: 'PUBLISH_DISPUTE_TO_DKG',
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

    // Extract parameters from options (required for disputes)
    const escrowId = options?.escrowId as string;
    const clientId = options?.clientId as string;
    const providerId = options?.providerId as string;
    const amount = options?.amount as number;
    const currency = (options?.currency as string) || 'SOL';
    const outcome = options?.outcome as 'provider_wins' | 'client_wins' | 'split' | 'no_consensus';
    const qualityScore = options?.qualityScore as number;
    const refundPercentage = options?.refundPercentage as number;
    const oracleVotes = (options?.oracleVotes as Array<{ oracleId: string; vote: number; commitment?: string }>) || [];
    const evidenceHash = options?.evidenceHash as string | undefined;
    const transactionHash = options?.transactionHash as string | undefined;

    if (!escrowId || !clientId || !providerId || amount === undefined || !outcome || qualityScore === undefined || refundPercentage === undefined) {
      const errorMsg = 'Missing required parameters for dispute outcome';
      if (callback) {
        await callback({ text: errorMsg });
      }
      return { ual: '', success: false };
    }

    try {
      const result = await publishDisputeOutcome(ctx, {
        escrowId,
        clientId,
        providerId,
        amount,
        currency,
        outcome,
        qualityScore,
        refundPercentage,
        oracleVotes,
        evidenceHash,
        transactionHash,
      });

      const responseText = `Published dispute outcome to DKG.
Escrow: ${escrowId}
Outcome: ${outcome}
Quality Score: ${qualityScore}
Refund: ${refundPercentage}%
UAL: ${result.ual}`;

      if (callback) {
        await callback({
          text: responseText,
          content: {
            ual: result.ual,
            escrowId,
            outcome,
            qualityScore,
            refundPercentage,
          },
        });
      }

      return { ual: result.ual, success: true };
    } catch (err) {
      const errorMsg = `Failed to publish dispute outcome: ${err instanceof Error ? err.message : err}`;
      if (callback) {
        await callback({ text: errorMsg });
      }
      return { ual: '', success: false };
    }
  },
};
