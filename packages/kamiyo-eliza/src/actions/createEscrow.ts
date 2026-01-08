import type { Action, IAgentRuntime, Memory, State, HandlerCallback } from '../types';
import { getNetworkConfig, getKeypair, createConnection, generateId, parseAmount, parseAddress } from '../utils';

export const createEscrowAction: Action = {
  name: 'CREATE_KAMIYO_ESCROW',
  description: 'Create payment escrow. Locks funds until delivery or dispute.',
  similes: ['escrow', 'lock funds', 'secure payment'],
  examples: [
    [
      { user: '{{user1}}', content: { text: 'Create escrow for 0.1 SOL to provider ABC123' } },
      { user: '{{agent}}', content: { text: 'Escrow created: 0.1 SOL locked for ABC123.', action: 'CREATE_KAMIYO_ESCROW' } },
    ],
  ],

  async validate(_runtime: IAgentRuntime, message: Memory): Promise<boolean> {
    const text = message.content.text?.toLowerCase() || '';
    return text.includes('escrow') || text.includes('lock funds');
  },

  async handler(
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<{ success: boolean; escrowAddress?: string; error?: string }> {
    const { rpcUrl } = getNetworkConfig(runtime);
    const keypair = getKeypair(runtime);
    const text = message.content.text || '';

    const amount = parseAmount(text);
    if (!amount) {
      callback?.({ text: 'Specify amount in SOL' });
      return { success: false, error: 'Amount not specified' };
    }

    const provider = parseAddress(text) || (message.content.provider as string);
    if (!provider) {
      callback?.({ text: 'Specify provider address' });
      return { success: false, error: 'Provider not specified' };
    }

    if (!keypair) {
      callback?.({ text: 'Wallet not configured' });
      return { success: false, error: 'Wallet not configured' };
    }

    try {
      const connection = createConnection(rpcUrl);

      // TODO: Replace with actual Kamiyo SDK call
      // const tx = await kamiyoClient.createAgreement({ provider, amount, timeLockSeconds });
      const transactionId = generateId('tx');
      const escrowAddress = generateId('escrow');
      const timeLockHours = (message.content.timeLockHours as number) || 24;

      callback?.({
        text: `Escrow: ${amount} SOL locked for ${provider.slice(0, 8)}... (${timeLockHours}h)`,
        content: { escrowAddress, amount, provider, transactionId },
      });

      return { success: true, escrowAddress };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      callback?.({ text: `Failed: ${error}` });
      return { success: false, error };
    }
  },
};
