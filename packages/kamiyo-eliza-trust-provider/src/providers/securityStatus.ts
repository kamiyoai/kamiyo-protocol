import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { Wallet } from '@coral-xyz/anchor';
import type { Provider, IAgentRuntime, Memory, State, KamiyoNetwork } from '../types';
import { NETWORKS } from '../types';

/**
 * Provides on-chain security posture from KAMIYO for plugin-trust's
 * SecurityModule context.
 *
 * Maps to plugin-trust threat levels:
 *   violations > 0         → 'ELEVATED' alert
 *   slashed + inactive     → 'HIGH_ALERT'
 *   dispute loss pattern   → threat indicator
 *   low stake              → reduced security posture
 */
export const kamiyoSecurityStatusProvider: Provider = {
  async get(runtime: IAgentRuntime, _message: Memory, state?: State): Promise<string> {
    const network = (runtime.getSetting('KAMIYO_NETWORK') as KamiyoNetwork) || 'mainnet';
    const { rpcUrl, programId } = NETWORKS[network];

    let ownerKey: PublicKey | null = null;
    const targetAddress = state?.agentId as string | undefined;
    if (targetAddress) {
      try { ownerKey = new PublicKey(targetAddress); } catch { /* invalid */ }
    }

    if (!ownerKey) {
      const pk = runtime.getSetting('SOLANA_PRIVATE_KEY');
      if (!pk) return '[kamiyo:security] no wallet';
      try {
        ownerKey = Keypair.fromSecretKey(Buffer.from(pk, 'base64')).publicKey;
      } catch {
        return '[kamiyo:security] invalid keypair';
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
      if (!agent) return '[kamiyo:security] no on-chain agent';

      const stake = (agent.stakeAmount?.toNumber() || 0) / 1e9;
      const violations = (agent as any).violationCount || 0;

      // Fetch reputation for dispute breakdown
      const [repPda] = client.getReputationPDA(ownerKey);
      const rep = await client.getReputation(repPda).catch(() => null);
      const disputesFiled = rep?.disputesFiled?.toNumber() || 0;
      const disputesWon = rep?.disputesWon?.toNumber() || 0;
      const disputesLost = rep?.disputesLost?.toNumber() || 0;

      // Build threat indicators
      const threats: string[] = [];
      if (violations > 0) threats.push(`${violations}_violations`);
      if (stake < 0.1) threats.push('low_stake');
      if (disputesLost > disputesWon && disputesFiled > 2) threats.push('dispute_loss_pattern');
      if (!agent.isActive) threats.push('agent_inactive');

      // Map to plugin-trust alert levels
      let alertLevel: 'NORMAL' | 'ELEVATED' | 'HIGH_ALERT' = 'NORMAL';
      if (threats.length >= 2 || violations >= 2) alertLevel = 'HIGH_ALERT';
      else if (threats.length === 1) alertLevel = 'ELEVATED';

      return [
        `[kamiyo:security]`,
        `alert=${alertLevel}`,
        `violations=${violations}`,
        `disputes_filed=${disputesFiled}`,
        `disputes_won=${disputesWon}`,
        `disputes_lost=${disputesLost}`,
        `stake_adequate=${stake >= 0.1}`,
        `active=${agent.isActive}`,
        threats.length > 0 ? `threats=${threats.join(',')}` : 'threats=none',
      ].join(' ');
    } catch {
      return '[kamiyo:security] fetch failed';
    }
  },
};
