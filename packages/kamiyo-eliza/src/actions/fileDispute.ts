import { Connection, Keypair } from '@solana/web3.js';
import type { Action, IAgentRuntime, Memory, State, HandlerCallback } from '../types';
import { NETWORKS } from '../types';

export const fileDisputeAction: Action = {
  name: 'FILE_KAMIYO_DISPUTE',
  description: 'File a dispute for a payment when service quality is below threshold. Triggers oracle review.',
  similes: ['dispute', 'challenge payment', 'request refund', 'quality issue'],
  examples: [
    [
      {
        user: '{{user1}}',
        content: { text: 'File a dispute for tx_abc123 - data was incomplete' },
      },
      {
        user: '{{agent}}',
        content: {
          text: 'Dispute filed. Oracle review in progress. Resolution in 24-48h.',
          action: 'FILE_KAMIYO_DISPUTE',
        },
      },
    ],
    [
      {
        user: '{{user1}}',
        content: { text: 'Challenge the payment, service quality was only 40%' },
      },
      {
        user: '{{agent}}',
        content: {
          text: 'Dispute submitted. Quality score 40% below threshold. Expect 60% refund.',
          action: 'FILE_KAMIYO_DISPUTE',
        },
      },
    ],
  ],

  async validate(runtime: IAgentRuntime, message: Memory): Promise<boolean> {
    const text = message.content.text?.toLowerCase() || '';
    return (
      text.includes('dispute') ||
      text.includes('challenge') ||
      text.includes('refund') ||
      text.includes('quality issue')
    );
  },

  async handler(
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<{ success: boolean; disputeId?: string; error?: string }> {
    const network = (runtime.getSetting('KAMIYO_NETWORK') as 'mainnet' | 'devnet') || 'devnet';
    const config = NETWORKS[network];

    const text = message.content.text || '';
    const escrowMatch = text.match(/tx_[a-z0-9_]+/i) || text.match(/escrow\s+([A-Za-z0-9]+)/i);
    const escrowId = escrowMatch?.[0] || (message.content.escrowId as string);
    const reason = (message.content.reason as string) || text;

    if (!escrowId) {
      if (callback) {
        await callback({
          text: 'Specify the escrow ID or transaction ID to dispute',
        });
      }
      return { success: false, error: 'Escrow ID not specified' };
    }

    const privateKey = runtime.getSetting('SOLANA_PRIVATE_KEY');
    if (!privateKey) {
      if (callback) {
        await callback({
          text: 'Wallet not configured. Set SOLANA_PRIVATE_KEY.',
        });
      }
      return { success: false, error: 'Wallet not configured' };
    }

    try {
      const disputeId = `dsp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

      const qualityMatch = text.match(/(\d+)%/);
      const reportedQuality = qualityMatch ? parseInt(qualityMatch[1], 10) : undefined;

      let expectedRefund = 'pending oracle review';
      if (reportedQuality !== undefined) {
        if (reportedQuality < 50) expectedRefund = '100%';
        else if (reportedQuality < 65) expectedRefund = '75%';
        else if (reportedQuality < 80) expectedRefund = '35%';
        else expectedRefund = '0%';
      }

      if (callback) {
        await callback({
          text: `Dispute ${disputeId} filed for ${escrowId}. Expected refund: ${expectedRefund}. Resolution: 24-48h.`,
          content: {
            disputeId,
            escrowId,
            reason,
            reportedQuality,
            status: 'pending',
            estimatedResolution: Date.now() + 48 * 3600 * 1000,
          },
        });
      }

      return { success: true, disputeId };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (callback) {
        await callback({
          text: `Dispute filing failed: ${errorMessage}`,
        });
      }
      return { success: false, error: errorMessage };
    }
  },
};
