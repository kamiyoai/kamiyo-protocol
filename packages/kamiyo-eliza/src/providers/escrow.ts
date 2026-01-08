import type { Provider, IAgentRuntime, Memory, State, EscrowAccount } from '../types';

export const escrowProvider: Provider = {
  async get(runtime: IAgentRuntime, _message: Memory, _state?: State): Promise<string> {
    try {
      const escrows = (await runtime.getState?.('kamiyo_escrows')) as EscrowAccount[] | undefined;
      if (!escrows?.length) return '[kamiyo:escrows] none';

      const active = escrows.filter(e => e.status === 'active');
      const disputed = escrows.filter(e => e.status === 'disputed');
      const locked = active.reduce((sum, e) => sum + e.amount, 0);

      return `[kamiyo:escrows] active=${active.length} disputed=${disputed.length} locked=${locked.toFixed(4)}`;
    } catch {
      return '[kamiyo:escrows] unavailable';
    }
  },
};
