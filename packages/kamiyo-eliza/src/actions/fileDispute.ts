import { PublicKey } from '@solana/web3.js';
import { Wallet } from '@coral-xyz/anchor';
import type { Action, IAgentRuntime, Memory, State, HandlerCallback } from '../types';
import { getNetworkConfig, getKeypair, createConnection, parseQuality, getRefundPercent } from '../utils';

export const fileDisputeAction: Action = {
  name: 'FILE_KAMIYO_DISPUTE',
  description: 'File dispute for quality issues. Triggers oracle arbitration.',
  similes: ['dispute', 'challenge payment', 'request refund', 'file complaint'],
  examples: [
    [
      { user: '{{user1}}', content: { text: 'Dispute tx_abc123 - quality was 40%' } },
      { user: '{{agent}}', content: { text: 'Dispute filed. Oracles will arbitrate. Expected refund: 100%.', action: 'FILE_KAMIYO_DISPUTE' } },
    ],
    [
      { user: '{{user1}}', content: { text: 'Challenge payment tx_xyz - service was poor' } },
      { user: '{{agent}}', content: { text: 'Dispute submitted. Awaiting oracle votes.', action: 'FILE_KAMIYO_DISPUTE' } },
    ],
  ],

  async validate(_runtime: IAgentRuntime, message: Memory): Promise<boolean> {
    const text = message.content.text?.toLowerCase() || '';
    return (
      text.includes('dispute') ||
      text.includes('challenge') ||
      text.includes('refund') ||
      text.includes('complain')
    );
  },

  async handler(
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<{ success: boolean; signature?: string; expectedRefund?: number; error?: string }> {
    const { rpcUrl, programId } = getNetworkConfig(runtime);
    const keypair = getKeypair(runtime);
    const text = message.content.text || '';

    const escrowMatch = text.match(/tx_[a-z0-9_]+/i) || text.match(/escrow_[a-z0-9_]+/i);
    const transactionId = escrowMatch?.[0] || (message.content.transactionId as string);

    if (!transactionId) {
      callback?.({ text: 'Specify escrow/transaction ID (e.g., tx_abc123)' });
      return { success: false, error: 'Transaction ID not specified' };
    }

    if (!keypair) {
      callback?.({ text: 'Wallet not configured. Set SOLANA_PRIVATE_KEY.' });
      return { success: false, error: 'Wallet not configured' };
    }

    try {
      const connection = createConnection(rpcUrl);
      const { KamiyoClient } = await import('@kamiyo/sdk');

      const client = new KamiyoClient({
        connection,
        wallet: new Wallet(keypair),
        programId: new PublicKey(programId),
      });

      const signature = await client.markDisputed(transactionId);

      const quality = parseQuality(text);
      const expectedRefund = quality !== null ? getRefundPercent(quality) : null;
      const refundStr = expectedRefund !== null ? `${expectedRefund}%` : 'pending oracle vote';

      callback?.({
        text: `Dispute filed for ${transactionId}. Expected refund: ${refundStr}. Oracles will arbitrate.`,
        content: { transactionId, signature, quality, expectedRefund, status: 'disputed' },
      });

      return { success: true, signature, expectedRefund: expectedRefund ?? undefined };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      callback?.({ text: `Dispute failed: ${error}` });
      return { success: false, error };
    }
  },
};
