import type { ToolConfig, ToolResult } from './types.js';

const URL_REGEX = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;

function isValidUrl(str: unknown): str is string {
  return typeof str === 'string' && URL_REGEX.test(str);
}

function sanitizeError(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes('fetch failed')) return 'Network error';
    if (error.message.includes('402')) return 'Payment required';
    if (error.message.includes('timeout')) return 'Request timeout';
    return 'Request failed';
  }
  return 'Unknown error';
}

export interface X402ToolsConfig {
  /** Base URL for KAMIYO x402 API (default: https://x402.kamiyo.ai) */
  baseUrl?: string;
  /** Payment signer function - signs payment requests */
  signPayment?: (requirement: PaymentRequirement) => Promise<string>;
  /** Wallet address for payments */
  payerAddress?: string;
  /** Reputation threshold for tiered pricing (0-100) */
  reputationThreshold?: number;
  /** Whether to use escrow for payments (default: true) */
  useEscrow?: boolean;
  /** SLA timeout in milliseconds (default: 5000) */
  slaTimeoutMs?: number;
  /** Auto-dispute on SLA violation (default: true) */
  autoDispute?: boolean;
}

export interface PaymentRequirement {
  scheme: string;
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  resource: string;
  description: string;
}

interface X402Response {
  x402Version: number;
  accepts: PaymentRequirement[];
  error?: string;
  facilitator?: string;
  pricing?: {
    basePrice: number;
    yourPrice: number;
    yourTier: string;
    yourDiscount: number;
    tiers: Array<{
      name: string;
      minThreshold: number;
      price: number;
      discountPercent: number;
    }>;
  };
  settlement?: {
    enabled: boolean;
    endpoint: string;
    slaTimeoutMs: number;
  };
}

async function checkPricing(url: string, reputationThreshold?: number): Promise<X402Response | null> {
  try {
    const headers: Record<string, string> = {};
    if (reputationThreshold !== undefined) {
      headers['X-Reputation-Threshold'] = String(reputationThreshold);
    }

    const res = await fetch(url, { method: 'GET', headers });

    if (res.status !== 402) {
      return null;
    }

    return (await res.json()) as X402Response;
  } catch {
    return null;
  }
}

async function fetchWithPayment<T>(
  url: string,
  paymentHeader: string,
  options?: {
    method?: string;
    body?: unknown;
    timeout?: number;
  }
): Promise<{ success: boolean; data?: T; latencyMs?: number; error?: string }> {
  const start = Date.now();

  try {
    const controller = new AbortController();
    const timeout = options?.timeout || 30000;
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const res = await fetch(url, {
      method: options?.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Payment': paymentHeader,
      },
      body: options?.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const latencyMs = Date.now() - start;

    if (!res.ok) {
      if (res.status === 402) {
        return { success: false, error: 'Payment rejected', latencyMs };
      }
      return { success: false, error: `HTTP ${res.status}`, latencyMs };
    }

    const data = (await res.json()) as T;
    return { success: true, data, latencyMs };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error && error.name === 'AbortError' ? 'Timeout' : sanitizeError(error),
      latencyMs: Date.now() - start,
    };
  }
}

async function requestSettlement(
  baseUrl: string,
  paymentRef: string,
  violation: string,
  evidence?: string
): Promise<{ success: boolean; settlementId?: string; refundPercent?: number; error?: string }> {
  try {
    const res = await fetch(`${baseUrl}/api/settlement/${encodeURIComponent(paymentRef)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ violation, evidence }),
    });

    if (!res.ok) {
      const error = (await res.json().catch(() => ({}))) as { error?: string };
      return { success: false, error: error.error || `HTTP ${res.status}` };
    }

    const data = (await res.json()) as { settlementId: string; refundPercent: number };
    return { success: true, settlementId: data.settlementId, refundPercent: data.refundPercent };
  } catch (error) {
    return { success: false, error: sanitizeError(error) };
  }
}

export function createX402Tools(config: X402ToolsConfig = {}): ToolConfig[] {
  const baseUrl = config.baseUrl || 'https://x402.kamiyo.ai';
  const slaTimeoutMs = config.slaTimeoutMs || 5000;
  const autoDispute = config.autoDispute ?? true;

  return [
    {
      name: 'x402_check_pricing',
      description: 'Check pricing for an x402-gated API endpoint. Returns payment requirements and tiered pricing options.',
      parameters: {
        url: { type: 'string', description: 'Full URL of the x402 endpoint to check', required: true },
      },
      handler: async (params): Promise<ToolResult> => {
        if (!isValidUrl(params.url)) {
          return { success: false, error: 'Invalid URL' };
        }

        const pricing = await checkPricing(params.url as string, config.reputationThreshold);
        if (!pricing) {
          return { success: true, data: { paymentRequired: false, message: 'Endpoint does not require payment' } };
        }

        return {
          success: true,
          data: {
            paymentRequired: true,
            accepts: pricing.accepts,
            pricing: pricing.pricing,
            settlement: pricing.settlement,
            facilitator: pricing.facilitator,
          },
        };
      },
    },
    {
      name: 'x402_fetch',
      description: 'Fetch data from an x402-gated API with payment. Automatically handles payment signing and SLA monitoring.',
      parameters: {
        url: { type: 'string', description: 'Full URL of the x402 endpoint', required: true },
        payment_header: { type: 'string', description: 'Signed payment header (base64 encoded)', required: true },
      },
      handler: async (params): Promise<ToolResult> => {
        if (!isValidUrl(params.url)) {
          return { success: false, error: 'Invalid URL' };
        }
        if (typeof params.payment_header !== 'string' || !params.payment_header) {
          return { success: false, error: 'Payment header required' };
        }

        const result = await fetchWithPayment(
          params.url as string,
          params.payment_header as string,
          { timeout: slaTimeoutMs * 2 }
        );

        // Check for SLA violation
        if (result.latencyMs && result.latencyMs > slaTimeoutMs && autoDispute) {
          return {
            success: false,
            error: `SLA violation: response took ${result.latencyMs}ms (limit: ${slaTimeoutMs}ms)`,
            data: { violation: 'latency', latencyMs: result.latencyMs, slaTimeoutMs },
          };
        }

        if (!result.success) {
          return { success: false, error: result.error };
        }

        const responseData = result.data as Record<string, unknown> | undefined;
        return {
          success: true,
          data: {
            ...(responseData || {}),
            _meta: { latencyMs: result.latencyMs },
          },
        };
      },
    },
    {
      name: 'query_agent_profile',
      description: 'Query a KAMIYO agent profile via x402 payment. Returns agent identity, capabilities, stake, and endpoints.',
      parameters: {
        agent_id: { type: 'string', description: 'Agent ID to query', required: true },
        payment_header: { type: 'string', description: 'Signed payment header', required: true },
      },
      handler: async (params): Promise<ToolResult> => {
        const agentId = params.agent_id;
        if (typeof agentId !== 'string' || !agentId || agentId.length > 100) {
          return { success: false, error: 'Invalid agent ID' };
        }
        if (typeof params.payment_header !== 'string' || !params.payment_header) {
          return { success: false, error: 'Payment header required' };
        }

        const url = `${baseUrl}/api/agents/${encodeURIComponent(agentId)}`;
        const result = await fetchWithPayment(url, params.payment_header as string, { timeout: slaTimeoutMs * 2 });

        if (!result.success) {
          return { success: false, error: result.error };
        }

        return { success: true, data: result.data };
      },
    },
    {
      name: 'query_agent_reputation',
      description: 'Query a KAMIYO agent reputation score via x402 payment. Returns trust tier, transaction history, and ZK verification proof.',
      parameters: {
        agent_id: { type: 'string', description: 'Agent ID to query', required: true },
        payment_header: { type: 'string', description: 'Signed payment header', required: true },
      },
      handler: async (params): Promise<ToolResult> => {
        const agentId = params.agent_id;
        if (typeof agentId !== 'string' || !agentId || agentId.length > 100) {
          return { success: false, error: 'Invalid agent ID' };
        }
        if (typeof params.payment_header !== 'string' || !params.payment_header) {
          return { success: false, error: 'Payment header required' };
        }

        const url = `${baseUrl}/api/reputation/${encodeURIComponent(agentId)}`;
        const result = await fetchWithPayment(url, params.payment_header as string, { timeout: slaTimeoutMs * 2 });

        if (!result.success) {
          return { success: false, error: result.error };
        }

        return { success: true, data: result.data };
      },
    },
    {
      name: 'get_trading_signals',
      description: 'Get trading signals from top-rated KAMIYO agents via x402 payment.',
      parameters: {
        payment_header: { type: 'string', description: 'Signed payment header', required: true },
      },
      handler: async (params): Promise<ToolResult> => {
        if (typeof params.payment_header !== 'string' || !params.payment_header) {
          return { success: false, error: 'Payment header required' };
        }

        const url = `${baseUrl}/api/signals`;
        const result = await fetchWithPayment(url, params.payment_header as string, { timeout: slaTimeoutMs * 2 });

        if (!result.success) {
          return { success: false, error: result.error };
        }

        return { success: true, data: result.data };
      },
    },
    {
      name: 'x402_request_settlement',
      description: 'Request settlement (refund) for an x402 payment due to SLA violation.',
      parameters: {
        payment_ref: { type: 'string', description: 'Payment reference from the original transaction', required: true },
        violation: {
          type: 'string',
          description: 'Type of violation: timeout, serverError, latency, malformed, incomplete',
          required: true,
          enum: ['timeout', 'serverError', 'latency', 'malformed', 'incomplete'],
        },
        evidence: { type: 'string', description: 'Optional evidence supporting the claim', required: false },
      },
      handler: async (params): Promise<ToolResult> => {
        const paymentRef = params.payment_ref;
        const violation = params.violation;

        if (typeof paymentRef !== 'string' || !paymentRef) {
          return { success: false, error: 'Payment reference required' };
        }
        if (typeof violation !== 'string' || !['timeout', 'serverError', 'latency', 'malformed', 'incomplete'].includes(violation)) {
          return { success: false, error: 'Invalid violation type' };
        }

        const result = await requestSettlement(
          baseUrl,
          paymentRef,
          violation,
          params.evidence as string | undefined
        );

        if (!result.success) {
          return { success: false, error: result.error };
        }

        return {
          success: true,
          data: {
            settlementId: result.settlementId,
            refundPercent: result.refundPercent,
            status: 'pending_review',
          },
        };
      },
    },
  ];
}

export const X402_TOOL_NAMES = [
  'x402_check_pricing',
  'x402_fetch',
  'query_agent_profile',
  'query_agent_reputation',
  'get_trading_signals',
  'x402_request_settlement',
] as const;

export type X402ToolName = (typeof X402_TOOL_NAMES)[number];
