import { Connection, Keypair, Transaction, VersionedTransaction } from '@solana/web3.js';
import { logger } from './logger';
import { preflightService } from './surfpool-preflight';

const PREFLIGHT_FAIL_OPEN = process.env.PREFLIGHT_FAIL_OPEN === 'true';

export interface SurfpoolGateInput {
  label: string;
  transaction: Transaction | VersionedTransaction;
  connection?: Connection;
  signer?: Keypair;
  failOpen?: boolean;
}

export async function enforceSurfpoolPreflight({
  label,
  transaction,
  connection,
  signer,
  failOpen = PREFLIGHT_FAIL_OPEN,
}: SurfpoolGateInput): Promise<void> {
  if (transaction instanceof Transaction) {
    if (!transaction.recentBlockhash && connection) {
      const latest = await connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = latest.blockhash;
    }
    if (signer) {
      transaction.feePayer = transaction.feePayer ?? signer.publicKey;
      transaction.partialSign(signer);
    }
  } else if (signer) {
    transaction.sign([signer]);
  }

  const result = await preflightService.validateTransaction(transaction);
  if (result.success) {
    return;
  }

  const message = `Surfpool preflight rejected ${label}: ${result.error || 'unknown error'}`;
  if (failOpen) {
    logger.warn(`${message}; continuing because PREFLIGHT_FAIL_OPEN=true`, {
      mevRisk: result.mevRisk?.risk,
    });
    return;
  }

  logger.warn(message, {
    mevRisk: result.mevRisk?.risk,
  });
  throw new Error(message);
}
