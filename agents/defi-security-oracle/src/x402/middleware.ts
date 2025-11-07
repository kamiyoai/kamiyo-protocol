import { Request, Response, NextFunction } from 'express';
import { Connection, PublicKey } from '@solana/web3.js';
import {
  X402PaymentRequest,
  X402Payment,
  X402PaymentResponse,
  X402Error
} from './types.js';

const SOLANA_RPC = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const PAYMENT_WALLET = process.env.PAYMENT_WALLET || '';
const PRICE_PER_REQUEST_LAMPORTS = 1_000_000; // 0.001 SOL

interface PaymentProof {
  signature: string;
  amount: number;
  timestamp: number;
  requestCount: number;
}

const paymentCache = new Map<string, PaymentProof>();
const connection = new Connection(SOLANA_RPC, 'confirmed');

export function x402Middleware(options: {
  price: number;
  resource: string;
  maxTimeoutSeconds?: number;
}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const paymentHeader = req.headers['x-payment'] as string;

    if (!paymentHeader) {
      return send402Response(res, options.resource, options.price);
    }

    try {
      const paymentData = decodeX402Payment(paymentHeader);

      if (paymentData.x402Version !== 1) {
        return sendX402Error(res, 'Unsupported x402 version', 400);
      }

      if (paymentData.network !== 'solana-mainnet') {
        return sendX402Error(res, 'Unsupported network', 400);
      }

      const verification = await verifyPayment(paymentData);

      if (!verification.success) {
        return sendX402Error(res, verification.error || 'Payment verification failed', 402);
      }

      const cached = paymentCache.get(paymentData.payload.signature);
      if (cached) {
        if (Date.now() - cached.timestamp > 3600000) {
          paymentCache.delete(paymentData.payload.signature);
          return send402Response(res, options.resource, options.price);
        }
        cached.requestCount++;
      } else {
        paymentCache.set(paymentData.payload.signature, {
          signature: paymentData.payload.signature,
          amount: parseInt(paymentData.payload.amount),
          timestamp: Date.now(),
          requestCount: 1
        });
      }

      const paymentResponse: X402PaymentResponse = {
        txHash: paymentData.payload.signature,
        networkId: 'solana-mainnet',
        success: true,
        amount: paymentData.payload.amount,
        timestamp: Date.now(),
        resourceAccess: {
          expiresAt: Date.now() + 3600000,
          requestsRemaining: -1
        }
      };

      res.setHeader('X-PAYMENT-RESPONSE', Buffer.from(JSON.stringify(paymentResponse)).toString('base64'));

      next();
    } catch (error: any) {
      console.error('x402 middleware error:', error);
      return sendX402Error(res, error.message || 'Invalid payment format', 400);
    }
  };
}

function decodeX402Payment(header: string): X402Payment {
  try {
    const decoded = Buffer.from(header, 'base64').toString('utf-8');
    const payment = JSON.parse(decoded);

    if (!payment.x402Version || !payment.scheme || !payment.network || !payment.payload) {
      throw new Error('Missing required x402 fields');
    }

    if (!payment.payload.signature || !payment.payload.amount || !payment.payload.recipient) {
      throw new Error('Missing required payload fields');
    }

    return payment;
  } catch (error: any) {
    throw new Error(`Failed to decode x402 payment: ${error.message}`);
  }
}

async function verifyPayment(payment: X402Payment): Promise<{ success: boolean; error?: string }> {
  try {
    const { signature, amount, recipient } = payment.payload;

    if (paymentCache.has(signature)) {
      return { success: true };
    }

    const tx = await connection.getTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0
    });

    if (!tx || !tx.meta) {
      return { success: false, error: 'Transaction not found or not confirmed' };
    }

    const recipientIndex = tx.transaction.message.getAccountKeys().staticAccountKeys
      .findIndex(key => key.toString() === recipient);

    if (recipientIndex === -1) {
      return { success: false, error: 'Payment recipient mismatch' };
    }

    if (recipient !== PAYMENT_WALLET) {
      return { success: false, error: 'Invalid payment recipient' };
    }

    const preBalance = tx.meta.preBalances[recipientIndex];
    const postBalance = tx.meta.postBalances[recipientIndex];
    const amountTransferred = postBalance - preBalance;

    if (amountTransferred < PRICE_PER_REQUEST_LAMPORTS) {
      return {
        success: false,
        error: `Insufficient payment: ${amountTransferred} lamports (required: ${PRICE_PER_REQUEST_LAMPORTS})`
      };
    }

    const payloadAmount = parseInt(amount);
    if (Math.abs(amountTransferred - payloadAmount) > 100) {
      return {
        success: false,
        error: 'Payment amount mismatch'
      };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Payment verification error:', error);
    return {
      success: false,
      error: error.message || 'Payment verification failed'
    };
  }
}

function send402Response(res: Response, resource: string, price: number) {
  const response: X402PaymentRequest = {
    x402Version: 1,
    accepts: [
      {
        scheme: 'exact',
        network: 'solana-mainnet',
        maxAmountRequired: PRICE_PER_REQUEST_LAMPORTS.toString(),
        resource,
        payTo: PAYMENT_WALLET,
        asset: 'SOL',
        maxTimeoutSeconds: 300,
        metadata: {
          priceUSD: price,
          cacheExpirySeconds: 3600,
          description: 'DeFi security intelligence and exploit data'
        }
      }
    ],
    error: 'Payment Required',
    message: 'Send SOL payment to access this resource. Include transaction signature in X-PAYMENT header.'
  };

  res.status(402)
    .header('Content-Type', 'application/json')
    .header('X-PAYMENT-REQUIRED', 'true')
    .json(response);
}

function sendX402Error(res: Response, error: string, code: number) {
  const response: X402Error = {
    x402Version: 1,
    error,
    code,
    details: code === 402 ? 'Payment required to access this resource' : undefined
  };

  res.status(code)
    .header('Content-Type', 'application/json')
    .json(response);
}

export function cleanExpiredPayments() {
  const now = Date.now();
  for (const [signature, proof] of paymentCache.entries()) {
    if (now - proof.timestamp > 3600000) {
      paymentCache.delete(signature);
    }
  }
}

setInterval(cleanExpiredPayments, 5 * 60 * 1000);
