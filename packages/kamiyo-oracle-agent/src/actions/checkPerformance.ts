import type { Action, IAgentRuntime, Memory, State, HandlerCallback, OraclePerformance } from '../types';

export const checkPerformanceAction: Action = {
  name: 'CHECK_ORACLE_PERFORMANCE',
  description: 'Check oracle performance metrics including accuracy, rewards, and violations',
  similes: ['performance', 'stats', 'metrics', 'how am i doing', 'oracle status'],

  examples: [
    [
      {
        user: '{{user1}}',
        content: { text: 'Check my oracle performance' },
      },
      {
        user: '{{agent}}',
        content: {
          text: 'Oracle Performance:\n- Total Votes: 47\n- Accuracy: 94%\n- Violations: 0/3\n- Rewards: 0.23 SOL\n- P&L: +0.18 SOL',
          action: 'CHECK_ORACLE_PERFORMANCE',
        },
      },
    ],
  ],

  async validate(_runtime: IAgentRuntime, message: Memory): Promise<boolean> {
    const text = message.content.text?.toLowerCase() || '';
    return (
      text.includes('performance') ||
      text.includes('stats') ||
      text.includes('metrics') ||
      text.includes('how am i doing') ||
      text.includes('oracle status')
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
    performance?: OraclePerformance;
    error?: string;
  }> {
    try {
      // Get performance from state
      const state = await runtime.getState?.('oracle_state') as {
        performance?: OraclePerformance;
        votedDisputes?: string[];
      } | undefined;

      const performance: OraclePerformance = state?.performance || {
        totalVotes: state?.votedDisputes?.length || 0,
        accurateVotes: 0,
        slashEvents: 0,
        totalRewardsEarned: 0,
        totalSlashLoss: 0,
        currentStake: 1.0,
        violationCount: 0,
        accuracyRate: 0,
        profitLoss: 0,
      };

      // Calculate derived metrics
      performance.accuracyRate = performance.totalVotes > 0
        ? (performance.accurateVotes / performance.totalVotes) * 100
        : 0;

      performance.profitLoss = performance.totalRewardsEarned - performance.totalSlashLoss;

      const response = buildPerformanceReport(performance);
      callback?.({ text: response });

      return { success: true, performance };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      callback?.({ text: `Failed to check performance: ${errorMsg}` });
      return { success: false, error: errorMsg };
    }
  },
};

function buildPerformanceReport(performance: OraclePerformance): string {
  const violationsRemaining = 3 - performance.violationCount;
  const riskLevel = violationsRemaining <= 1 ? 'HIGH' : violationsRemaining === 2 ? 'MEDIUM' : 'LOW';

  const lines = [
    'Oracle Performance Report',
    '═'.repeat(30),
    '',
    'Voting Activity:',
    `  Total Votes: ${performance.totalVotes}`,
    `  Accurate Votes: ${performance.accurateVotes}`,
    `  Accuracy Rate: ${performance.accuracyRate.toFixed(1)}%`,
    '',
    'Economic Status:',
    `  Current Stake: ${performance.currentStake.toFixed(4)} SOL`,
    `  Total Rewards: ${performance.totalRewardsEarned.toFixed(6)} SOL`,
    `  Total Slashed: ${performance.totalSlashLoss.toFixed(6)} SOL`,
    `  Net P&L: ${performance.profitLoss >= 0 ? '+' : ''}${performance.profitLoss.toFixed(6)} SOL`,
    '',
    'Risk Status:',
    `  Violations: ${performance.violationCount}/3`,
    `  Violations Until Removal: ${violationsRemaining}`,
    `  Risk Level: ${riskLevel}`,
    '',
  ];

  if (violationsRemaining <= 1) {
    lines.push('⚠ WARNING: One more violation will result in removal from oracle registry!');
    lines.push('Consider voting more conservatively or abstaining on uncertain disputes.');
  }

  return lines.join('\n');
}
