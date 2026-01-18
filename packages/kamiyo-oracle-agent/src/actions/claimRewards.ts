import type { Action, IAgentRuntime, Memory, State, HandlerCallback } from '../types';
import { claimOracleRewards } from '../lib/voteSubmitter';

export const claimRewardsAction: Action = {
  name: 'CLAIM_ORACLE_REWARDS',
  description: 'Claim accumulated oracle rewards from the KAMIYO treasury',
  similes: ['claim', 'withdraw', 'get rewards', 'collect earnings'],

  examples: [
    [
      {
        user: '{{user1}}',
        content: { text: 'Claim my oracle rewards' },
      },
      {
        user: '{{agent}}',
        content: {
          text: 'Rewards claimed!\nAmount: 0.15 SOL\nTransaction: 7xZy...',
          action: 'CLAIM_ORACLE_REWARDS',
        },
      },
    ],
    [
      {
        user: '{{user1}}',
        content: { text: 'Withdraw my earnings' },
      },
      {
        user: '{{agent}}',
        content: {
          text: 'No rewards available to claim.',
          action: 'CLAIM_ORACLE_REWARDS',
        },
      },
    ],
  ],

  async validate(_runtime: IAgentRuntime, message: Memory): Promise<boolean> {
    const text = message.content.text?.toLowerCase() || '';
    return (
      text.includes('claim') ||
      text.includes('withdraw') ||
      text.includes('collect') ||
      (text.includes('get') && text.includes('reward'))
    );
  },

  async handler(
    runtime: IAgentRuntime,
    _message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<{
    success: boolean;
    transaction?: string;
    amount?: number;
    error?: string;
  }> {
    try {
      callback?.({ text: 'Checking for available rewards...' });

      const txSignature = await claimOracleRewards(runtime);

      if (!txSignature) {
        callback?.({ text: 'No rewards available to claim.' });
        return { success: true, amount: 0 };
      }

      // Update state to track claimed rewards
      const state = await runtime.getState?.('oracle_state') as {
        performance?: { totalRewardsEarned: number };
      } | undefined;

      // Note: In production, we'd fetch the actual claimed amount from the transaction
      const claimedAmount = state?.performance?.totalRewardsEarned || 0;

      callback?.({
        text: `Rewards claimed successfully!\n\nAmount: ${claimedAmount.toFixed(6)} SOL\nTransaction: ${txSignature}`,
      });

      // Reset rewards in state
      if (state?.performance) {
        await runtime.setState?.('oracle_state', {
          ...state,
          performance: {
            ...state.performance,
            totalRewardsEarned: 0,
          },
        });
      }

      return {
        success: true,
        transaction: txSignature,
        amount: claimedAmount,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      callback?.({ text: `Failed to claim rewards: ${errorMsg}` });
      return { success: false, error: errorMsg };
    }
  },
};
