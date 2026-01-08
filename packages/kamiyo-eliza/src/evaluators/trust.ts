import { PublicKey } from '@solana/web3.js';
import { Wallet } from '@coral-xyz/anchor';
import type { Evaluator, IAgentRuntime, Memory, State } from '../types';
import { parseAddress, getNetworkConfig, getKeypair, createConnection } from '../utils';

export const trustEvaluator: Evaluator = {
  name: 'KAMIYO_TRUST',
  description: 'Evaluates provider trustworthiness before payment.',
  similes: ['trust check', 'provider verification'],
  examples: [
    {
      context: 'Agent evaluating provider before escrow',
      messages: [{ user: 'user', content: { text: 'Use provider 8xYz...' } }],
      outcome: 'TRUSTED',
    },
    {
      context: 'Agent checking risky provider',
      messages: [{ user: 'user', content: { text: 'Pay provider with 40% reputation' } }],
      outcome: 'HIGH_RISK',
    },
  ],

  async validate(_runtime: IAgentRuntime, message: Memory): Promise<boolean> {
    const text = message.content.text?.toLowerCase() || '';
    return text.includes('provider') || text.includes('escrow') || text.includes('pay');
  },

  async handler(
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State
  ): Promise<{ trusted: boolean; reputation: number; riskLevel: string; warnings: string[] }> {
    const text = message.content.text || '';
    const address = parseAddress(text) || (message.content.provider as string);

    if (!address) {
      return { trusted: false, reputation: 0, riskLevel: 'unknown', warnings: ['No provider address found'] };
    }

    const { rpcUrl, programId } = getNetworkConfig(runtime);
    const keypair = getKeypair(runtime);
    const minRep = parseInt(runtime.getSetting('KAMIYO_MIN_REPUTATION') || '60', 10);

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
        return { trusted: false, reputation: 0, riskLevel: 'unknown', warnings: ['No on-chain agent found'] };
      }

      const reputation = agent.reputation?.toNumber() || 0;
      const agreements = agent.totalEscrows?.toNumber() || 0;
      const disputes = agent.disputedEscrows?.toNumber() || 0;
      const disputeRate = agreements > 0 ? (disputes / agreements) * 100 : 0;

      const warnings: string[] = [];
      let riskLevel = 'low';

      if (reputation < 50) {
        warnings.push(`Very low reputation: ${reputation}%`);
        riskLevel = 'high';
      } else if (reputation < 70) {
        warnings.push(`Below average reputation: ${reputation}%`);
        riskLevel = 'medium';
      }

      if (disputeRate > 20) {
        warnings.push(`High dispute rate: ${disputeRate.toFixed(0)}%`);
        riskLevel = 'high';
      } else if (disputeRate > 10) {
        warnings.push(`Elevated dispute rate: ${disputeRate.toFixed(0)}%`);
        if (riskLevel !== 'high') riskLevel = 'medium';
      }

      if (agreements < 5) {
        warnings.push(`New provider: only ${agreements} agreements`);
        if (riskLevel === 'low') riskLevel = 'medium';
      }

      const stake = (agent.stakeAmount?.toNumber() || 0) / 1e9;
      if (stake < 0.1) {
        warnings.push(`Low stake: ${stake.toFixed(2)} SOL`);
        if (riskLevel === 'low') riskLevel = 'medium';
      }

      return {
        trusted: reputation >= minRep && riskLevel !== 'high',
        reputation,
        riskLevel,
        warnings,
      };
    } catch (err) {
      return {
        trusted: false,
        reputation: 0,
        riskLevel: 'error',
        warnings: [`Failed to fetch: ${err instanceof Error ? err.message : 'Unknown'}`],
      };
    }
  },
};
