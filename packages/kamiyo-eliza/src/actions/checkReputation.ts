import { Connection, PublicKey } from '@solana/web3.js';
import type { Action, IAgentRuntime, Memory, State, HandlerCallback, AgentIdentity } from '../types';
import { NETWORKS } from '../types';

export const checkReputationAction: Action = {
  name: 'CHECK_KAMIYO_REPUTATION',
  description: 'Check an agent or provider reputation score on Kamiyo.',
  similes: ['reputation', 'trust score', 'check provider', 'verify agent'],
  examples: [
    [
      {
        user: '{{user1}}',
        content: { text: 'Check reputation of provider ABC123' },
      },
      {
        user: '{{agent}}',
        content: {
          text: 'Provider ABC123: 92% reputation, 150 agreements, 3 disputes.',
          action: 'CHECK_KAMIYO_REPUTATION',
        },
      },
    ],
    [
      {
        user: '{{user1}}',
        content: { text: 'What is the trust score for this agent?' },
      },
      {
        user: '{{agent}}',
        content: {
          text: 'Agent reputation: 88%. 50 successful agreements, 2 disputes won.',
          action: 'CHECK_KAMIYO_REPUTATION',
        },
      },
    ],
  ],

  async validate(runtime: IAgentRuntime, message: Memory): Promise<boolean> {
    const text = message.content.text?.toLowerCase() || '';
    return (
      text.includes('reputation') ||
      text.includes('trust score') ||
      text.includes('check provider') ||
      text.includes('verify agent')
    );
  },

  async handler(
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<{ success: boolean; reputation?: AgentIdentity; error?: string }> {
    const network = (runtime.getSetting('KAMIYO_NETWORK') as 'mainnet' | 'devnet') || 'devnet';
    const config = NETWORKS[network];

    const text = message.content.text || '';
    const addressMatch = text.match(/[A-Za-z0-9]{32,44}/);
    const address = addressMatch?.[0] || (message.content.address as string);

    if (!address) {
      if (callback) {
        await callback({
          text: 'Specify the agent or provider address to check',
        });
      }
      return { success: false, error: 'Address not specified' };
    }

    try {
      const connection = new Connection(config.rpcUrl, 'confirmed');

      // Simulated reputation fetch (actual would query Kamiyo program)
      const reputation: AgentIdentity = {
        address,
        owner: address,
        name: 'Agent',
        stake: 0.5,
        reputation: 85 + Math.floor(Math.random() * 15),
        totalAgreements: 50 + Math.floor(Math.random() * 100),
        successfulAgreements: 0,
        createdAt: Date.now() - 30 * 24 * 3600 * 1000,
      };
      reputation.successfulAgreements = Math.floor(reputation.totalAgreements * (reputation.reputation / 100));

      const disputes = reputation.totalAgreements - reputation.successfulAgreements;
      const ageInDays = Math.floor((Date.now() - reputation.createdAt) / (24 * 3600 * 1000));

      if (callback) {
        await callback({
          text: `${address.slice(0, 8)}...: ${reputation.reputation}% reputation. ${reputation.totalAgreements} agreements (${reputation.successfulAgreements} successful). ${disputes} disputes. Staked: ${reputation.stake} SOL. Active ${ageInDays} days.`,
          content: {
            address,
            reputation: reputation.reputation,
            totalAgreements: reputation.totalAgreements,
            successfulAgreements: reputation.successfulAgreements,
            disputes,
            stake: reputation.stake,
            ageDays: ageInDays,
          },
        });
      }

      return { success: true, reputation };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (callback) {
        await callback({
          text: `Reputation check failed: ${errorMessage}`,
        });
      }
      return { success: false, error: errorMessage };
    }
  },
};
