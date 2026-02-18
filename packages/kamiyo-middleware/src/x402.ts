import { Request, Response, NextFunction } from "express";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";

export interface X402Config {
  connection: Connection;
  payTo: PublicKey;
  price: number;
  network?: string;
  description?: string;
  maxReceiptAge?: number;
  escrowFallback?: boolean;
  rateLimit?: number;
  rateLimitWindow?: number;
}

export interface X402PaymentReceipt {
  signature: string;
  payer: string;
  amount: number;
  timestamp: number;
  nonce?: string;
}

export interface X402Request extends Request {
  x402?: {
    receipt: X402PaymentReceipt;
    verified: boolean;
  };
}

const usedSignatures = new Map<string, number>();
const SIGNATURE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

function isSignatureUsed(signature: string): boolean {
  const usedAt = usedSignatures.get(signature);
  if (!usedAt) return false;

  if (Date.now() - usedAt > SIGNATURE_EXPIRY_MS) {
    usedSignatures.delete(signature);
    return false;
  }

  return true;
}

function markSignatureUsed(signature: string): void {
  usedSignatures.set(signature, Date.now());

  if (usedSignatures.size > 10000) {
    const now = Date.now();
    for (const [sig, usedAt] of usedSignatures.entries()) {
      if (now - usedAt > SIGNATURE_EXPIRY_MS) {
        usedSignatures.delete(sig);
      }
    }
  }
}

export function x402Middleware(config: X402Config) {
  const maxAge = config.maxReceiptAge ?? 300; // 5 minutes default
  const rateLimit = config.rateLimit ?? 100;
  const rateLimitWindow = config.rateLimitWindow ?? 60000;

  return async (req: X402Request, res: Response, next: NextFunction) => {
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

    const paymentHeader = req.headers["payment-signature"] as string;

    if (!paymentHeader) {
      return res.status(402).set({
        "WWW-Authenticate": "X402",
      }).json({
        x402Version: 2,
        accepts: [{
          scheme: "exact",
          network: config.network || "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
          amount: String(Math.floor(config.price * 1e9)),
          asset: "SOL",
          payTo: config.payTo.toBase58(),
          resource: req.path || "/",
          description: config.description || "Payment required",
          maxTimeoutSeconds: 60,
        }],
        error: "Payment Required",
        facilitator: "",
        ...(config.escrowFallback && {
          extensions: {
            "kamiyo-escrow": {
              info: {
                required: false,
                timelockSeconds: 3600,
                qualityThreshold: 70,
                programId: "3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr",
                refundSchedule: [],
              },
            },
          },
        }),
      });
    }

    try {
      const receipt = parsePaymentHeader(paymentHeader);

      if (isSignatureUsed(receipt.signature)) {
        return res.status(403).json({
          error: "Payment Already Used",
          message: "This payment signature has already been used",
          signature: receipt.signature,
        });
      }

      const age = Math.floor(Date.now() / 1000) - receipt.timestamp;
      if (age > maxAge) {
        return res.status(403).json({
          error: "Payment Expired",
          message: `Receipt is ${age}s old, max allowed is ${maxAge}s`,
        });
      }

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

      markSignatureUsed(receipt.signature);

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
