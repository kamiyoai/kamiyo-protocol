import { tool } from 'ai';
import { z } from 'zod';
import { Keypair, Connection } from '@solana/web3.js';
import {
  createSignedPayment,
  createPaymentHeader,
  generateTransactionId,
  evaluateFacilitatorPolicy,
  normalizeFacilitatorPolicy,
  selectPreferredRequirement,
  getRequirementAmountRaw,
  parseUsdcAmountUsd,
  withPaymentHeaders,
  type FacilitatorPolicy,
} from '@kamiyo/x402-client';

const USDC_DECIMALS = 6;

export interface X402ToolsConfig {
  wallet: Keypair;
  connection: Connection;
  maxPriceUsd?: number;
  preferredNetwork?: string;
  facilitatorPolicy?: FacilitatorPolicy;
}

export interface LegacyX402ToolsConfig {
  walletAddress: string;
  maxPriceUsd?: number;
  preferredNetwork?: string;
  facilitatorPolicy?: FacilitatorPolicy;
}

export interface PaymentRequirement {
  scheme: 'exact';
  network: string; // CAIP-2
  amount?: string;
  maxAmountRequired?: string;
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

function summarize(data: unknown): string {
  if (Array.isArray(data)) return `${data.length} items`;
  if (typeof data === 'object' && data !== null) {
    const keys = Object.keys(data);
    return keys.length <= 5 ? keys.join(', ') : `${keys.length} fields`;
  }
  return 'data';
}

async function checkPricing(url: string, facilitatorPolicy: FacilitatorPolicy): Promise<X402PricingResult> {
  try {
    const res = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
    if (res.status !== 402) {
      return res.ok ? { success: true, free: true } : { success: false, error: `${res.status}` };
    }
    const body = (await res.json()) as X402Response;
    if (!body.accepts?.length) return { success: false, error: 'No payment options' };

    const policyDecision = evaluateFacilitatorPolicy(body.facilitator, facilitatorPolicy);
    if (!policyDecision.allowed) {
      return { success: false, error: policyDecision.reason };
    }

    return {
      success: true,
      free: false,
      options: body.accepts.map((r) => ({
        network: r.network,
        priceUsd: parseUsdcAmountUsd(getRequirementAmountRaw(r) || '') ?? fromMicro(r.amount ?? 0),
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
  const facilitatorPolicy = normalizeFacilitatorPolicy(config.facilitatorPolicy);

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

    const policyDecision = evaluateFacilitatorPolicy(x402.facilitator, facilitatorPolicy);
    if (!policyDecision.allowed) {
      return {
        success: false,
        error: policyDecision.reason || 'Facilitator blocked by policy',
      };
    }

    const pref = config.preferredNetwork || 'solana:mainnet';
    const req = selectPreferredRequirement(x402.accepts, pref);
    const amountRaw = getRequirementAmountRaw(req);
    if (!amountRaw) return { success: false, error: 'Payment requirement missing amount' };

    const amt = parseUsdcAmountUsd(amountRaw);
    if (amt == null || amt <= 0) {
      return { success: false, error: 'Invalid payment amount in requirement' };
    }

    const max = config.maxPriceUsd ?? 0.1;

    if (amt > max) return { success: false, error: `$${amt.toFixed(4)} > max $${max.toFixed(2)}` };

    const transactionId = generateTransactionId();
    const signedPayment = createSignedPayment(
      config.wallet,
      transactionId,
      url,
      amountRaw
    );
    const paymentHeader = createPaymentHeader(signedPayment, config.wallet, req.network);

    const paid = await fetch(url, {
      method,
      headers: withPaymentHeaders(paymentHeader, {
        'Content-Type': 'application/json',
        ...headers,
      }),
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
  const facilitatorPolicy = normalizeFacilitatorPolicy(config.facilitatorPolicy);

  return {
    x402_check_pricing: tool({
      description: 'Check x402 API pricing without paying',
      parameters: z.object({
        url: z.string().url().describe('API endpoint URL'),
      }),
      execute: ({ url }) => checkPricing(url, facilitatorPolicy),
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

export function createX402ToolsConfig(
  wallet: Keypair,
  connection: Connection,
  options?: {
    maxPriceUsd?: number;
    preferredNetwork?: string;
    facilitatorPolicy?: FacilitatorPolicy;
  }
): X402ToolsConfig {
  return {
    wallet,
    connection,
    maxPriceUsd: options?.maxPriceUsd ?? 0.1,
    preferredNetwork: options?.preferredNetwork ?? 'solana:mainnet',
    facilitatorPolicy: options?.facilitatorPolicy,
  };
}
