import { PublicKey } from '@solana/web3.js';
import { Wallet } from '@coral-xyz/anchor';
import type { Action, IAgentRuntime, Memory, State, HandlerCallback } from '../types';
import { getNetworkConfig, getKeypair, createConnection, parseAddress } from '../utils';

export const checkReputationAction: Action = {
  name: 'CHECK_KAMIYO_REPUTATION',
  description: 'Check on-chain reputation of an agent or provider.',
  similes: ['reputation', 'trust score', 'check provider', 'provider stats'],
  examples: [
    [
      { user: '{{user1}}', content: { text: 'Check reputation of 8xYz...' } },
      { user: '{{agent}}', content: { text: '8xYz...: 92% reputation, 150 agreements, 3 disputes.', action: 'CHECK_KAMIYO_REPUTATION' } },
    ],
    [
      { user: '{{user1}}', content: { text: 'Is provider ABC123 trustworthy?' } },
      { user: '{{agent}}', content: { text: 'ABC123: 85% rep, 0.5 SOL staked, low risk.', action: 'CHECK_KAMIYO_REPUTATION' } },
    ],
  ],

  async validate(_runtime: IAgentRuntime, message: Memory): Promise<boolean> {
    const text = message.content.text?.toLowerCase() || '';
    return (
      text.includes('reputation') ||
      text.includes('trust') ||
      text.includes('check provider') ||
      text.includes('trustworthy')
    );
  },

  async handler(
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<{ success: boolean; reputation?: number; stake?: number; agreements?: number; error?: string }> {
    const { rpcUrl, programId } = getNetworkConfig(runtime);
    const keypair = getKeypair(runtime);
    const text = message.content.text || '';

    const address = parseAddress(text) || (message.content.address as string);
    if (!address) {
      callback?.({ text: 'Specify address to check' });
      return { success: false, error: 'Address not specified' };
    }

    try {
      const connection = createConnection(rpcUrl);
      const { KamiyoClient } = await import('@kamiyo/sdk');

      const wallet = keypair ? new Wallet(keypair) : {
        publicKey: new PublicKey(address),
        signTransaction: async () => { throw new Error('Read-only'); },
        signAllTransactions: async () => { throw new Error('Read-only'); },
      };

      const client = new KamiyoClient({
        connection,
        wallet: wallet as any,
        programId: new PublicKey(programId),
      });

      const [agentPda] = client.getAgentPDA(new PublicKey(address));
      const agent = await client.getAgent(agentPda);

      if (!agent) {
        callback?.({ text: `${address.slice(0, 8)}...: No on-chain agent found` });
        return { success: false, error: 'Agent not found' };
      }

      const reputation = agent.reputation?.toNumber() || 0;
      const stake = (agent.stakeAmount?.toNumber() || 0) / 1e9;
      const agreements = agent.totalEscrows?.toNumber() || 0;
      const disputes = agent.disputedEscrows?.toNumber() || 0;
      const disputeRate = agreements > 0 ? Math.round((disputes / agreements) * 100) : 0;

      let risk = 'low';
      if (reputation < 60 || disputeRate > 20) risk = 'high';
      else if (reputation < 75 || disputeRate > 10) risk = 'medium';

      callback?.({
        text: `${address.slice(0, 8)}...: ${reputation}% rep, ${stake.toFixed(2)} SOL staked, ${agreements} agreements, ${disputeRate}% dispute rate, ${risk} risk`,
        content: { address, reputation, stake, agreements, disputes, disputeRate, risk },
      });

      return { success: true, reputation, stake, agreements };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      callback?.({ text: `Reputation check failed: ${error}` });
      return { success: false, error };
    }
  },
};
