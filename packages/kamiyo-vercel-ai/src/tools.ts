/**
 * x402 tools for Vercel AI SDK.
 *
 * NOTE: The payment header generated here is unsigned - for testing/demo only.
 * Production requires EIP-712 signing via @kamiyo/x402-client or @x402/evm.
 */

import { tool } from 'ai';
import { z } from 'zod';

const USDC_DECIMALS = 6;

export interface X402ToolsConfig {
  walletAddress: string;
  maxPriceUsd?: number;
  preferredNetwork?: string;
}

export interface PaymentRequirement {
  scheme: 'exact' | 'upto';
  network: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  payTo: string;
  asset: string;
  maxTimeoutSeconds: number;
}

export interface X402Response {
  x402Version: number;
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
  payment?: { network: string; amountUsd: number; asset: string };
  error?: string;
}

function fromMicro(v: string | number): number {
  return (typeof v === 'string' ? parseInt(v, 10) : v) / 10 ** USDC_DECIMALS;
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
        priceUsd: fromMicro(r.maxAmountRequired),
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

    const pref = config.preferredNetwork || 'base';
    const req = x402.accepts.find((r) => r.network.includes(pref)) || x402.accepts[0];
    const amt = fromMicro(req.maxAmountRequired);
    const max = config.maxPriceUsd ?? 0.1;

    if (amt > max) return { success: false, error: `$${amt.toFixed(4)} > max $${max.toFixed(2)}` };

    // DEMO: unsigned header - production needs EIP-712 signature
    const paymentHeader = Buffer.from(
      JSON.stringify({
        version: 1,
        payer: config.walletAddress,
        payTo: req.payTo,
        amount: req.maxAmountRequired,
        network: req.network,
        asset: req.asset,
        timestamp: Math.floor(Date.now() / 1000),
        nonce: Math.random().toString(36).slice(2, 10),
      })
    ).toString('base64');

    const paid = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Payment': paymentHeader, ...headers },
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
      payment: { network: req.network, amountUsd: amt, asset: req.asset },
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

export const x402Tools = createX402Tools({
  walletAddress: process.env.X402_WALLET_ADDRESS || '',
  maxPriceUsd: parseFloat(process.env.X402_MAX_PRICE_USD || '0.10'),
  preferredNetwork: process.env.X402_PREFERRED_NETWORK || 'base',
});
