import { PublicKey } from '@solana/web3.js';
import { Wallet, BN } from '@coral-xyz/anchor';
import type { Action, IAgentRuntime, Memory, State, HandlerCallback } from '../types';
import { getNetworkConfig, getKeypair, createConnection, generateId, parseAmount, parseAddress, solToLamports } from '../utils';

export const createEscrowAction: Action = {
  name: 'CREATE_KAMIYO_ESCROW',
  description: 'Create payment escrow. Locks funds until delivery or dispute.',
  similes: ['escrow', 'lock funds', 'secure payment', 'create agreement'],
  examples: [
    [
      { user: '{{user1}}', content: { text: 'Create escrow for 0.1 SOL to provider ABC123' } },
      { user: '{{agent}}', content: { text: 'Escrow created: 0.1 SOL locked for ABC123.', action: 'CREATE_KAMIYO_ESCROW' } },
    ],
    [
      { user: '{{user1}}', content: { text: 'Lock 0.05 SOL for 8xYz... with 48h timelock' } },
      { user: '{{agent}}', content: { text: 'Created escrow tx_abc123. 0.05 SOL locked for 48 hours.', action: 'CREATE_KAMIYO_ESCROW' } },
    ],
  ],

  async validate(_runtime: IAgentRuntime, message: Memory): Promise<boolean> {
    const text = message.content.text?.toLowerCase() || '';
    return (
      text.includes('escrow') ||
      text.includes('lock funds') ||
      text.includes('create agreement') ||
      (text.includes('lock') && text.includes('sol'))
    );
  },

  async handler(
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<{ success: boolean; escrowAddress?: string; transactionId?: string; signature?: string; error?: string }> {
    const { rpcUrl, programId } = getNetworkConfig(runtime);
    const keypair = getKeypair(runtime);
    const text = message.content.text || '';

    const amount = parseAmount(text);
    if (!amount) {
      callback?.({ text: 'Specify amount in SOL (e.g., "0.1 SOL")' });
      return { success: false, error: 'Amount not specified' };
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

      const transactionId = generateId('tx');
      const timeLockHours = (message.content.timeLockHours as number) || 24;
      const timeLockSeconds = timeLockHours * 3600;

      const signature = await client.createAgreement({
        provider: new PublicKey(provider),
        amount: new BN(solToLamports(amount)),
        timeLockSeconds: new BN(timeLockSeconds),
        transactionId,
      });

      const [escrowPda] = client.getAgreementPDA(keypair.publicKey, transactionId);

      callback?.({
        text: `Escrow created: ${amount} SOL locked for ${provider.slice(0, 8)}... (${timeLockHours}h timelock)`,
        content: {
          escrowAddress: escrowPda.toBase58(),
          amount,
          provider,
          transactionId,
          signature,
          timeLockHours,
        },
      });

      return { success: true, escrowAddress: escrowPda.toBase58(), transactionId, signature };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      callback?.({ text: `Escrow failed: ${error}` });
      return { success: false, error };
    }
  },
};
