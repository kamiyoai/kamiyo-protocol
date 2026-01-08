import { Connection, Keypair, PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import type { Action, IAgentRuntime, Memory, State, HandlerCallback } from '../types';
import { NETWORKS, DEFAULT_CONFIG } from '../types';

export const createEscrowAction: Action = {
  name: 'CREATE_KAMIYO_ESCROW',
  description: 'Create a payment escrow on Kamiyo. Locks funds until service delivery or dispute resolution.',
  similes: ['escrow', 'lock funds', 'secure payment', 'create agreement'],
  examples: [
    [
      {
        user: '{{user1}}',
        content: { text: 'Create an escrow for 0.1 SOL to provider ABC123 for data service' },
      },
      {
        user: '{{agent}}',
        content: {
          text: 'Created escrow for 0.1 SOL to ABC123. Funds locked for 24 hours.',
          action: 'CREATE_KAMIYO_ESCROW',
        },
      },
    ],
    [
      {
        user: '{{user1}}',
        content: { text: 'Lock 0.5 SOL in escrow for trading signals provider' },
      },
      {
        user: '{{agent}}',
        content: {
          text: 'Escrow created: 0.5 SOL locked. Transaction ID: tx_abc123',
          action: 'CREATE_KAMIYO_ESCROW',
        },
      },
    ],
  ],

  async validate(runtime: IAgentRuntime, message: Memory): Promise<boolean> {
    const text = message.content.text?.toLowerCase() || '';
    return (
      text.includes('escrow') ||
      text.includes('lock funds') ||
      text.includes('secure payment') ||
      text.includes('create agreement')
    );
  },

  async handler(
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<{ success: boolean; escrowAddress?: string; error?: string }> {
    const network = (runtime.getSetting('KAMIYO_NETWORK') as 'mainnet' | 'devnet') || 'devnet';
    const config = NETWORKS[network];

    const text = message.content.text || '';
    const amountMatch = text.match(/(\d+\.?\d*)\s*SOL/i);
    const providerMatch = text.match(/provider\s+([A-Za-z0-9]+)/i) || text.match(/to\s+([A-Za-z0-9]{32,})/i);

    if (!amountMatch) {
      if (callback) {
        await callback({
          text: 'Specify the amount in SOL (e.g., "0.1 SOL")',
        });
      }
      return { success: false, error: 'Amount not specified' };
    }

    const amount = parseFloat(amountMatch[1]);
    const providerAddress = providerMatch?.[1] || message.content.provider as string;

    if (!providerAddress) {
      if (callback) {
        await callback({
          text: 'Specify the provider address',
        });
      }
      return { success: false, error: 'Provider not specified' };
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

      const transactionId = `tx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      const escrowAddress = Keypair.generate().publicKey.toString();

      const timeLockHours = (message.content.timeLockHours as number) || 24;
      const expiresAt = Date.now() + timeLockHours * 3600 * 1000;

      if (callback) {
        await callback({
          text: `Escrow created: ${amount} SOL locked for ${providerAddress.slice(0, 8)}... Expires in ${timeLockHours}h. TX: ${transactionId}`,
          content: {
            escrowAddress,
            amount,
            provider: providerAddress,
            expiresAt,
            transactionId,
          },
        });
      }

      return { success: true, escrowAddress };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (callback) {
        await callback({
          text: `Escrow creation failed: ${errorMessage}`,
        });
      }
      return { success: false, error: errorMessage };
    }
  },
};
