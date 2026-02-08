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

interface FetchResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}

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

export interface X402Config {
  wallet: Keypair;
  connection: Connection;
  maxPriceUsd: number;
  preferredNetwork: string;
  facilitatorPolicy?: FacilitatorPolicy;
}

const USDC_DECIMALS = 6;

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
  config?: X402Config
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
    const policy = normalizeFacilitatorPolicy(config?.facilitatorPolicy);
    const policyDecision = evaluateFacilitatorPolicy(x402Response.facilitator, policy);
    if (!policyDecision.allowed) {
      return { success: false, error: policyDecision.reason || 'Facilitator blocked by policy' };
    }

    if (!x402Response.accepts || x402Response.accepts.length === 0) {
      return { success: false, error: 'No payment options available' };
    }

    const options = x402Response.accepts.map((req) => ({
      network: req.network,
      priceUsd: parseUsdcAmountUsd(getRequirementAmountRaw(req) || '') ?? fromMicro(req.amount ?? 0),
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
  const facilitatorPolicy = normalizeFacilitatorPolicy(config.facilitatorPolicy);

  try {
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

    const x402Response = (await initialResponse.json()) as X402Response;
    const policyDecision = evaluateFacilitatorPolicy(x402Response.facilitator, facilitatorPolicy);
    if (!policyDecision.allowed) {
      return { success: false, error: policyDecision.reason || 'Facilitator blocked by policy' };
    }

    if (!x402Response.accepts || x402Response.accepts.length === 0) {
      return { success: false, error: 'No payment options available' };
    }

    const requirement = selectPreferredRequirement(x402Response.accepts, config.preferredNetwork);
    const amountRaw = getRequirementAmountRaw(requirement);
    if (!amountRaw) {
      return { success: false, error: 'Payment requirement missing amount' };
    }

    const amountUsd = parseUsdcAmountUsd(amountRaw);
    if (amountUsd == null || amountUsd <= 0) {
      return { success: false, error: 'Invalid payment amount in requirement' };
    }

    if (amountUsd > config.maxPriceUsd) {
      return {
        success: false,
        error: `Price $${amountUsd.toFixed(4)} exceeds max $${config.maxPriceUsd}`,
      };
    }

    const transactionId = generateTransactionId();
    const signedPayment = createSignedPayment(
      config.wallet,
      transactionId,
      url,
      amountRaw
    );

    const paymentHeader = createPaymentHeader(signedPayment, config.wallet, requirement.network);

    const paidResponse = await httpFetch(url, {
      method,
      headers: withPaymentHeaders(paymentHeader, {
        'Content-Type': 'application/json',
        ...headers,
      }),
      body: body || undefined,
    });

    if (!paidResponse.ok) {
      if (paidResponse.status === 402) {
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

export function createX402Config(
  wallet: Keypair,
  connection: Connection,
  options?: {
    maxPriceUsd?: number;
    preferredNetwork?: string;
    facilitatorPolicy?: FacilitatorPolicy;
  }
): X402Config {
  return {
    wallet,
    connection,
    maxPriceUsd: options?.maxPriceUsd ?? 1.0,
    preferredNetwork: options?.preferredNetwork ?? 'solana:mainnet',
    facilitatorPolicy: options?.facilitatorPolicy,
  };
}

export interface LegacyX402Config {
  walletAddress: string;
  maxPriceUsd: number;
  preferredNetwork: string;
  facilitatorPolicy?: FacilitatorPolicy;
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
    facilitatorPolicy: legacy.facilitatorPolicy,
  };
}
