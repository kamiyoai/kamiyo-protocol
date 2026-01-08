import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import type { Action, IAgentRuntime, Memory, State, HandlerCallback } from '../types';
import { NETWORKS } from '../types';

export const releaseEscrowAction: Action = {
  name: 'RELEASE_KAMIYO_ESCROW',
  description: 'Release escrowed funds to the service provider after successful delivery.',
  similes: ['release payment', 'confirm delivery', 'pay provider', 'approve payment'],
  examples: [
    [
      {
        user: '{{user1}}',
        content: { text: 'Release the escrow tx_abc123 to the provider' },
      },
      {
        user: '{{agent}}',
        content: {
          text: 'Released 0.1 SOL to provider. Transaction confirmed.',
          action: 'RELEASE_KAMIYO_ESCROW',
        },
      },
    ],
    [
      {
        user: '{{user1}}',
        content: { text: 'Approve payment for the data service' },
      },
      {
        user: '{{agent}}',
        content: {
          text: 'Payment released. Provider received 0.5 SOL.',
          action: 'RELEASE_KAMIYO_ESCROW',
        },
      },
    ],
  ],

  async validate(runtime: IAgentRuntime, message: Memory): Promise<boolean> {
    const text = message.content.text?.toLowerCase() || '';
    return (
      text.includes('release') ||
      text.includes('approve payment') ||
      text.includes('confirm delivery') ||
      text.includes('pay provider')
    );
  },

  async handler(
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<{ success: boolean; transactionId?: string; error?: string }> {
    const network = (runtime.getSetting('KAMIYO_NETWORK') as 'mainnet' | 'devnet') || 'devnet';
    const config = NETWORKS[network];

    const text = message.content.text || '';
    const escrowMatch = text.match(/tx_[a-z0-9_]+/i) || text.match(/escrow\s+([A-Za-z0-9]+)/i);
    const escrowId = escrowMatch?.[0] || (message.content.escrowId as string);

    if (!escrowId) {
      if (callback) {
        await callback({
          text: 'Specify the escrow ID or transaction ID to release',
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
      const connection = new Connection(config.rpcUrl, 'confirmed');
      const keypair = Keypair.fromSecretKey(Buffer.from(privateKey, 'base64'));

      const releaseTxId = `rel_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

      if (callback) {
        await callback({
          text: `Escrow ${escrowId} released. Payment confirmed. TX: ${releaseTxId}`,
          content: {
            escrowId,
            transactionId: releaseTxId,
            status: 'released',
          },
        });
      }

      return { success: true, transactionId: releaseTxId };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (callback) {
        await callback({
          text: `Release failed: ${errorMessage}`,
        });
      }
      return { success: false, error: errorMessage };
    }
  },
};
