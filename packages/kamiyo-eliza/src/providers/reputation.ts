import type { Provider, IAgentRuntime, Memory, State, PaymentRecord, DisputeRecord } from '../types';

export const reputationProvider: Provider = {
  async get(runtime: IAgentRuntime, _message: Memory, _state?: State): Promise<string> {
    try {
      const payments = (await runtime.getState?.('kamiyo_payments')) as PaymentRecord[] | undefined;
      const disputes = (await runtime.getState?.('kamiyo_disputes')) as DisputeRecord[] | undefined;

      if (!payments?.length) return '[kamiyo:stats] no history';

      const spent = payments.reduce((sum, p) => sum + p.amount, 0);
      const avgQuality = payments.reduce((sum, p) => sum + p.quality, 0) / payments.length;
      const pending = disputes?.filter(d => d.status === 'pending').length || 0;

      return `[kamiyo:stats] ${payments.length} payments ${spent.toFixed(4)} SOL avgQuality=${avgQuality.toFixed(0)}% disputes=${pending}`;
    } catch {
      return '[kamiyo:stats] unavailable';
    }
  },
};
