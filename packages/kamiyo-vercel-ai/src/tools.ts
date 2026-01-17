/**
 * x402 Tools for Vercel AI SDK
 *
 * Provides tool definitions for AI agents to make paid API requests.
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
  options?: Array<{
    network: string;
    priceUsd: number;
    asset: string;
    description: string;
  }>;
  error?: string;
}

export interface X402FetchResult {
  success: boolean;
  paid?: boolean;
  data?: unknown;
  summary?: string;
  payment?: {
    network: string;
    amountUsd: number;
    asset: string;
  };
  error?: string;
}

function fromMicro(micro: string | number): number {
  return (typeof micro === 'string' ? parseInt(micro, 10) : micro) / 10 ** USDC_DECIMALS;
}

function summarize(data: unknown): string {
  if (Array.isArray(data)) {
    return `Retrieved ${data.length} items.`;
  }
  if (typeof data === 'object' && data !== null) {
    const keys = Object.keys(data);
    if (keys.length <= 5) {
      const preview = keys
        .map((k) => {
          const v = (data as Record<string, unknown>)[k];
          if (typeof v === 'number') return `${k}: ${v.toLocaleString()}`;
          if (typeof v === 'string')
            return `${k}: ${v.length > 50 ? v.slice(0, 50) + '...' : v}`;
          return `${k}: ${typeof v}`;
        })
        .join(', ');
      return preview;
    }
    return `Retrieved object with ${keys.length} fields: ${keys.slice(0, 5).join(', ')}...`;
  }
  return 'Retrieved data.';
}

async function checkPricing(url: string): Promise<X402PricingResult> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (response.status !== 402) {
      if (response.ok) {
        return { success: true, free: true };
      }
      return { success: false, error: `Endpoint returned ${response.status}` };
    }

    const x402Response = (await response.json()) as X402Response;

    if (!x402Response.accepts || x402Response.accepts.length === 0) {
      return { success: false, error: 'No payment options available' };
    }

    const options = x402Response.accepts.map((req) => ({
      network: req.network,
      priceUsd: fromMicro(req.maxAmountRequired),
      asset: req.asset,
      description: req.description,
    }));

    return { success: true, free: false, options };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

async function x402Fetch(
  params: {
    url: string;
    method?: string;
    body?: string;
    headers?: Record<string, string>;
  },
  config: X402ToolsConfig
): Promise<X402FetchResult> {
  const { url, method = 'GET', body, headers = {} } = params;

  try {
    const initialResponse = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body || undefined,
    });

    if (initialResponse.status !== 402) {
      if (initialResponse.ok) {
        const data = await initialResponse.json();
        return { success: true, paid: false, data, summary: summarize(data) };
      }
      return { success: false, error: `Endpoint returned ${initialResponse.status}` };
    }

    const x402Response = (await initialResponse.json()) as X402Response;

    if (!x402Response.accepts || x402Response.accepts.length === 0) {
      return { success: false, error: 'No payment options available' };
    }

    const preferred = config.preferredNetwork || 'base';
    const requirement =
      x402Response.accepts.find((r) => r.network.includes(preferred)) ||
      x402Response.accepts[0];

    const amountUsd = fromMicro(requirement.maxAmountRequired);
    const maxPrice = config.maxPriceUsd ?? 0.1;

    if (amountUsd > maxPrice) {
      return {
        success: false,
        error: `Price $${amountUsd.toFixed(4)} exceeds max $${maxPrice.toFixed(2)}`,
      };
    }

    const paymentHeader = Buffer.from(
      JSON.stringify({
        version: 1,
        payer: config.walletAddress,
        payTo: requirement.payTo,
        amount: requirement.maxAmountRequired,
        network: requirement.network,
        asset: requirement.asset,
        timestamp: Math.floor(Date.now() / 1000),
        nonce: Math.random().toString(36).substring(2, 10),
      })
    ).toString('base64');

    const paidResponse = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Payment': paymentHeader,
        ...headers,
      },
      body: body || undefined,
    });

    if (!paidResponse.ok) {
      if (paidResponse.status === 402) {
        return { success: false, error: 'Payment rejected by server' };
      }
      return { success: false, error: `API returned ${paidResponse.status} after payment` };
    }

    const data = await paidResponse.json();

    return {
      success: true,
      paid: true,
      data,
      summary: summarize(data),
      payment: {
        network: requirement.network,
        amountUsd,
        asset: requirement.asset,
      },
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

export function createX402Tools(config: X402ToolsConfig) {
  return {
    x402_check_pricing: tool({
      description:
        'Check pricing for an x402-gated API endpoint without making payment. Returns available payment options and prices.',
      parameters: z.object({
        url: z.string().url().describe('The x402-gated API endpoint URL to check'),
      }),
      execute: async ({ url }) => {
        return checkPricing(url);
      },
    }),

    x402_fetch: tool({
      description:
        'Fetch data from an x402-gated API endpoint with automatic USDC payment. Handles the 402 payment flow automatically. Supports Base, Solana, Polygon, and Arbitrum networks.',
      parameters: z.object({
        url: z.string().url().describe('The x402-gated API endpoint URL'),
        method: z
          .enum(['GET', 'POST', 'PUT', 'DELETE'])
          .optional()
          .describe('HTTP method (default: GET)'),
        body: z.string().optional().describe('Request body as JSON string (for POST/PUT)'),
        headers: z
          .record(z.string())
          .optional()
          .describe('Additional headers as key-value pairs'),
      }),
      execute: async (params) => {
        return x402Fetch(params, config);
      },
    }),
  };
}

export const x402Tools = createX402Tools({
  walletAddress: process.env.X402_WALLET_ADDRESS || '',
  maxPriceUsd: parseFloat(process.env.X402_MAX_PRICE_USD || '0.10'),
  preferredNetwork: process.env.X402_PREFERRED_NETWORK || 'base',
});
