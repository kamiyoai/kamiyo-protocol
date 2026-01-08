import type { Provider, IAgentRuntime, Memory, State, PaymentRecord, DisputeRecord } from '../types';

export const reputationProvider: Provider = {
  async get(runtime: IAgentRuntime, message: Memory, state?: State): Promise<string> {
    try {
      const paymentsState = await runtime.getState?.('kamiyo_payments');
      const disputesState = await runtime.getState?.('kamiyo_disputes');

      const payments = (paymentsState as PaymentRecord[]) || [];
      const disputes = (disputesState as DisputeRecord[]) || [];

      if (payments.length === 0) {
        return '[kamiyo:reputation] no history';
      }

      const totalSpent = payments.reduce((sum, p) => sum + p.amount, 0);
      const avgQuality = payments.length > 0
        ? payments.reduce((sum, p) => sum + p.quality, 0) / payments.length
        : 0;
      const disputeRate = payments.length > 0
        ? (disputes.length / payments.length) * 100
        : 0;
      const successRate = payments.length > 0
        ? (payments.filter(p => !p.disputed).length / payments.length) * 100
        : 0;

      const pendingDisputes = disputes.filter(d => d.status === 'pending').length;
      const resolvedDisputes = disputes.filter(d => d.status === 'resolved').length;

      return `[kamiyo:reputation] payments=${payments.length} spent=${totalSpent.toFixed(4)}SOL avgQuality=${avgQuality.toFixed(1)}% successRate=${successRate.toFixed(1)}% disputes=${disputes.length}(${pendingDisputes} pending)`;
    } catch {
      return '[kamiyo:reputation] unavailable';
    }
  },
};
