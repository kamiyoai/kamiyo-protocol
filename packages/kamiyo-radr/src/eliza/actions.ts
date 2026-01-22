/**
 * ElizaOS actions for Radr ShadowPay integration.
 */

import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import type { Action, IAgentRuntime, Memory, State, HandlerCallback } from './types';
import { getClientManager } from '../client/manager';
import type { ShadowToken } from '../types';

function getRpcUrl(runtime: IAgentRuntime): string {
  return runtime.getSetting('SOLANA_RPC_URL') ||
    runtime.getSetting('RPC_URL') ||
    'https://api.mainnet-beta.solana.com';
}

function getKeypair(runtime: IAgentRuntime): Keypair | null {
  const privateKey = runtime.getSetting('SOLANA_PRIVATE_KEY');
  if (!privateKey) return null;

  try {
    const decoded = Buffer.from(privateKey, 'base64');
    return Keypair.fromSecretKey(decoded);
  } catch {
    try {
      const json = JSON.parse(privateKey);
      return Keypair.fromSecretKey(new Uint8Array(json));
    } catch {
      return null;
    }
  }
}

function getKamiyoProgramId(runtime: IAgentRuntime): string {
  return runtime.getSetting('KAMIYO_PROGRAM_ID') || '8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM';
}

function parseAmount(text: string): number | null {
  const match = text.match(/(\d+(?:\.\d+)?)\s*(sol|usdc|radr|bonk)/i);
  return match ? parseFloat(match[1]) : null;
}

function parseToken(text: string): ShadowToken {
  const match = text.match(/\b(sol|usdc|usdt|radr|bonk|ore)\b/i);
  return (match?.[1]?.toUpperCase() || 'SOL') as ShadowToken;
}

function parseAddress(text: string): string | null {
  const match = text.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/);
  return match?.[0] || null;
}

export const privateTransferAction: Action = {
  name: 'SHADOW_PRIVATE_TRANSFER',
  description: 'Send tokens privately via ShadowWire. Amount hidden from blockchain observers.',
  similes: ['private transfer', 'shadow transfer', 'anonymous send', 'hidden payment'],
  examples: [
    [
      { user: '{{user1}}', content: { text: 'Send 1 SOL privately to 8xYz...' } },
      { user: '{{agent}}', content: { text: 'Private transfer complete. 1 SOL sent anonymously.', action: 'SHADOW_PRIVATE_TRANSFER' } },
    ],
    [
      { user: '{{user1}}', content: { text: 'Anonymous payment of 0.5 USDC to provider' } },
      { user: '{{agent}}', content: { text: 'Executed private USDC transfer via ShadowWire.', action: 'SHADOW_PRIVATE_TRANSFER' } },
    ],
  ],

  async validate(_runtime: IAgentRuntime, message: Memory): Promise<boolean> {
    const text = message.content.text?.toLowerCase() || '';
    return (
      (text.includes('private') || text.includes('shadow') || text.includes('anonymous')) &&
      (text.includes('transfer') || text.includes('send') || text.includes('pay'))
    );
  },

  async handler(
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<{ success: boolean; signature?: string; error?: string }> {
    const text = message.content.text || '';
    const amount = parseAmount(text);
    const token = parseToken(text);
    const recipient = parseAddress(text) || (message.content.recipient as string);

    if (!amount) {
      callback?.({ text: 'Specify amount (e.g., "1 SOL")' });
      return { success: false, error: 'Amount not specified' };
    }

    if (amount <= 0) {
      callback?.({ text: 'Amount must be positive' });
      return { success: false, error: 'Amount must be positive' };
    }

    if (!recipient) {
      callback?.({ text: 'Specify recipient address' });
      return { success: false, error: 'Recipient not specified' };
    }

    const keypair = getKeypair(runtime);
    if (!keypair) {
      callback?.({ text: 'Wallet not configured. Set SOLANA_PRIVATE_KEY.' });
      return { success: false, error: 'Wallet not configured' };
    }

    try {
      const connection = new Connection(getRpcUrl(runtime));
      const manager = getClientManager();
      const client = await manager.getShadowWire(connection);

      const canInternal = await client.canReceiveInternal(recipient);
      const transferType = canInternal ? 'internal' : 'external';

      const result = await client.transfer({
        sender: keypair.publicKey.toBase58(),
        recipient,
        amount,
        token,
        type: transferType,
      });

      if (!result.success) {
        callback?.({ text: `Transfer failed: ${result.error}` });
        return { success: false, error: result.error };
      }

      const privacyLevel = transferType === 'internal' ? 'fully private' : 'sender anonymous';
      callback?.({
        text: `Private transfer complete: ${amount} ${token} sent (${privacyLevel})`,
        content: {
          signature: result.signature,
          amount,
          token,
          recipient,
          privacyLevel,
          relayerFee: result.relayerFee,
        },
      });

      return { success: true, signature: result.signature };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      callback?.({ text: `Transfer failed: ${error}` });
      return { success: false, error };
    }
  },
};

export const checkShieldedBalanceAction: Action = {
  name: 'SHADOW_CHECK_BALANCE',
  description: 'Check shielded balance in ShadowWire pool.',
  similes: ['shielded balance', 'shadow balance', 'private balance', 'pool balance'],
  examples: [
    [
      { user: '{{user1}}', content: { text: 'What is my shielded SOL balance?' } },
      { user: '{{agent}}', content: { text: 'Your shielded balance is 2.5 SOL.', action: 'SHADOW_CHECK_BALANCE' } },
    ],
  ],

  async validate(_runtime: IAgentRuntime, message: Memory): Promise<boolean> {
    const text = message.content.text?.toLowerCase() || '';
    return (
      (text.includes('shielded') || text.includes('shadow') || text.includes('private') || text.includes('pool')) &&
      text.includes('balance')
    );
  },

  async handler(
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<{ success: boolean; balance?: number; error?: string }> {
    const text = message.content.text || '';
    const token = parseToken(text);

    const keypair = getKeypair(runtime);
    if (!keypair) {
      callback?.({ text: 'Wallet not configured.' });
      return { success: false, error: 'Wallet not configured' };
    }

    try {
      const connection = new Connection(getRpcUrl(runtime));
      const manager = getClientManager();
      const client = await manager.getShadowWire(connection);

      const balance = await client.getBalance(keypair.publicKey.toBase58(), token);

      callback?.({
        text: `Shielded ${token} balance: ${balance.available}`,
        content: { balance: balance.available, token, poolAddress: balance.poolAddress },
      });

      return { success: true, balance: balance.available };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      callback?.({ text: `Failed to check balance: ${error}` });
      return { success: false, error };
    }
  },
};

export const createPrivateEscrowAction: Action = {
  name: 'SHADOW_CREATE_ESCROW',
  description: 'Create escrow with private funding via ShadowWire. Amount hidden, dispute protection enabled.',
  similes: ['private escrow', 'shadow escrow', 'anonymous escrow', 'hidden escrow'],
  examples: [
    [
      { user: '{{user1}}', content: { text: 'Create private escrow for 0.5 SOL to provider 8xYz...' } },
      { user: '{{agent}}', content: { text: 'Private escrow created. 0.5 SOL locked with dispute protection.', action: 'SHADOW_CREATE_ESCROW' } },
    ],
  ],

  async validate(_runtime: IAgentRuntime, message: Memory): Promise<boolean> {
    const text = message.content.text?.toLowerCase() || '';
    return (
      (text.includes('private') || text.includes('shadow') || text.includes('anonymous')) &&
      text.includes('escrow')
    );
  },

  async handler(
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<{ success: boolean; escrowPda?: string; transactionId?: string; error?: string }> {
    const text = message.content.text || '';
    const amount = parseAmount(text);
    const token = parseToken(text);
    const provider = parseAddress(text) || (message.content.provider as string);

    if (!amount) {
      callback?.({ text: 'Specify escrow amount' });
      return { success: false, error: 'Amount not specified' };
    }

    if (amount <= 0) {
      callback?.({ text: 'Amount must be positive' });
      return { success: false, error: 'Amount must be positive' };
    }

    if (!provider) {
      callback?.({ text: 'Specify provider address' });
      return { success: false, error: 'Provider not specified' };
    }

    const keypair = getKeypair(runtime);
    if (!keypair) {
      callback?.({ text: 'Wallet not configured.' });
      return { success: false, error: 'Wallet not configured' };
    }

    try {
      const connection = new Connection(getRpcUrl(runtime));
      const programId = new PublicKey(getKamiyoProgramId(runtime));
      const manager = getClientManager();
      const escrowHandler = await manager.getEscrowHandler(connection, programId);

      const transactionId = `shadow_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      const result = await escrowHandler.createPrivateEscrow({
        wallet: {
          publicKey: keypair.publicKey,
          signTransaction: async (tx: any) => {
            tx.sign(keypair);
            return tx;
          },
        },
        provider,
        amount,
        token,
        transactionId,
        config: {
          privateDeposit: true,
          privateSettlement: true,
          timeLockSeconds: (message.content.timeLockHours as number || 24) * 3600,
        },
      });

      if (!result.success) {
        callback?.({ text: `Escrow creation failed: ${result.error}` });
        return { success: false, error: result.error };
      }

      callback?.({
        text: `Private escrow created: ${amount} ${token} locked for ${provider.slice(0, 8)}...`,
        content: {
          escrowPda: result.escrowPda,
          transactionId: result.transactionId,
          amount,
          token,
          provider,
          privateDeposit: true,
        },
      });

      return { success: true, escrowPda: result.escrowPda, transactionId: result.transactionId };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      callback?.({ text: `Escrow creation failed: ${error}` });
      return { success: false, error };
    }
  },
};

export const checkReputationGateAction: Action = {
  name: 'SHADOW_CHECK_REPUTATION',
  description: 'Check if reputation meets threshold for ShadowWire access.',
  similes: ['reputation check', 'reputation gate', 'access check', 'tier check'],
  examples: [
    [
      { user: '{{user1}}', content: { text: 'Can I access the premium shielded pool?' } },
      { user: '{{agent}}', content: { text: 'Reputation check: Gold tier (78/100). Access granted.', action: 'SHADOW_CHECK_REPUTATION' } },
    ],
  ],

  async validate(_runtime: IAgentRuntime, message: Memory): Promise<boolean> {
    const text = message.content.text?.toLowerCase() || '';
    return (
      (text.includes('reputation') || text.includes('tier') || text.includes('access')) &&
      (text.includes('check') || text.includes('can i') || text.includes('qualify'))
    );
  },

  async handler(
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<{ success: boolean; eligible?: boolean; tier?: string; error?: string }> {
    const keypair = getKeypair(runtime);
    if (!keypair) {
      callback?.({ text: 'Wallet not configured.' });
      return { success: false, error: 'Wallet not configured' };
    }

    const threshold = (message.content.threshold as number) || 50;

    if (threshold < 0 || threshold > 100) {
      callback?.({ text: 'Threshold must be 0-100' });
      return { success: false, error: 'Invalid threshold' };
    }

    try {
      const connection = new Connection(getRpcUrl(runtime));
      const programId = new PublicKey(getKamiyoProgramId(runtime));
      const manager = getClientManager();
      const gate = manager.getReputationGate(connection, programId);

      const result = await gate.checkReputationGate(
        { publicKey: keypair.publicKey },
        threshold
      );

      const statusText = result.eligible
        ? `Access granted. ${result.tier} tier meets threshold ${threshold}.`
        : `Access denied. ${result.tier} tier below threshold ${threshold}.`;

      callback?.({
        text: statusText,
        content: {
          eligible: result.eligible,
          tier: result.tier,
          threshold,
          hasProof: !!result.proof,
        },
      });

      return { success: true, eligible: result.eligible, tier: result.tier };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      callback?.({ text: `Reputation check failed: ${error}` });
      return { success: false, error };
    }
  },
};

export const filePrivateDisputeAction: Action = {
  name: 'SHADOW_FILE_DISPUTE',
  description: 'File dispute for private escrow. Oracles evaluate without revealing payment amount.',
  similes: ['private dispute', 'shadow dispute', 'escrow dispute', 'dispute payment'],
  examples: [
    [
      { user: '{{user1}}', content: { text: 'Dispute the private escrow, service not delivered' } },
      { user: '{{agent}}', content: { text: 'Dispute filed. Oracles will evaluate within 24h.', action: 'SHADOW_FILE_DISPUTE' } },
    ],
  ],

  async validate(_runtime: IAgentRuntime, message: Memory): Promise<boolean> {
    const text = message.content.text?.toLowerCase() || '';
    return text.includes('dispute') && (text.includes('private') || text.includes('shadow') || text.includes('escrow'));
  },

  async handler(
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<{ success: boolean; disputeId?: string; error?: string }> {
    const escrowPda = message.content.escrowPda as string;
    const transactionId = message.content.transactionId as string;
    const reason = message.content.reason as string || 'Service not delivered as agreed';

    if (!escrowPda || !transactionId) {
      callback?.({ text: 'Specify escrowPda and transactionId' });
      return { success: false, error: 'Missing escrow details' };
    }

    if (reason.length > 500) {
      callback?.({ text: 'Reason too long (max 500 chars)' });
      return { success: false, error: 'Reason too long' };
    }

    const keypair = getKeypair(runtime);
    if (!keypair) {
      callback?.({ text: 'Wallet not configured.' });
      return { success: false, error: 'Wallet not configured' };
    }

    try {
      const connection = new Connection(getRpcUrl(runtime));
      const programId = new PublicKey(getKamiyoProgramId(runtime));
      const manager = getClientManager();
      const escrowHandler = await manager.getEscrowHandler(connection, programId);

      const result = await escrowHandler.fileDispute({
        escrowPda,
        transactionId,
        reason,
        revealAmount: false,
      });

      if (!result.success) {
        callback?.({ text: `Dispute filing failed: ${result.error}` });
        return { success: false, error: result.error };
      }

      callback?.({
        text: `Dispute filed. ID: ${result.disputeId}. Oracle commit deadline: ${new Date(result.oracleCommitDeadline! * 1000).toISOString()}`,
        content: {
          disputeId: result.disputeId,
          oracleCommitDeadline: result.oracleCommitDeadline,
          reason,
          privateDispute: true,
        },
      });

      return { success: true, disputeId: result.disputeId };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      callback?.({ text: `Dispute filing failed: ${error}` });
      return { success: false, error };
    }
  },
};

export const depositToPoolAction: Action = {
  name: 'SHADOW_DEPOSIT',
  description: 'Deposit tokens to ShadowWire shielded pool.',
  similes: ['deposit to pool', 'shield tokens', 'add to pool', 'deposit shadow'],
  examples: [
    [
      { user: '{{user1}}', content: { text: 'Deposit 5 SOL to shielded pool' } },
      { user: '{{agent}}', content: { text: 'Deposited 5 SOL to shielded pool.', action: 'SHADOW_DEPOSIT' } },
    ],
  ],

  async validate(_runtime: IAgentRuntime, message: Memory): Promise<boolean> {
    const text = message.content.text?.toLowerCase() || '';
    return text.includes('deposit') && (text.includes('pool') || text.includes('shield') || text.includes('shadow'));
  },

  async handler(
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<{ success: boolean; error?: string }> {
    const text = message.content.text || '';
    const amount = parseAmount(text);
    const token = parseToken(text);

    if (!amount) {
      callback?.({ text: 'Specify deposit amount' });
      return { success: false, error: 'Amount not specified' };
    }

    if (amount <= 0) {
      callback?.({ text: 'Amount must be positive' });
      return { success: false, error: 'Amount must be positive' };
    }

    const keypair = getKeypair(runtime);
    if (!keypair) {
      callback?.({ text: 'Wallet not configured.' });
      return { success: false, error: 'Wallet not configured' };
    }

    try {
      const connection = new Connection(getRpcUrl(runtime));
      const manager = getClientManager();
      const client = await manager.getShadowWire(connection);

      await client.deposit({
        wallet: keypair.publicKey.toBase58(),
        amount,
        token,
      });

      callback?.({
        text: `Deposited ${amount} ${token} to shielded pool.`,
        content: { amount, token },
      });

      return { success: true };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      callback?.({ text: `Deposit failed: ${error}` });
      return { success: false, error };
    }
  },
};

export const radrActions = [
  privateTransferAction,
  checkShieldedBalanceAction,
  createPrivateEscrowAction,
  checkReputationGateAction,
  filePrivateDisputeAction,
  depositToPoolAction,
];
