import { PublicKey } from '@solana/web3.js';
import { Wallet } from '@coral-xyz/anchor';
import type { Action, IAgentRuntime, Memory, State, HandlerCallback } from '../types';
import { getNetworkConfig, getKeypair, createConnection, parseAddress } from '../utils';

export const releaseEscrowAction: Action = {
  name: 'RELEASE_KAMIYO_ESCROW',
  description: 'Release escrowed funds to provider after successful delivery.',
  similes: ['release payment', 'confirm delivery', 'approve payment', 'pay provider'],
  examples: [
    [
      { user: '{{user1}}', content: { text: 'Release escrow tx_abc123 to provider' } },
      { user: '{{agent}}', content: { text: 'Released. Provider paid 0.1 SOL.', action: 'RELEASE_KAMIYO_ESCROW' } },
    ],
    [
      { user: '{{user1}}', content: { text: 'Approve payment for tx_xyz789' } },
      { user: '{{agent}}', content: { text: 'Payment released to 8xYz...', action: 'RELEASE_KAMIYO_ESCROW' } },
    ],
  ],

  async validate(_runtime: IAgentRuntime, message: Memory): Promise<boolean> {
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
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<{ success: boolean; signature?: string; error?: string }> {
    const { rpcUrl, programId } = getNetworkConfig(runtime);
    const keypair = getKeypair(runtime);
    const text = message.content.text || '';

    const escrowMatch = text.match(/tx_[a-z0-9_]+/i) || text.match(/escrow_[a-z0-9_]+/i);
    const transactionId = escrowMatch?.[0] || (message.content.transactionId as string);

    if (!transactionId) {
      callback?.({ text: 'Specify escrow/transaction ID (e.g., tx_abc123)' });
      return { success: false, error: 'Transaction ID not specified' };
    }

    const provider = parseAddress(text) || (message.content.provider as string);
    if (!provider) {
      callback?.({ text: 'Specify provider address' });
      return { success: false, error: 'Provider not specified' };
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

      const signature = await client.releaseFunds(transactionId, new PublicKey(provider));

      callback?.({
        text: `Released ${transactionId}. Provider ${provider.slice(0, 8)}... paid.`,
        content: { transactionId, provider, signature, status: 'released' },
      });

      return { success: true, signature };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      callback?.({ text: `Release failed: ${error}` });
      return { success: false, error };
    }
  },
};
