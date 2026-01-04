import { Request, Response, NextFunction } from 'express';
import { Connection, PublicKey } from '@solana/web3.js';

export interface X402Options {
  realm: string;
  programId: PublicKey;
  connection: Connection;
  price: number;
  /** Provider wallet that should be the API field in escrow */
  providerWallet: PublicKey;
  qualityGuarantee?: boolean;
  /** Rate limit: max requests per window (default: 100) */
  rateLimit?: number;
  /** Rate limit window in ms (default: 60000 = 1 minute) */
  rateLimitWindow?: number;
}

export interface X402Request extends Request {
  escrow?: {
    pubkey: PublicKey;
    amount: number;
    provider: PublicKey;
    consumer: PublicKey;
    status: number;
  };
}

// EscrowStatus enum matching on-chain
const EscrowStatus = {
  Active: 0,
  Released: 1,
  Disputed: 2,
  Resolved: 3,
} as const;

// Rate limiting store (in production, use Redis)
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

// Used escrow tracking to prevent replay (in production, use Redis)
const usedEscrows = new Set<string>();

/**
 * Parse escrow account data
 * Anchor accounts have 8-byte discriminator, then fields
 */
function parseEscrowData(data: Buffer): {
  agent: PublicKey;
  api: PublicKey;
  amount: bigint;
  status: number;
} {
  // Skip 8-byte discriminator
  const offset = 8;

  const agent = new PublicKey(data.subarray(offset, offset + 32));
  const api = new PublicKey(data.subarray(offset + 32, offset + 64));
  const amount = data.readBigUInt64LE(offset + 64);
  const status = data.readUInt8(offset + 72);

  return { agent, api, amount, status };
}

/**
 * HTTP 402 Payment Required middleware for Express.js
 *
 * Implements RFC 9110 Section 15.5.3 - 402 Payment Required
 * https://httpwg.org/specs/rfc9110.html#status.402
 *
 * Security features:
 * - Verifies escrow status is Active
 * - Verifies escrow amount matches price
 * - Verifies escrow.api matches provider wallet
 * - Rate limiting per IP
 * - Escrow replay prevention
 *
 * Usage:
 * ```typescript
 * app.use('/api/*', KamiyoPaymentMiddleware({
 *   realm: 'my-api',
 *   programId: ESCROW_PROGRAM_ID,
 *   connection: new Connection('https://api.devnet.solana.com'),
 *   price: 0.001,
 *   providerWallet: new PublicKey('YourWallet...'),
 *   qualityGuarantee: true
 * }));
 * ```
 */
export function KamiyoPaymentMiddleware(options: X402Options) {
  const rateLimit = options.rateLimit ?? 100;
  const rateLimitWindow = options.rateLimitWindow ?? 60000;
  const priceInLamports = BigInt(Math.floor(options.price * 1e9));

  return async (req: X402Request, res: Response, next: NextFunction) => {
    // Rate limiting by IP
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const rateEntry = rateLimitStore.get(clientIp);

    if (rateEntry) {
      if (now > rateEntry.resetAt) {
        rateLimitStore.set(clientIp, { count: 1, resetAt: now + rateLimitWindow });
      } else if (rateEntry.count >= rateLimit) {
        return res.status(429).json({
          error: 'Too Many Requests',
          message: `Rate limit exceeded. Max ${rateLimit} requests per ${rateLimitWindow / 1000}s`,
          retryAfter: Math.ceil((rateEntry.resetAt - now) / 1000),
        });
      } else {
        rateEntry.count++;
      }
    } else {
      rateLimitStore.set(clientIp, { count: 1, resetAt: now + rateLimitWindow });
    }

    const paymentProof = req.headers['x-payment-proof'] as string;

    if (!paymentProof) {
      return res.status(402)
        .set({
          'WWW-Authenticate': `Solana realm="${options.realm}"`,
          'X-Escrow-Address': 'Required',
          'X-Price': `${options.price} SOL`,
          'X-Quality-Guarantee': options.qualityGuarantee ? 'true' : 'false',
          'X-Program-Id': options.programId.toString(),
          'X-Provider-Wallet': options.providerWallet.toString(),
        })
        .json({
          error: 'Payment Required',
          message: 'This API requires payment via Solana escrow',
          amount: options.price,
          currency: 'SOL',
          escrow_program: options.programId.toString(),
          provider_wallet: options.providerWallet.toString(),
          quality_guarantee: options.qualityGuarantee || false,
          payment_flow: {
            step_1: 'Create escrow with specified amount to provider wallet',
            step_2: 'Retry request with X-Payment-Proof header (escrow address)',
            step_3: 'Receive data with quality score',
            step_4: 'Automatic dispute if quality < threshold'
          }
        });
    }

    try {
      const escrowPubkey = new PublicKey(paymentProof);

      // Check for replay attack
      if (usedEscrows.has(escrowPubkey.toString())) {
        return res.status(403).json({
          error: 'Payment Already Used',
          message: 'This escrow has already been used for a request',
          escrow: escrowPubkey.toString()
        });
      }

      const accountInfo = await options.connection.getAccountInfo(escrowPubkey);

      if (!accountInfo) {
        return res.status(403).json({
          error: 'Invalid Payment',
          message: 'Escrow account not found',
          provided: escrowPubkey.toString()
        });
      }

      if (accountInfo.owner.toString() !== options.programId.toString()) {
        return res.status(403).json({
          error: 'Invalid Payment',
          message: 'Escrow not owned by expected program',
          expected_program: options.programId.toString(),
          actual_owner: accountInfo.owner.toString()
        });
      }

      // Parse and validate escrow data
      const escrowData = parseEscrowData(accountInfo.data);

      // Verify escrow is Active
      if (escrowData.status !== EscrowStatus.Active) {
        return res.status(403).json({
          error: 'Invalid Payment',
          message: 'Escrow is not active',
          status: escrowData.status,
          expected_status: EscrowStatus.Active
        });
      }

      // Verify escrow amount >= price
      if (escrowData.amount < priceInLamports) {
        return res.status(403).json({
          error: 'Insufficient Payment',
          message: 'Escrow amount is less than required price',
          escrow_amount: Number(escrowData.amount) / 1e9,
          required_price: options.price
        });
      }

      // Verify escrow.api matches provider wallet
      if (escrowData.api.toString() !== options.providerWallet.toString()) {
        return res.status(403).json({
          error: 'Invalid Provider',
          message: 'Escrow is not addressed to this provider',
          escrow_provider: escrowData.api.toString(),
          expected_provider: options.providerWallet.toString()
        });
      }

      // Mark escrow as used (replay prevention)
      usedEscrows.add(escrowPubkey.toString());

      // Clean up old entries periodically (simple cleanup)
      if (usedEscrows.size > 10000) {
        const entries = Array.from(usedEscrows);
        entries.slice(0, 5000).forEach(e => usedEscrows.delete(e));
      }

      req.escrow = {
        pubkey: escrowPubkey,
        amount: Number(escrowData.amount) / 1e9,
        provider: escrowData.api,
        consumer: escrowData.agent,
        status: escrowData.status
      };

      next();
    } catch (err: any) {
      return res.status(403).json({
        error: 'Payment Verification Failed',
        message: err.message || 'Invalid escrow address format'
      });
    }
  };
}

/**
 * Helper to extract escrow info from request
 */
export function getEscrowInfo(req: X402Request) {
  return req.escrow;
}
