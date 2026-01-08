import type { Action, IAgentRuntime, Memory, State, HandlerCallback } from '../types';
import { getNetworkConfig, getKeypair, createConnection, generateId, parseQuality, getRefundPercent } from '../utils';

export const fileDisputeAction: Action = {
  name: 'FILE_KAMIYO_DISPUTE',
  description: 'File dispute for quality issues. Triggers oracle review.',
  similes: ['dispute', 'challenge payment', 'request refund'],
  examples: [
    [
      { user: '{{user1}}', content: { text: 'Dispute tx_abc123 - quality was 40%' } },
      { user: '{{agent}}', content: { text: 'Dispute filed. Expected 60% refund.', action: 'FILE_KAMIYO_DISPUTE' } },
    ],
  ],

  async validate(_runtime: IAgentRuntime, message: Memory): Promise<boolean> {
    const text = message.content.text?.toLowerCase() || '';
    return text.includes('dispute') || text.includes('refund');
  },

  async handler(
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<{ success: boolean; disputeId?: string; error?: string }> {
    const { rpcUrl } = getNetworkConfig(runtime);
    const keypair = getKeypair(runtime);
    const text = message.content.text || '';

    const escrowMatch = text.match(/tx_[a-z0-9_]+/i) || text.match(/escrow_[a-z0-9_]+/i);
    const escrowId = escrowMatch?.[0] || (message.content.escrowId as string);

    if (!escrowId) {
      callback?.({ text: 'Specify escrow ID' });
      return { success: false, error: 'Escrow ID not specified' };
    }

    if (!keypair) {
      callback?.({ text: 'Wallet not configured' });
      return { success: false, error: 'Wallet not configured' };
    }

    try {
      const connection = createConnection(rpcUrl);

      // TODO: Replace with actual Kamiyo SDK call
      // const tx = await kamiyoClient.markDisputed(escrowId);
      const disputeId = generateId('dsp');
      const quality = parseQuality(text);
      const refundPct = quality !== null ? getRefundPercent(quality) : null;
      const refundStr = refundPct !== null ? `${refundPct}%` : 'pending';

      callback?.({
        text: `Dispute ${disputeId} filed. Expected refund: ${refundStr}`,
        content: { disputeId, escrowId, quality, status: 'pending' },
      });

      return { success: true, disputeId };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      callback?.({ text: `Failed: ${error}` });
      return { success: false, error };
    }
  },
};
