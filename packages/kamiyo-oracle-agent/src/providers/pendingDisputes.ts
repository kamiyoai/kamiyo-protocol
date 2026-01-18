import type { Provider, IAgentRuntime, Memory, State, PendingDispute } from '../types';

export const pendingDisputesProvider: Provider = {
  name: 'pending-disputes',
  description: 'Provides list of pending disputes awaiting oracle votes',

  async get(runtime: IAgentRuntime, _message: Memory, _state?: State): Promise<string> {
    try {
      const state = await runtime.getState?.('oracle_state') as {
        pendingDisputes?: PendingDispute[];
        votedDisputes?: string[];
      } | undefined;

      const pending = state?.pendingDisputes || [];
      const voted = state?.votedDisputes || [];

      if (pending.length === 0) {
        return `[oracle:disputes] pending=0 voted=${voted.length}`;
      }

      // Summarize pending disputes
      const totalAmount = pending.reduce((sum, d) => sum + d.amount, 0);
      const oldest = Math.min(...pending.map(d => d.addedAt));
      const ageMinutes = Math.floor((Date.now() - oldest) / 60000);

      const summary = pending
        .slice(0, 3)
        .map(d => `${d.escrowPda.slice(0, 6)}...(${d.amount.toFixed(2)}SOL)`)
        .join(', ');

      const moreCount = pending.length > 3 ? ` +${pending.length - 3} more` : '';

      return `[oracle:disputes] pending=${pending.length} voted=${voted.length} total_value=${totalAmount.toFixed(2)}SOL oldest=${ageMinutes}min [${summary}${moreCount}]`;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return `[oracle:disputes] error: ${msg}`;
    }
  },
};
