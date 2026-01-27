import { tool } from 'ai';
import { z } from 'zod';
import { Keypair, Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import {
  createPaymentSigner,
  createSignedPayment,
  createPaymentHeader,
  generateTransactionId,
} from '@kamiyo/x402-client';

const USDC_DECIMALS = 6;
const SOL_PRICE_USD = 150; // Approximate, should fetch from oracle in production

export interface X402ToolsConfig {
  wallet: Keypair;
  connection: Connection;
  maxPriceUsd?: number;
  preferredNetwork?: string;
}

/**
 * Legacy config for backward compatibility.
 * Note: Without a Keypair, payments will be unsigned (may be rejected by facilitators).
 */
export interface LegacyX402ToolsConfig {
  walletAddress: string;
  maxPriceUsd?: number;
  preferredNetwork?: string;
}

export interface PaymentRequirement {
  scheme: 'exact';
  network: string; // CAIP-2
  amount: string;
  resource: string;
  description: string;
  payTo: string;
  asset: string;
  maxTimeoutSeconds: number;
  extensions?: Record<string, unknown>;
}

export interface X402Response {
  x402Version: 2;
  accepts: PaymentRequirement[];
  error?: string;
  facilitator?: string;
}

export interface X402PricingResult {
  success: boolean;
  free?: boolean;
  options?: Array<{ network: string; priceUsd: number; asset: string; description: string }>;
  error?: string;
}

export interface X402FetchResult {
  success: boolean;
  paid?: boolean;
  data?: unknown;
  summary?: string;
  payment?: { network: string; amountUsd: number; asset: string; transactionId?: string };
  error?: string;
}

function fromMicro(v: string | number): number {
  return (typeof v === 'string' ? parseInt(v, 10) : v) / 10 ** USDC_DECIMALS;
}

function usdToLamports(usd: number): number {
  return Math.ceil((usd / SOL_PRICE_USD) * LAMPORTS_PER_SOL);
}

function summarize(data: unknown): string {
  if (Array.isArray(data)) return `${data.length} items`;
  if (typeof data === 'object' && data !== null) {
    const keys = Object.keys(data);
    return keys.length <= 5 ? keys.join(', ') : `${keys.length} fields`;
  }
  return 'data';
}

async function checkPricing(url: string): Promise<X402PricingResult> {
  try {
    const res = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
    if (res.status !== 402) {
      return res.ok ? { success: true, free: true } : { success: false, error: `${res.status}` };
    }
    const body = (await res.json()) as X402Response;
    if (!body.accepts?.length) return { success: false, error: 'No payment options' };
    return {
      success: true,
      free: false,
      options: body.accepts.map((r) => ({
        network: r.network,
        priceUsd: fromMicro(r.amount),
        asset: r.asset,
        description: r.description,
      })),
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

async function x402Fetch(
  params: { url: string; method?: string; body?: string; headers?: Record<string, string> },
  config: X402ToolsConfig
): Promise<X402FetchResult> {
  const { url, method = 'GET', body, headers = {} } = params;

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body || undefined,
    });

    if (res.status !== 402) {
      if (!res.ok) return { success: false, error: `${res.status}` };
      const data = await res.json();
      return { success: true, paid: false, data, summary: summarize(data) };
    }

    const x402 = (await res.json()) as X402Response;
    if (!x402.accepts?.length) return { success: false, error: 'No payment options' };

    const pref = config.preferredNetwork || 'solana:mainnet';
    const req = x402.accepts.find((r) => r.network.includes(pref)) || x402.accepts[0];
    const amt = fromMicro(req.amount);
    const max = config.maxPriceUsd ?? 0.1;

    if (amt > max) return { success: false, error: `$${amt.toFixed(4)} > max $${max.toFixed(2)}` };

    // Check balance
    const balance = await config.connection.getBalance(config.wallet.publicKey);
    const amountLamports = usdToLamports(amt);

    if (balance < amountLamports + 5000) {
      return {
        success: false,
        error: `Insufficient balance: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`,
      };
    }

    // Create signed payment header
    const transactionId = generateTransactionId();
    const signedPayment = createSignedPayment(
      config.wallet,
      transactionId,
      url,
      amountLamports
    );
    const paymentHeader = createPaymentHeader(signedPayment, config.wallet, req.network);

    const paid = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-PAYMENT': paymentHeader,
        'PAYMENT-SIGNATURE': paymentHeader, // Backward compat
        ...headers,
      },
      body: body || undefined,
    });

    if (!paid.ok) {
      return { success: false, error: paid.status === 402 ? 'Payment rejected' : `${paid.status}` };
    }

    const data = await paid.json();
    return {
      success: true,
      paid: true,
      data,
      summary: summarize(data),
      payment: { network: req.network, amountUsd: amt, asset: req.asset, transactionId },
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

export function createX402Tools(config: X402ToolsConfig) {
  return {
    x402_check_pricing: tool({
      description: 'Check x402 API pricing without paying',
      parameters: z.object({
        url: z.string().url().describe('API endpoint URL'),
      }),
      execute: ({ url }) => checkPricing(url),
    }),

    x402_fetch: tool({
      description: 'Fetch from x402 API with automatic USDC payment',
      parameters: z.object({
        url: z.string().url().describe('API endpoint URL'),
        method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).optional(),
        body: z.string().optional().describe('JSON body for POST/PUT'),
        headers: z.record(z.string()).optional(),
      }),
      execute: (params) => x402Fetch(params, config),
    }),
  };
}

/**
 * Create config from keypair and connection
 */
export function createX402ToolsConfig(
  wallet: Keypair,
  connection: Connection,
  options?: { maxPriceUsd?: number; preferredNetwork?: string }
): X402ToolsConfig {
  return {
    wallet,
    connection,
    maxPriceUsd: options?.maxPriceUsd ?? 0.1,
    preferredNetwork: options?.preferredNetwork ?? 'solana:mainnet',
  };
}
