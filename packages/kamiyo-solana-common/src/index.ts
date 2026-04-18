import {
  PublicKey,
  Connection,
  Transaction,
  VersionedTransaction,
  SendOptions,
  Commitment,
} from '@solana/web3.js';
import { createHash } from 'node:crypto';

export const KAMIYO_PROGRAM_ID = new PublicKey('3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr');

// ============ Retry Configuration ============

export interface RetryConfig {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  retryableErrors?: string[];
}

const DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
  maxAttempts: 3,
  initialDelayMs: 500,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  retryableErrors: [
    'blockhash not found',
    'block height exceeded',
    'Transaction simulation failed',
    'timeout',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'rate limit',
    '429',
    '503',
    '504',
  ],
};

function isRetryableError(error: unknown, retryablePatterns: string[]): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return retryablePatterns.some(pattern => message.toLowerCase().includes(pattern.toLowerCase()));
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============ Generic Retry Wrapper ============

export async function withRetry<T>(fn: () => Promise<T>, config?: RetryConfig): Promise<T> {
  const opts = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error | undefined;
  let delay = opts.initialDelayMs;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === opts.maxAttempts) break;
      if (!isRetryableError(error, opts.retryableErrors)) throw error;

      await sleep(delay);
      delay = Math.min(delay * opts.backoffMultiplier, opts.maxDelayMs);
    }
  }

  throw lastError ?? new Error('Retry failed');
}

// ============ Transaction Sending with Retry ============

export interface SendTransactionConfig {
  connection: Connection;
  transaction: Transaction | VersionedTransaction;
  sendOptions?: SendOptions;
  commitment?: Commitment;
  retry?: RetryConfig;
}

export async function sendTransactionWithRetry(config: SendTransactionConfig): Promise<string> {
  const { connection, transaction, sendOptions, commitment, retry } = config;
  const opts = { ...DEFAULT_RETRY_CONFIG, ...retry };

  let lastError: Error | undefined;
  let delay = opts.initialDelayMs;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      // Refresh blockhash for legacy transactions on retry
      if (attempt > 1 && transaction instanceof Transaction) {
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash(commitment);
        transaction.recentBlockhash = blockhash;
        transaction.lastValidBlockHeight = lastValidBlockHeight;
      }

      const serialized = transaction.serialize();
      const signature = await connection.sendRawTransaction(serialized, sendOptions);

      // Confirm transaction
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash(commitment);
      await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        commitment ?? 'confirmed'
      );

      return signature;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === opts.maxAttempts) break;
      if (!isRetryableError(error, opts.retryableErrors)) throw error;

      await sleep(delay);
      delay = Math.min(delay * opts.backoffMultiplier, opts.maxDelayMs);
    }
  }

  throw lastError ?? new Error('Transaction failed after retries');
}

// ============ RPC Call with Retry ============

export async function rpcWithRetry<T>(
  connection: Connection,
  method: keyof Connection,
  args: unknown[],
  config?: RetryConfig
): Promise<T> {
  return withRetry(async () => {
    const fn = (connection[method] as (...a: unknown[]) => unknown).bind(connection);
    return fn(...args) as T;
  }, config);
}

export function modelIdFromString(model: string): Uint8Array {
  return new Uint8Array(createHash('sha256').update(model).digest());
}
