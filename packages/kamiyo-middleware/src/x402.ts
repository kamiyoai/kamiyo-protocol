/**
 * x402 Protocol Integration
 *
 * Implements x402 micropayment standard for AI agent economies.
 * Enables ~400ms payment finality for streaming payments.
 *
 * x402 Protocol: https://x402.org
 *
 * Flow:
 * 1. Agent requests resource
 * 2. Server returns 402 with x402-* headers
 * 3. Agent creates payment receipt
 * 4. Agent retries with X-PAYMENT header
 * 5. Server verifies and grants access
 *
 * Security:
 * - Nonce tracking prevents replay attacks
 * - Receipt age validation
 * - On-chain transaction verification
 */

import { Request, Response, NextFunction } from "express";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";

// ============================================================================
// Types
// ============================================================================

export interface X402Config {
  /** Solana RPC connection */
  connection: Connection;
  /** Recipient wallet for payments */
  payTo: PublicKey;
  /** Price in SOL */
  price: number;
  /** Network (mainnet-beta, devnet) */
  network?: string;
  /** Payment description */
  description?: string;
  /** Maximum age of payment receipt in seconds (default: 300) */
  maxReceiptAge?: number;
  /** Enable quality-guaranteed escrow fallback */
  escrowFallback?: boolean;
  /** Rate limit: max requests per window (default: 100) */
  rateLimit?: number;
  /** Rate limit window in ms (default: 60000 = 1 minute) */
  rateLimitWindow?: number;
}

export interface X402PaymentReceipt {
  /** Payment transaction signature */
  signature: string;
  /** Payer public key */
  payer: string;
  /** Amount paid (lamports) */
  amount: number;
  /** Timestamp */
  timestamp: number;
  /** Unique nonce to prevent replay */
  nonce?: string;
}

export interface X402Request extends Request {
  x402?: {
    receipt: X402PaymentReceipt;
    verified: boolean;
  };
}

// ============================================================================
// Replay Prevention (in production, use Redis with TTL)
// ============================================================================

// Track used signatures to prevent replay attacks
const usedSignatures = new Map<string, number>();
const SIGNATURE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

// Rate limiting store
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

/**
 * Check if signature was already used (replay attack prevention)
 */
function isSignatureUsed(signature: string): boolean {
  const usedAt = usedSignatures.get(signature);
  if (!usedAt) return false;

  // Check if signature has expired
  if (Date.now() - usedAt > SIGNATURE_EXPIRY_MS) {
    usedSignatures.delete(signature);
    return false;
  }

  return true;
}

/**
 * Mark signature as used
 */
function markSignatureUsed(signature: string): void {
  usedSignatures.set(signature, Date.now());

  // Cleanup old signatures periodically
  if (usedSignatures.size > 10000) {
    const now = Date.now();
    for (const [sig, usedAt] of usedSignatures.entries()) {
      if (now - usedAt > SIGNATURE_EXPIRY_MS) {
        usedSignatures.delete(sig);
      }
    }
  }
}

// ============================================================================
// Middleware
// ============================================================================

/**
 * x402 Payment Middleware
 *
 * Implements the x402 protocol for micropayments with security features:
 * - Replay attack prevention via signature tracking
 * - Rate limiting per IP
 * - Receipt age validation
 * - On-chain transaction verification
 *
 * @example
 * ```typescript
 * import { x402Middleware } from '@kamiyo/middleware';
 *
 * app.use('/api/premium', x402Middleware({
 *   connection: new Connection('https://api.mainnet-beta.solana.com'),
 *   payTo: new PublicKey('YourWallet...'),
 *   price: 0.001,
 *   description: 'Premium API access'
 * }));
 * ```
 */
export function x402Middleware(config: X402Config) {
  const maxAge = config.maxReceiptAge ?? 300; // 5 minutes default
  const rateLimit = config.rateLimit ?? 100;
  const rateLimitWindow = config.rateLimitWindow ?? 60000;

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

    const paymentHeader = req.headers["x-payment"] as string;

    // No payment - return 402 with payment requirements
    if (!paymentHeader) {
      return res.status(402).set({
        "x402-version": "1",
        "x402-price": config.price.toString(),
        "x402-currency": "SOL",
        "x402-network": config.network || "mainnet-beta",
        "x402-pay-to": config.payTo.toBase58(),
        "x402-description": config.description || "Payment required",
        ...(config.escrowFallback && {
          "x402-escrow-supported": "true",
          "x402-escrow-program": "8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM",
        }),
      }).json({
        error: "Payment Required",
        protocol: "x402",
        version: 1,
        price: config.price,
        currency: "SOL",
        network: config.network || "mainnet-beta",
        payTo: config.payTo.toBase58(),
        description: config.description,
        escrowFallback: config.escrowFallback || false,
      });
    }

    // Verify payment
    try {
      const receipt = parsePaymentHeader(paymentHeader);

      // Check for replay attack - signature already used
      if (isSignatureUsed(receipt.signature)) {
        return res.status(403).json({
          error: "Payment Already Used",
          message: "This payment signature has already been used",
          signature: receipt.signature,
        });
      }

      // Verify receipt age
      const age = Math.floor(Date.now() / 1000) - receipt.timestamp;
      if (age > maxAge) {
        return res.status(403).json({
          error: "Payment Expired",
          message: `Receipt is ${age}s old, max allowed is ${maxAge}s`,
        });
      }

      // Verify transaction on-chain
      const verified = await verifyPayment(
        config.connection,
        receipt,
        config.payTo,
        Math.floor(config.price * 1e9)
      );

      if (!verified) {
        return res.status(403).json({
          error: "Payment Invalid",
          message: "Transaction verification failed",
        });
      }

      // Mark signature as used (replay prevention)
      markSignatureUsed(receipt.signature);

      // Attach verified receipt to request
      req.x402 = {
        receipt,
        verified: true,
      };

      next();
    } catch (err: any) {
      return res.status(403).json({
        error: "Payment Verification Failed",
        message: err.message,
      });
    }
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse X-PAYMENT header
 * Format: signature:payer:amount:timestamp
 */
function parsePaymentHeader(header: string): X402PaymentReceipt {
  const parts = header.split(":");
  if (parts.length !== 4) {
    throw new Error("Invalid payment header format");
  }

  return {
    signature: parts[0],
    payer: parts[1],
    amount: parseInt(parts[2], 10),
    timestamp: parseInt(parts[3], 10),
  };
}

/**
 * Verify payment transaction on-chain
 */
async function verifyPayment(
  connection: Connection,
  receipt: X402PaymentReceipt,
  expectedRecipient: PublicKey,
  expectedAmount: number
): Promise<boolean> {
  try {
    const tx = await connection.getTransaction(receipt.signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });

    if (!tx) {
      return false;
    }

    // Check transaction was successful
    if (tx.meta?.err) {
      return false;
    }

    // Verify the transfer
    const preBalances = tx.meta?.preBalances || [];
    const postBalances = tx.meta?.postBalances || [];
    const accountKeys = tx.transaction.message.staticAccountKeys || [];

    // Find recipient in account keys
    const recipientIndex = accountKeys.findIndex(
      (key) => key.toBase58() === expectedRecipient.toBase58()
    );

    if (recipientIndex === -1) {
      return false;
    }

    // Check balance increased by expected amount
    const balanceChange = postBalances[recipientIndex] - preBalances[recipientIndex];
    if (balanceChange < expectedAmount) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Create payment receipt for client-side use
 */
export function createPaymentReceipt(
  signature: string,
  payer: PublicKey,
  amount: number
): string {
  const timestamp = Math.floor(Date.now() / 1000);
  return `${signature}:${payer.toBase58()}:${amount}:${timestamp}`;
}

/**
 * Client helper: Create X-PAYMENT header value
 */
export function formatPaymentHeader(receipt: X402PaymentReceipt): string {
  return `${receipt.signature}:${receipt.payer}:${receipt.amount}:${receipt.timestamp}`;
}
