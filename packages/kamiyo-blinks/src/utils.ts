import { PublicKey, Connection, Transaction } from '@solana/web3.js';
import { KamiyoClient } from '@kamiyo/sdk';
import { KAMIYO_PROGRAM_ID, RPC_URL, ESCROW_CONFIG } from './constants';

export class ActionError extends Error {
  constructor(message: string, public readonly code: string = 'UNKNOWN_ERROR') {
    super(message);
    this.name = 'ActionError';
  }
}

export function validatePublicKey(address: string, fieldName: string): PublicKey {
  try {
    return new PublicKey(address);
  } catch {
    throw new ActionError(`Invalid ${fieldName}: not a valid Solana address`, 'INVALID_ADDRESS');
  }
}

export function validateAmount(amountStr: string): number {
  const amount = parseFloat(amountStr);

  if (isNaN(amount) || amount <= 0) {
    throw new ActionError('Amount must be a positive number', 'INVALID_AMOUNT');
  }

  if (amount < ESCROW_CONFIG.MIN_AMOUNT_SOL) {
    throw new ActionError(
      `Minimum amount is ${ESCROW_CONFIG.MIN_AMOUNT_SOL} SOL`,
      'AMOUNT_TOO_LOW'
    );
  }

  if (amount > ESCROW_CONFIG.MAX_AMOUNT_SOL) {
    throw new ActionError(
      `Maximum amount is ${ESCROW_CONFIG.MAX_AMOUNT_SOL} SOL`,
      'AMOUNT_TOO_HIGH'
    );
  }

  return amount;
}

export function solToLamports(sol: number): number {
  return Math.floor(sol * 1e9);
}

export function lamportsToSol(lamports: number): number {
  return lamports / 1e9;
}

export function shortenAddress(address: string, chars = 4): string {
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

export function generateEscrowId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `blink_${timestamp}_${random}`;
}

export function createReadOnlyClient(payerPubkey: PublicKey): KamiyoClient {
  const connection = new Connection(RPC_URL, 'confirmed');

  return new KamiyoClient({
    connection,
    wallet: {
      publicKey: payerPubkey,
      signTransaction: async (tx: Transaction) => tx,
      signAllTransactions: async (txs: Transaction[]) => txs,
    } as any,
    programId: KAMIYO_PROGRAM_ID,
  });
}

export function getConnection(): Connection {
  return new Connection(RPC_URL, 'confirmed');
}

export async function buildAndSerializeTransaction(
  connection: Connection,
  feePayer: PublicKey,
  ...instructions: any[]
): Promise<string> {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

  const transaction = new Transaction({
    feePayer,
    blockhash,
    lastValidBlockHeight,
  });

  for (const ix of instructions) {
    transaction.add(ix);
  }

  const serialized = transaction.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  });

  return Buffer.from(serialized).toString('base64');
}

export function formatTimeLock(seconds: number): string {
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}
