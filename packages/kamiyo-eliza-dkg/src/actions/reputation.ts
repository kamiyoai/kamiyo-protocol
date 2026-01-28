import type { Action, IAgentRuntime, Memory, State, HandlerCallback } from '../types.js';
import { getBridgeContext, publishReputationCommitment, queryReputationCommitment } from '../bridge.js';

export const publishReputationToDKGAction: Action = {
  name: 'PUBLISH_REPUTATION_COMMITMENT_TO_DKG',
  description: 'Publish a ZK reputation commitment to the OriginTrail Decentralized Knowledge Graph',
  similes: ['store reputation', 'publish commitment', 'dkg reputation', 'backup reputation'],
  examples: [
    [
      {
        user: 'agent',
        content: { text: 'Publish my reputation commitment to DKG' },
      },
      {
        user: 'assistant',
        content: {
          text: 'Published reputation commitment to DKG',
          action: 'PUBLISH_REPUTATION_COMMITMENT_TO_DKG',
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
    _message: Memory,
    _state?: State,
    options?: { [key: string]: unknown },
    callback?: HandlerCallback
  ): Promise<{ ual: string; success: boolean }> => {
    const ctx = await getBridgeContext(runtime);

    const agentId = (options?.agentId as string) || runtime.agentId;
    const commitment = options?.commitment as string;
    const validDays = (options?.validDays as number) || 30;

    if (!commitment) {
      // Generate commitment if not provided
      try {
        const { computeCommitment, generateSecret } = await import('@kamiyo/solana-privacy');
        const reputationScore = (options?.reputationScore as number) || 50;
        const secret = generateSecret();
        const generatedCommitment = computeCommitment(reputationScore, secret);

        const result = await publishReputationCommitment(ctx, {
          agentId,
          commitment: generatedCommitment.toString(),
          validDays,
        });

        const commitmentStr = generatedCommitment.toString();
        const responseText = `Published reputation commitment to DKG.
Agent: ${agentId}
Commitment: ${commitmentStr.slice(0, 20)}...
Valid for: ${validDays} days
UAL: ${result.ual}`;

        if (callback) {
          await callback({
            text: responseText,
            content: {
              ual: result.ual,
              agentId,
              commitment: commitmentStr,
            },
          });
        }

        return { ual: result.ual, success: true };
      } catch (err) {
        const errorMsg = `Failed to generate commitment: ${err instanceof Error ? err.message : err}`;
        if (callback) {
          await callback({ text: errorMsg });
        }
        return { ual: '', success: false };
      }
    }

    try {
      const result = await publishReputationCommitment(ctx, {
        agentId,
        commitment,
        validDays,
      });

      const responseText = `Published reputation commitment to DKG.
Agent: ${agentId}
Commitment: ${commitment.slice(0, 20)}...
Valid for: ${validDays} days
UAL: ${result.ual}`;

      if (callback) {
        await callback({
          text: responseText,
          content: { ual: result.ual, agentId, commitment },
        });
      }

      return { ual: result.ual, success: true };
    } catch (err) {
      const errorMsg = `Failed to publish reputation commitment: ${err instanceof Error ? err.message : err}`;
      if (callback) {
        await callback({ text: errorMsg });
      }
      return { ual: '', success: false };
    }
  },
};

export const queryReputationFromDKGAction: Action = {
  name: 'QUERY_REPUTATION_FROM_DKG',
  description: 'Query an agent\'s reputation commitment from the OriginTrail Decentralized Knowledge Graph',
  similes: ['lookup reputation', 'check commitment', 'dkg reputation check', 'verify agent'],
  examples: [
    [
      {
        user: 'agent',
        content: { text: 'Check the reputation commitment for agent xyz on DKG' },
      },
      {
        user: 'assistant',
        content: {
          text: 'Found reputation commitment for agent xyz',
          action: 'QUERY_REPUTATION_FROM_DKG',
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
  ): Promise<{ commitment: string | null; ual: string | null; found: boolean }> => {
    const ctx = await getBridgeContext(runtime);

    const agentId = (options?.agentId as string) || extractAgentId(message.content.text) || runtime.agentId;

    try {
      const result = await queryReputationCommitment(ctx, agentId);

      if (!result) {
        const responseText = `No reputation commitment found for agent ${agentId} on DKG.`;
        if (callback) {
          await callback({ text: responseText });
        }
        return { commitment: null, ual: null, found: false };
      }

      const responseText = `Reputation commitment from DKG:
Agent: ${agentId}
Commitment: ${result.commitment.slice(0, 30)}...
Valid From: ${result.validFrom.split('T')[0]}
UAL: ${result.ual}`;

      if (callback) {
        await callback({
          text: responseText,
          content: {
            agentId,
            commitment: result.commitment,
            validFrom: result.validFrom,
            ual: result.ual,
          },
        });
      }

      return { commitment: result.commitment, ual: result.ual, found: true };
    } catch (err) {
      const errorMsg = `Failed to query reputation: ${err instanceof Error ? err.message : err}`;
      if (callback) {
        await callback({ text: errorMsg });
      }
      return { commitment: null, ual: null, found: false };
    }
  },
};

function extractAgentId(text: string): string | undefined {
  const agentMatch = text.match(/(?:agent|for)\s+(0x[a-fA-F0-9]{40}|[a-zA-Z0-9_-]+)/i);
  if (agentMatch) return agentMatch[1];
  return undefined;
}
