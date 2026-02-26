import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { randomUUID } from 'crypto';

/**
 * Utility functions for building Solana transactions
 */

/**
 * Convert SOL to lamports
 */
export function solToLamports(sol: number): number {
  return Math.floor(sol * LAMPORTS_PER_SOL);
}

/**
 * Convert lamports to SOL
 */
export function lamportsToSol(lamports: number): number {
  return lamports / LAMPORTS_PER_SOL;
}

/**
 * Create a transfer instruction
 */
export function createTransferInstruction(
  from: PublicKey,
  to: PublicKey,
  lamports: number
): TransactionInstruction {
  return SystemProgram.transfer({
    fromPubkey: from,
    toPubkey: to,
    lamports,
  });
}

/**
 * Format transaction signature for Solana Explorer
 */
export function getExplorerUrl(signature: string, cluster: 'devnet' | 'mainnet-beta' = 'devnet'): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=${cluster}`;
}

/**
 * Format address for Solana Explorer
 */
export function getAddressExplorerUrl(address: string, cluster: 'devnet' | 'mainnet-beta' = 'devnet'): string {
  return `https://explorer.solana.com/address/${address}?cluster=${cluster}`;
}

/**
 * Generate unique transaction ID
 */
export function generateTransactionId(): string {
  const ts = Date.now().toString(36);
  const entropy = randomUUID().replace(/-/g, '').slice(0, 16);
  return `${ts}-${entropy}`;
}

/**
 * Validate transaction ID format
 */
export function isValidTransactionId(transactionId: string): boolean {
  return transactionId.length > 0 && transactionId.length <= 32;
}

/**
 * Parse escrow status from on-chain data
 */
export function parseEscrowStatus(status: any): 'Active' | 'Released' | 'Disputed' | 'Resolved' {
  if ('active' in status || 'Active' in status) return 'Active';
  if ('released' in status || 'Released' in status) return 'Released';
  if ('disputed' in status || 'Disputed' in status) return 'Disputed';
  if ('resolved' in status || 'Resolved' in status) return 'Resolved';
  throw new Error('Unknown escrow status');
}

/**
 * Calculate refund amount from percentage
 */
export function calculateRefundAmount(totalAmount: number, refundPercentage: number): number {
  return Math.floor((totalAmount * refundPercentage) / 100);
}

/**
 * Calculate payment amount after refund
 */
export function calculatePaymentAmount(totalAmount: number, refundPercentage: number): number {
  const refund = calculateRefundAmount(totalAmount, refundPercentage);
  return totalAmount - refund;
}
