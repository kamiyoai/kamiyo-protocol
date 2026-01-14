/**
 * Wallet signature verification for proving ownership.
 */

import { PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { randomBytes } from 'crypto';
import { logger } from './logger';

const CHALLENGE_PREFIX = 'KAMIYO Wallet Verification\n\nSign this message to link your wallet:\n';
const CHALLENGE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

export interface WalletChallenge {
  wallet: string;
  nonce: string;
  message: string;
  expiresAt: number;
}

/**
 * Generate a challenge for wallet verification.
 */
export function generateChallenge(wallet: string): WalletChallenge {
  // Validate wallet address
  try {
    new PublicKey(wallet);
  } catch {
    throw new Error('Invalid Solana wallet address');
  }

  const nonce = randomBytes(16).toString('hex');
  const message = `${CHALLENGE_PREFIX}${nonce}`;
  const expiresAt = Date.now() + CHALLENGE_EXPIRY_MS;

  return { wallet, nonce, message, expiresAt };
}

/**
 * Verify a signature against a challenge.
 *
 * @param wallet - The wallet address claiming ownership
 * @param signature - Base58 encoded signature from wallet
 * @param message - The original challenge message that was signed
 * @returns true if signature is valid
 */
export function verifySignature(wallet: string, signature: string, message: string): boolean {
  try {
    const publicKey = new PublicKey(wallet);
    const signatureBytes = bs58.decode(signature);
    const messageBytes = new TextEncoder().encode(message);

    const isValid = nacl.sign.detached.verify(
      messageBytes,
      signatureBytes,
      publicKey.toBytes()
    );

    if (isValid) {
      logger.info('Wallet signature verified', { wallet: wallet.slice(0, 8) + '...' });
    } else {
      logger.warn('Invalid wallet signature', { wallet: wallet.slice(0, 8) + '...' });
    }

    return isValid;
  } catch (err) {
    logger.error('Signature verification failed', {
      wallet: wallet.slice(0, 8) + '...',
      error: String(err),
    });
    return false;
  }
}

/**
 * Check if a challenge has expired.
 */
export function isChallengeExpired(expiresAt: number): boolean {
  return Date.now() > expiresAt;
}

/**
 * Format user instructions for signing.
 */
export function formatSigningInstructions(challenge: WalletChallenge): string {
  return [
    `To verify ownership of ${challenge.wallet.slice(0, 8)}..., sign this message with your wallet:`,
    '',
    '```',
    challenge.message,
    '```',
    '',
    'Then send: !sign <signature>',
    '',
    'This challenge expires in 10 minutes.',
  ].join('\n');
}
