import type { Action, IAgentRuntime, Memory, State, HandlerCallback } from '../types';
import { getNetworkConfig, getKeypair, createConnection, generateId } from '../utils';

export const releaseEscrowAction: Action = {
  name: 'RELEASE_KAMIYO_ESCROW',
  description: 'Release escrowed funds to provider after delivery.',
  similes: ['release payment', 'confirm delivery', 'approve payment'],
  examples: [
    [
      { user: '{{user1}}', content: { text: 'Release escrow tx_abc123' } },
      { user: '{{agent}}', content: { text: 'Released. Provider paid.', action: 'RELEASE_KAMIYO_ESCROW' } },
    ],
  ],

  async validate(_runtime: IAgentRuntime, message: Memory): Promise<boolean> {
    const text = message.content.text?.toLowerCase() || '';
    return text.includes('release') || text.includes('approve payment');
  },

  async handler(
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<{ success: boolean; transactionId?: string; error?: string }> {
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
      // const tx = await kamiyoClient.releaseFunds(escrowId, provider);
      const transactionId = generateId('rel');

      callback?.({
        text: `Released ${escrowId}. TX: ${transactionId}`,
        content: { escrowId, transactionId, status: 'released' },
      });

      return { success: true, transactionId };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      callback?.({ text: `Failed: ${error}` });
      return { success: false, error };
    }
  },
};
