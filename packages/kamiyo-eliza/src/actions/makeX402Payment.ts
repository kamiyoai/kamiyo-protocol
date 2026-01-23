import type { Action, IAgentRuntime, Memory, State, HandlerCallback } from '../types';

interface PaymentRequirement {
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

interface X402Response {
  x402Version: 2;
  accepts: PaymentRequirement[];
  error: string;
  facilitator: string;
}

interface X402PaymentResult {
  success: boolean;
  data?: unknown;
  network?: string;
  amountUsdc?: number;
  tx?: string;
  error?: string;
}

const PAYAI_FACILITATOR = 'https://facilitator.payai.network';

const USDC_DECIMALS = 6;
const MICRO = 10 ** USDC_DECIMALS;

function fromMicro(micro: string | number): number {
  return (typeof micro === 'string' ? parseInt(micro, 10) : micro) / MICRO;
}

export const makeX402PaymentAction: Action = {
  name: 'MAKE_X402_PAYMENT',
  description: 'Pay for x402-gated API endpoints using USDC across multiple chains (Base, Solana, Polygon, Arbitrum).',
  similes: ['pay for api', 'x402 payment', 'usdc payment', 'pay endpoint', 'buy api access'],
  examples: [
    [
      { user: '{{user1}}', content: { text: 'Pay for https://api.example.com/premium and get the data' } },
      { user: '{{agent}}', content: { text: 'Paid $0.01 USDC on Base. Retrieved premium data with 12 fields.', action: 'MAKE_X402_PAYMENT' } },
    ],
    [
      { user: '{{user1}}', content: { text: 'Access the paid endpoint at https://api.kamiyo.ai/api/paid/market' } },
      { user: '{{agent}}', content: { text: 'Paid $0.005 USDC. BTC: $97,234, ETH: $3,456.', action: 'MAKE_X402_PAYMENT' } },
    ],
  ],

  async validate(_runtime: IAgentRuntime, message: Memory): Promise<boolean> {
    const text = message.content.text?.toLowerCase() || '';
    const hasPaymentIntent = text.includes('pay') || text.includes('x402') || text.includes('usdc') || text.includes('purchase');
    const hasUrl = /https?:\/\/[^\s]+/i.test(text);
    return hasPaymentIntent && hasUrl;
  },

  async handler(
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<X402PaymentResult> {
    const text = message.content.text || '';
    const urlMatch = text.match(/https?:\/\/[^\s]+/i);
    const endpoint = urlMatch?.[0] || (message.content.endpoint as string);

    if (!endpoint) {
      callback?.({ text: 'Specify an endpoint URL to pay for.' });
      return { success: false, error: 'Endpoint not specified' };
    }

    const maxPrice = parseFloat(runtime.getSetting('KAMIYO_MAX_PRICE') || '0.10');
    const preferredNetwork = runtime.getSetting('X402_PREFERRED_NETWORK') || 'base';
    const walletAddress = runtime.getSetting('X402_WALLET_ADDRESS');
    const privateKey = runtime.getSetting('SOLANA_PRIVATE_KEY') || runtime.getSetting('EVM_PRIVATE_KEY');

    if (!walletAddress) {
      callback?.({ text: 'X402_WALLET_ADDRESS not configured. Set your wallet address in agent settings.' });
      return { success: false, error: 'Wallet not configured' };
    }

    try {
      const initialResponse = await fetch(endpoint, {
        method: message.content.method as string || 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (initialResponse.status !== 402) {
        if (initialResponse.ok) {
          const data = await initialResponse.json();
          callback?.({ text: `Endpoint is free. ${summarize(data)}` });
          return { success: true, data };
        }
        throw new Error(`Endpoint returned ${initialResponse.status}`);
      }

      const x402Response = await initialResponse.json() as X402Response;

      if (!x402Response.accepts || x402Response.accepts.length === 0) {
        throw new Error('No payment options available');
      }

      const requirement = x402Response.accepts.find(r => r.network === preferredNetwork)
        || x402Response.accepts[0];

      const amountUsdc = fromMicro(requirement.amount);

      if (amountUsdc > maxPrice) {
        callback?.({ text: `Price $${amountUsdc} USDC exceeds max $${maxPrice}. Adjust KAMIYO_MAX_PRICE to proceed.` });
        return { success: false, error: 'Price exceeds maximum' };
      }

      const paymentHeader = await createPaymentHeader(
        walletAddress,
        requirement,
        x402Response.facilitator || PAYAI_FACILITATOR
      );

      const paidResponse = await fetch(endpoint, {
        method: message.content.method as string || 'GET',
        headers: {
          'Content-Type': 'application/json',
          'PAYMENT-SIGNATURE': paymentHeader,
        },
      });

      if (!paidResponse.ok) {
        if (paidResponse.status === 402) {
          throw new Error('Payment rejected by server');
        }
        throw new Error(`API returned ${paidResponse.status} after payment`);
      }

      const data = await paidResponse.json();
      const summary = summarize(data);

      callback?.({
        text: `Paid $${amountUsdc.toFixed(4)} USDC on ${requirement.network}. ${summary}`,
        content: {
          endpoint,
          data,
          payment: {
            network: requirement.network,
            amountUsdc,
            asset: requirement.asset,
            payTo: requirement.payTo,
          },
        },
      });

      return {
        success: true,
        data,
        network: requirement.network,
        amountUsdc,
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      callback?.({ text: `Payment failed: ${error}` });
      return { success: false, error };
    }
  },
};

// Stub: production should use @kamiyo/x402-client for real wallet signing
async function createPaymentHeader(
  walletAddress: string,
  requirement: PaymentRequirement,
  _facilitatorUrl: string
): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = Math.random().toString(36).substring(2, 10);

  const token = Buffer.from(JSON.stringify({
    x402Version: 2,
    scheme: 'exact',
    network: requirement.network,
    payment: {
      payer: walletAddress,
      payTo: requirement.payTo,
      amount: requirement.amount,
      asset: requirement.asset,
      timestamp,
      nonce,
    },
  })).toString('base64');

  return token;
}

function summarize(data: unknown): string {
  if (Array.isArray(data)) {
    return `Retrieved ${data.length} items.`;
  }
  if (typeof data === 'object' && data !== null) {
    const keys = Object.keys(data);
    if (keys.length <= 3) {
      const preview = keys.map(k => `${k}: ${formatValue((data as Record<string, unknown>)[k])}`).join(', ');
      return preview;
    }
    return `Retrieved ${keys.length} fields.`;
  }
  return 'Retrieved data.';
}

function formatValue(v: unknown): string {
  if (typeof v === 'number') {
    if (v > 1000) return v.toLocaleString();
    if (v < 0.01) return v.toFixed(6);
    return v.toFixed(2);
  }
  if (typeof v === 'string') return v.length > 30 ? v.slice(0, 30) + '...' : v;
  return String(v);
}
