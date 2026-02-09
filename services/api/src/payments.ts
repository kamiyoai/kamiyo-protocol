import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { processPaymentTransaction } from './db';
import { getRequiredPayment, TIERS } from './tiers';
import { logger } from './logger';
import { getSolanaConnection } from './solana';

const TREASURY_WALLET = process.env.TREASURY_WALLET || '';

const connection = getSolanaConnection();

export interface PaymentVerification {
  valid: boolean;
  error?: string;
  tier?: string;
  durationDays?: number;
}

export async function verifyPayment(
  userId: string,
  txSignature: string,
  expectedTier: string
): Promise<PaymentVerification> {
  if (!TREASURY_WALLET) {
    return { valid: false, error: 'Treasury wallet not configured' };
  }

  try {
    // Fetch transaction
    const tx = await connection.getParsedTransaction(txSignature, {
      maxSupportedTransactionVersion: 0,
    });

    if (!tx) {
      return { valid: false, error: 'Transaction not found' };
    }

    if (tx.meta?.err) {
      return { valid: false, error: 'Transaction failed' };
    }

    // Check for SOL transfer to treasury
    const instructions = tx.transaction.message.instructions;
    let transferAmount = 0;

    for (const ix of instructions) {
      if ('parsed' in ix && ix.parsed?.type === 'transfer') {
        const info = ix.parsed.info;
        if (info.destination === TREASURY_WALLET) {
          transferAmount += info.lamports;
        }
      }
    }

    if (transferAmount === 0) {
      return { valid: false, error: 'No transfer to treasury found' };
    }

    // Determine tier based on payment amount
    const { lamports: companionPrice } = getRequiredPayment('companion');
    const { lamports: proPrice } = getRequiredPayment('pro');

    let tier: string;
    let durationDays: number;

    if (transferAmount >= proPrice) {
      tier = 'pro';
      durationDays = 30;
    } else if (transferAmount >= companionPrice) {
      tier = 'companion';
      durationDays = 30;
    } else {
      return { valid: false, error: `Insufficient payment. Minimum: ${companionPrice / LAMPORTS_PER_SOL} SOL` };
    }

    // Verify expected tier matches
    if (expectedTier && tier !== expectedTier && transferAmount < getRequiredPayment(expectedTier).lamports) {
      return { valid: false, error: `Payment insufficient for ${expectedTier} tier` };
    }

    // Atomic payment + tier update in a single transaction
    // Prevents race conditions where payment is recorded but tier update fails
    const expiresAt = Math.floor(Date.now() / 1000) + (durationDays * 24 * 60 * 60);
    const recorded = processPaymentTransaction(userId, txSignature, transferAmount, tier, durationDays, expiresAt);

    if (!recorded) {
      return { valid: false, error: 'Transaction already processed' };
    }

    logger.info('Payment processed', { userId, tier, durationDays, txSignature: txSignature.slice(0, 16) });
    return { valid: true, tier, durationDays };
  } catch (err) {
    logger.error('Payment verification error', { error: String(err), userId, txSignature: txSignature.slice(0, 16) });
    return { valid: false, error: 'Failed to verify transaction' };
  }
}

export function getPaymentInstructions(tier: string): string {
  const config = TIERS[tier];
  if (!config || config.pricePerMonth === 0) {
    return 'This tier is free or requires token holdings.';
  }

  const { sol } = getRequiredPayment(tier);

  return `To subscribe to ${config.name}:

1. Send ${sol} SOL to: ${TREASURY_WALLET || '[Treasury wallet not configured]'}
2. Reply with your transaction signature

Or hold ${config.minTokens.toLocaleString()} KAMIYO tokens for free access.`;
}

export function getTreasuryWallet(): string | null {
  return TREASURY_WALLET || null;
}
