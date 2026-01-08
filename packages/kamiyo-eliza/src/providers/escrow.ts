import type { Provider, IAgentRuntime, Memory, State, EscrowAccount } from '../types';

export const escrowProvider: Provider = {
  async get(runtime: IAgentRuntime, message: Memory, state?: State): Promise<string> {
    try {
      const escrowState = await runtime.getState?.('kamiyo_escrows');
      const escrows = (escrowState as EscrowAccount[]) || [];

      if (escrows.length === 0) {
        return '[kamiyo:escrows] none active';
      }

      const active = escrows.filter(e => e.status === 'active');
      const disputed = escrows.filter(e => e.status === 'disputed');
      const totalLocked = active.reduce((sum, e) => sum + e.amount, 0);

      const recentEscrows = active
        .slice(-3)
        .map(e => `${e.provider.slice(0, 6)}:${e.amount}SOL`)
        .join(', ');

      return `[kamiyo:escrows] active=${active.length} disputed=${disputed.length} locked=${totalLocked.toFixed(4)}SOL recent=[${recentEscrows}]`;
    } catch {
      return '[kamiyo:escrows] unavailable';
    }
  },
};
