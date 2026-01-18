import type { Service, IAgentRuntime, OraclePerformance } from '../types';
import { claimOracleRewards } from '../lib/voteSubmitter';

const CLAIM_INTERVAL_MS = 3600000; // 1 hour
const MIN_REWARDS_TO_CLAIM = 0.01; // 0.01 SOL minimum

export const rewardClaimerService: Service = {
  name: 'kamiyo-reward-claimer',
  description: 'Periodically claims accumulated oracle rewards',

  async start(runtime: IAgentRuntime): Promise<void> {
    console.log('[reward-claimer] Starting service...');

    const claimRewards = async () => {
      try {
        await attemptRewardClaim(runtime);
      } catch (err) {
        console.error('[reward-claimer] Error:', err);
      }
    };

    const timer = setInterval(claimRewards, CLAIM_INTERVAL_MS);
    (this as any)._timer = timer;

    // Initial check after 5 minutes
    setTimeout(claimRewards, 300000);

    console.log('[reward-claimer] Service started');
  },

  async stop(): Promise<void> {
    if ((this as any)._timer) {
      clearInterval((this as any)._timer);
      console.log('[reward-claimer] Service stopped');
    }
  },
};

async function attemptRewardClaim(runtime: IAgentRuntime): Promise<void> {
  const state = await runtime.getState?.('oracle_state') as {
    performance?: OraclePerformance;
  } | undefined;

  const pendingRewards = state?.performance?.totalRewardsEarned || 0;

  if (pendingRewards < MIN_REWARDS_TO_CLAIM) {
    console.log(`[reward-claimer] Pending rewards (${pendingRewards.toFixed(6)} SOL) below minimum (${MIN_REWARDS_TO_CLAIM} SOL)`);
    return;
  }

  console.log(`[reward-claimer] Attempting to claim ${pendingRewards.toFixed(6)} SOL...`);

  try {
    const txSignature = await claimOracleRewards(runtime);

    if (txSignature) {
      console.log(`[reward-claimer] Rewards claimed! TX: ${txSignature}`);

      // Reset pending rewards in state
      if (state?.performance) {
        await runtime.setState?.('oracle_state', {
          ...state,
          performance: {
            ...state.performance,
            totalRewardsEarned: 0,
          },
        });
      }
    } else {
      console.log('[reward-claimer] No rewards available on-chain');
    }
  } catch (err) {
    console.error('[reward-claimer] Claim failed:', err);
  }
}
