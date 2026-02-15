import { PublicKey } from '@solana/web3.js';
import { Wallet } from '@coral-xyz/anchor';
import type { Action, IAgentRuntime, Memory, State, HandlerCallback } from '../types';
import { getNetworkConfig, getKeypair, createConnection, lamportsToSol } from '../utils';
import { getTrustEngine } from '../trust/pluginTrust';

const DEFAULT_MIN_STAKE_LAMPORTS = 100_000_000; // 0.1 SOL

export const requireKamiyoStakeAction: Action = {
  name: 'REQUIRE_KAMIYO_STAKE_FOR_ACTION',
  description: 'Gate actions behind KAMIYO stake. Verifies on-chain stake meets minimum and optionally checks plugin-trust TrustEngine score.',
  similes: ['check stake', 'verify collateral', 'stake gate', 'require stake'],
  examples: [
    [
      { user: '{{user1}}', content: { text: 'Check if I have enough stake to proceed' } },
      { user: '{{agent}}', content: { text: 'Stake verified: 0.5 SOL (min: 0.1 SOL). Proceed.', action: 'REQUIRE_KAMIYO_STAKE_FOR_ACTION' } },
    ],
    [
      { user: '{{user1}}', content: { text: 'Verify my stake before payment' } },
      { user: '{{agent}}', content: { text: 'Insufficient stake: 0.02 SOL (min: 0.1 SOL). Blocked.', action: 'REQUIRE_KAMIYO_STAKE_FOR_ACTION' } },
    ],
  ],

  async validate(_runtime: IAgentRuntime, message: Memory): Promise<boolean> {
    const text = message.content.text?.toLowerCase() || '';
    return (
      text.includes('stake') ||
      text.includes('collateral') ||
      (text.includes('verify') && (text.includes('stake') || text.includes('collateral')))
    );
  },

  async handler(
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<{ allowed: boolean; currentStake: number; requiredStake: number; trustScore?: number; error?: string }> {
    const keypair = getKeypair(runtime);
    if (!keypair) {
      callback?.({ text: 'Wallet not configured. Set SOLANA_PRIVATE_KEY.' });
      return { allowed: false, currentStake: 0, requiredStake: 0, error: 'Wallet not configured' };
    }

    const minStakeLamports = parseInt(
      runtime.getSetting('KAMIYO_MIN_STAKE_FOR_TRUST') || String(DEFAULT_MIN_STAKE_LAMPORTS),
      10
    );

    try {
      const { rpcUrl, programId } = getNetworkConfig(runtime);
      const connection = createConnection(rpcUrl);
      const { KamiyoClient } = await import('@kamiyo/sdk');

      const client = new KamiyoClient({
        connection,
        wallet: new Wallet(keypair),
        programId: new PublicKey(programId),
      });

      const [agentPda] = client.getAgentPDA(keypair.publicKey);
      const agent = await client.getAgent(agentPda);

      if (!agent) {
        callback?.({ text: 'No KAMIYO agent profile. Register and stake first.' });
        return { allowed: false, currentStake: 0, requiredStake: lamportsToSol(minStakeLamports), error: 'No agent profile' };
      }

      if (!agent.isActive) {
        callback?.({ text: 'KAMIYO agent is inactive. Reactivate first.' });
        return { allowed: false, currentStake: 0, requiredStake: lamportsToSol(minStakeLamports), error: 'Agent inactive' };
      }

      const currentStakeLamports = agent.stakeAmount?.toNumber() || 0;
      const currentStake = lamportsToSol(currentStakeLamports);
      const requiredStake = lamportsToSol(minStakeLamports);
      const stakeOk = currentStakeLamports >= minStakeLamports;

      // Optionally check plugin-trust TrustEngine
      let trustScore: number | undefined;
      const engine = getTrustEngine(runtime);
      if (engine?.calculateTrust) {
        const profile = await engine.calculateTrust(keypair.publicKey.toBase58(), {
          evaluatorId: runtime.agentId,
          roomId: message.roomId,
          actionId: requireKamiyoStakeAction.name,
        });
        trustScore = profile?.overallTrust;
      }

      const allowed = stakeOk;
      const trustInfo = trustScore != null ? ` Trust score: ${trustScore}/100.` : '';

      if (allowed) {
        callback?.({
          text: `Stake verified: ${currentStake.toFixed(4)} SOL (min: ${requiredStake.toFixed(4)} SOL).${trustInfo} Proceed.`,
          content: { allowed: true, currentStake, requiredStake, trustScore },
        });
      } else {
        callback?.({
          text: `Insufficient stake: ${currentStake.toFixed(4)} SOL (min: ${requiredStake.toFixed(4)} SOL).${trustInfo} Action blocked.`,
          content: { allowed: false, currentStake, requiredStake, trustScore },
        });
      }

      return { allowed, currentStake, requiredStake, trustScore };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      callback?.({ text: `Stake check failed: ${error}` });
      return { allowed: false, currentStake: 0, requiredStake: lamportsToSol(minStakeLamports), error };
    }
  },
};
