/**
 * x402 HTTP Payment Tools
 *
 * Tools for consuming x402-gated APIs with automatic USDC payment.
 * Works with PayAI facilitator on Base, Solana, Polygon, Arbitrum.
 */

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

export interface X402Config {
  walletAddress: string;
  maxPriceUsd: number;
  preferredNetwork: string;
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
  config: X402Config
): Promise<{
  success: boolean;
  free?: boolean;
  options?: Array<{ network: string; priceUsd: number; asset: string; description: string }>;
  error?: string;
}> {
  try {
    const response = await fetch(params.url, {
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
  payment?: { network: string; amountUsd: number; asset: string };
  error?: string;
}> {
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

    const requirement =
      x402Response.accepts.find((r) => r.network === config.preferredNetwork) ||
      x402Response.accepts[0];

    const amountUsd = fromMicro(requirement.maxAmountRequired);

    if (amountUsd > config.maxPriceUsd) {
      return {
        success: false,
        error: `Price $${amountUsd} exceeds max $${config.maxPriceUsd}`,
      };
    }

    // Create payment token (placeholder - real implementation uses PayAI SDK)
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
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
