/**
 * x402 HTTP Payment tools with real wallet signing.
 * Uses @kamiyo/x402-client for payment header creation.
 */

import { Keypair, Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import {
  createPaymentSigner,
  createSignedPayment,
  createPaymentHeader,
  generateTransactionId,
  PaymentSigner,
} from '@kamiyo/x402-client';

interface FetchResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}

// Use native fetch or fallback to https module
const httpFetch: (url: string, options?: RequestInit) => Promise<FetchResponse> =
  globalThis.fetch ?? (async (url: string, options?: RequestInit): Promise<FetchResponse> => {
    const https = await import('https');
    const http = await import('http');
    const { URL } = await import('url');

    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const protocol = parsedUrl.protocol === 'https:' ? https : http;

      const defaultHeaders: Record<string, string> = {
        'User-Agent': 'KAMIYO-MCP/1.0',
        'Accept': 'application/json',
      };
      const headers = { ...defaultHeaders, ...(options?.headers as Record<string, string>) };

      const req = protocol.request(parsedUrl, {
        method: options?.method || 'GET',
        headers,
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          resolve({
            ok: res.statusCode! >= 200 && res.statusCode! < 300,
            status: res.statusCode!,
            json: async () => JSON.parse(data),
            text: async () => data,
          });
        });
      });

      req.on('error', reject);
      if (options?.body) req.write(options.body);
      req.end();
    });
  });

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

export interface X402Config {
  wallet: Keypair;
  connection: Connection;
  maxPriceUsd: number;
  preferredNetwork: string;
}

const USDC_DECIMALS = 6;
const SOL_PRICE_USD = 150; // Approximate, should fetch from oracle in production

function fromMicro(micro: string | number): number {
  return (typeof micro === 'string' ? parseInt(micro, 10) : micro) / 10 ** USDC_DECIMALS;
}

function usdToLamports(usd: number): number {
  return Math.ceil((usd / SOL_PRICE_USD) * LAMPORTS_PER_SOL);
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
          if (typeof v === 'string') return `${k}: ${v.length > 50 ? v.slice(0, 50) + '...' : v}`;
          return `${k}: ${typeof v}`;
        })
        .join(', ');
      return preview;
    }
    return `Retrieved object with ${keys.length} fields: ${keys.slice(0, 5).join(', ')}...`;
  }
  return 'Retrieved data.';
}

export async function x402CheckPricing(
  params: { url: string },
  _config?: X402Config
): Promise<{
  success: boolean;
  free?: boolean;
  options?: Array<{ network: string; priceUsd: number; asset: string; description: string }>;
  error?: string;
}> {
  try {
    const response = await httpFetch(params.url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'KAMIYO-MCP/1.0 (Node.js)',
      },
    });

    if (response.status !== 402) {
      if (response.ok) {
        return { success: true, free: true };
      }
      const text = await response.text().catch(() => '');
      return { success: false, error: `Endpoint returned ${response.status}: ${text.slice(0, 100)}` };
    }

    const x402Response = (await response.json()) as X402Response;

    if (!x402Response.accepts || x402Response.accepts.length === 0) {
      return { success: false, error: 'No payment options available' };
    }

    const options = x402Response.accepts.map((req) => ({
      network: req.network,
      priceUsd: fromMicro(req.amount),
      asset: req.asset,
      description: req.description,
    }));

    return { success: true, free: false, options };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function x402Fetch(
  params: {
    url: string;
    method?: string;
    body?: string;
    headers?: Record<string, string>;
  },
  config: X402Config
): Promise<{
  success: boolean;
  paid?: boolean;
  data?: unknown;
  summary?: string;
  payment?: { network: string; amountUsd: number; asset: string; signature?: string };
  error?: string;
}> {
  const { url, method = 'GET', body, headers = {} } = params;

  try {
    // Initial request to check if payment required
    const initialResponse = await httpFetch(url, {
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

    // Parse 402 response
    const x402Response = (await initialResponse.json()) as X402Response;

    if (!x402Response.accepts || x402Response.accepts.length === 0) {
      return { success: false, error: 'No payment options available' };
    }

    // Select payment option
    const requirement =
      x402Response.accepts.find((r) => r.network === config.preferredNetwork) ||
      x402Response.accepts[0];

    const amountUsd = fromMicro(requirement.amount);

    if (amountUsd > config.maxPriceUsd) {
      return {
        success: false,
        error: `Price $${amountUsd.toFixed(4)} exceeds max $${config.maxPriceUsd}`,
      };
    }

    // Check balance
    const balance = await config.connection.getBalance(config.wallet.publicKey);
    const amountLamports = usdToLamports(amountUsd);

    if (balance < amountLamports + 5000) {
      return {
        success: false,
        error: `Insufficient balance: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`,
      };
    }

    // Create signed payment
    const transactionId = generateTransactionId();
    const signer = createPaymentSigner(config.wallet);

    // For now, create a signed payment header without on-chain transaction
    // The payment proof includes wallet signature proving intent to pay
    const signedPayment = createSignedPayment(
      config.wallet,
      transactionId, // Use transaction ID as placeholder until on-chain
      url,
      amountLamports
    );

    const paymentHeader = createPaymentHeader(signedPayment, config.wallet, requirement.network);

    // Retry with payment proof
    const paidResponse = await httpFetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-PAYMENT': paymentHeader,
        'X-PAYMENT-SIGNATURE': paymentHeader, // Backward compat
        ...headers,
      },
      body: body || undefined,
    });

    if (!paidResponse.ok) {
      if (paidResponse.status === 402) {
        // Payment was rejected - need to verify what the facilitator expects
        const errorBody = await paidResponse.json().catch(() => ({}));
        return {
          success: false,
          error: `Payment rejected: ${(errorBody as any).error || 'signature not accepted'}`,
        };
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
        signature: transactionId,
      },
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Create x402 config from environment/keypair
 */
export function createX402Config(
  wallet: Keypair,
  connection: Connection,
  options?: {
    maxPriceUsd?: number;
    preferredNetwork?: string;
  }
): X402Config {
  return {
    wallet,
    connection,
    maxPriceUsd: options?.maxPriceUsd ?? 1.0,
    preferredNetwork: options?.preferredNetwork ?? 'solana:mainnet',
  };
}

/**
 * Legacy config adapter for backward compatibility
 */
export interface LegacyX402Config {
  walletAddress: string;
  maxPriceUsd: number;
  preferredNetwork: string;
}

export function createX402ConfigFromLegacy(
  legacy: LegacyX402Config,
  wallet: Keypair,
  connection: Connection
): X402Config {
  return {
    wallet,
    connection,
    maxPriceUsd: legacy.maxPriceUsd,
    preferredNetwork: legacy.preferredNetwork,
  };
}
