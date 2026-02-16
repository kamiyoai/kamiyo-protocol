import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { Wallet } from '@coral-xyz/anchor';
import type { Provider, IAgentRuntime, Memory, State, KamiyoNetwork } from '../types';
import { NETWORKS } from '../types';
import { parseSecretKey } from '../utils/secretKey';

/**
 * Provides on-chain economic trust data from KAMIYO for plugin-trust context.
 *
 * Returns structured text that plugin-trust's TrustEngine and LLMEvaluator
 * can consume: stake amount, reputation, escrow success/dispute rates.
 *
 * The values map to plugin-trust dimensions:
 *   reliability  ← escrow success rate
 *   competence   ← reputation score
 *   benevolence  ← stake amount (skin in the game)
 *   integrity    ← dispute rate (inverse)
 *   transparency ← on-chain verifiability (always high for KAMIYO agents)
 */
export const kamiyoTrustProfileProvider: Provider = {
  async get(runtime: IAgentRuntime, _message: Memory, state?: State): Promise<string> {
    const network = (runtime.getSetting('KAMIYO_NETWORK') as KamiyoNetwork) || 'mainnet';
    const { rpcUrl, programId } = NETWORKS[network];

    let ownerKey: PublicKey | null = null;

    // Use state agentId if available, otherwise derive from keypair
    const targetAddress = state?.agentId as string | undefined;
    if (targetAddress) {
      try { ownerKey = new PublicKey(targetAddress); } catch { /* invalid */ }
    }

    if (!ownerKey) {
      const pk = runtime.getSetting('SOLANA_PRIVATE_KEY');
      if (!pk) return '[kamiyo:trust-profile] no wallet configured';
      try {
        const secret = parseSecretKey(pk);
        if (!secret) return '[kamiyo:trust-profile] invalid keypair';
        ownerKey = Keypair.fromSecretKey(secret).publicKey;
      } catch {
        return '[kamiyo:trust-profile] invalid keypair';
      }
    }

    try {
      const connection = new Connection(rpcUrl, 'confirmed');
      const { KamiyoClient } = await import('@kamiyo/sdk');

      const wallet: Wallet = {
        publicKey: ownerKey,
        signTransaction: async () => { throw new Error('Read-only'); },
        signAllTransactions: async () => { throw new Error('Read-only'); },
      } as unknown as Wallet;

      const client = new KamiyoClient({ connection, wallet, programId: new PublicKey(programId) });

      const [agentPda] = client.getAgentPDA(ownerKey);
      const agent = await client.getAgent(agentPda);
      if (!agent) return '[kamiyo:trust-profile] no on-chain agent';

      const stake = (agent.stakeAmount?.toNumber() || 0) / 1e9;
      const total = agent.totalEscrows?.toNumber() || 0;
      const successful = agent.successfulEscrows?.toNumber() || 0;
      const disputed = agent.disputedEscrows?.toNumber() || 0;
      const successRate = total > 0 ? ((successful / total) * 100).toFixed(0) : '0';
      const disputeRate = total > 0 ? ((disputed / total) * 100).toFixed(0) : '0';
      const reputation = agent.reputation?.toNumber() || 0;

      return [
        `[kamiyo:trust-profile]`,
        `stake=${stake.toFixed(4)}SOL`,
        `reputation=${reputation}/100`,
        `escrows=${total}`,
        `success_rate=${successRate}%`,
        `dispute_rate=${disputeRate}%`,
        `active=${agent.isActive}`,
        `on_chain=true`,
      ].join(' ');
    } catch {
      return '[kamiyo:trust-profile] fetch failed';
    }
  },
};
