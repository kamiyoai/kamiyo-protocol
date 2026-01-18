import type { Provider, IAgentRuntime, Memory, State, OraclePerformance } from '../types';

export const performanceProvider: Provider = {
  name: 'oracle-performance',
  description: 'Provides oracle performance metrics summary',

  async get(runtime: IAgentRuntime, _message: Memory, _state?: State): Promise<string> {
    try {
      const state = await runtime.getState?.('oracle_state') as {
        performance?: OraclePerformance;
      } | undefined;

      const perf = state?.performance;

      if (!perf || perf.totalVotes === 0) {
        return '[oracle:performance] no_votes_yet';
      }

      const accuracyRate = perf.totalVotes > 0
        ? ((perf.accurateVotes / perf.totalVotes) * 100).toFixed(1)
        : '0.0';

      const pnl = perf.totalRewardsEarned - perf.totalSlashLoss;
      const pnlStr = pnl >= 0 ? `+${pnl.toFixed(6)}` : pnl.toFixed(6);

      const riskFlag = perf.violationCount >= 2 ? ' RISK:HIGH' : '';

      return `[oracle:performance] votes=${perf.totalVotes} accuracy=${accuracyRate}% rewards=${perf.totalRewardsEarned.toFixed(6)}SOL slashed=${perf.totalSlashLoss.toFixed(6)}SOL pnl=${pnlStr}SOL${riskFlag}`;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return `[oracle:performance] error: ${msg}`;
    }
  },
};
