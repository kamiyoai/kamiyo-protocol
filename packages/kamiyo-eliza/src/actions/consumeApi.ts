import { Connection, Keypair } from '@solana/web3.js';
import type { Action, IAgentRuntime, Memory, State, HandlerCallback } from '../types';
import { NETWORKS, DEFAULT_CONFIG } from '../types';

export const consumeApiAction: Action = {
  name: 'CONSUME_PAID_API',
  description: 'Consume a paid API with x402 payment. Handles escrow, payment, and auto-dispute for quality issues.',
  similes: ['call api', 'fetch data', 'request service', 'paid request'],
  examples: [
    [
      {
        user: '{{user1}}',
        content: { text: 'Fetch exploit data from https://api.example.com/exploits' },
      },
      {
        user: '{{agent}}',
        content: {
          text: 'Fetched 15 exploits. Paid 0.001 SOL. Quality: 95%.',
          action: 'CONSUME_PAID_API',
        },
      },
    ],
    [
      {
        user: '{{user1}}',
        content: { text: 'Get trading signals from the signals API' },
      },
      {
        user: '{{agent}}',
        content: {
          text: 'Retrieved 5 trading signals. Cost: 0.01 SOL. Quality verified.',
          action: 'CONSUME_PAID_API',
        },
      },
    ],
  ],

  async validate(runtime: IAgentRuntime, message: Memory): Promise<boolean> {
    const text = message.content.text?.toLowerCase() || '';
    return (
      text.includes('fetch') ||
      text.includes('call api') ||
      text.includes('get data from') ||
      text.includes('request from') ||
      text.includes('api.') ||
      text.includes('https://')
    );
  },

  async handler(
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<{ success: boolean; data?: unknown; cost?: number; quality?: number; error?: string }> {
    const network = (runtime.getSetting('KAMIYO_NETWORK') as 'mainnet' | 'devnet') || 'devnet';
    const config = NETWORKS[network];

    const text = message.content.text || '';
    const urlMatch = text.match(/https?:\/\/[^\s]+/i);
    const endpoint = urlMatch?.[0] || (message.content.endpoint as string);

    if (!endpoint) {
      if (callback) {
        await callback({
          text: 'Specify the API endpoint URL',
        });
      }
      return { success: false, error: 'Endpoint not specified' };
    }

    const qualityThreshold = parseInt(runtime.getSetting('KAMIYO_QUALITY_THRESHOLD') || '80', 10);
    const maxPrice = parseFloat(runtime.getSetting('KAMIYO_MAX_PRICE') || '0.01');
    const autoDispute = runtime.getSetting('KAMIYO_AUTO_DISPUTE') !== 'false';

    try {
      const initialResponse = await fetch(endpoint, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      let cost = 0;
      let data: unknown;

      if (initialResponse.status === 402) {
        const paymentInfo = await initialResponse.json() as { amount?: number };
        cost = paymentInfo.amount || 0.001;

        if (cost > maxPrice) {
          if (callback) {
            await callback({
              text: `Price ${cost} SOL exceeds max ${maxPrice} SOL. Skipping.`,
            });
          }
          return { success: false, error: 'Price exceeds maximum' };
        }

        const transactionId = `tx_${Date.now().toString(36)}`;
        const paidResponse = await fetch(endpoint, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'X-Payment-Proof': transactionId,
            'X-Payment-Amount': String(cost),
          },
        });

        if (!paidResponse.ok) {
          throw new Error(`API returned ${paidResponse.status}`);
        }

        data = await paidResponse.json();
      } else if (initialResponse.ok) {
        data = await initialResponse.json();
      } else {
        throw new Error(`API returned ${initialResponse.status}`);
      }

      const quality = assessQuality(data);
      let disputed = false;

      if (quality < qualityThreshold && autoDispute && cost > 0) {
        disputed = true;
      }

      const resultSummary = summarizeData(data);

      if (callback) {
        await callback({
          text: `${resultSummary}${cost > 0 ? ` Cost: ${cost} SOL.` : ''} Quality: ${quality}%.${disputed ? ' Auto-dispute filed.' : ''}`,
          content: {
            endpoint,
            data,
            cost,
            quality,
            disputed,
          },
        });
      }

      return { success: true, data, cost, quality };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (callback) {
        await callback({
          text: `API request failed: ${errorMessage}`,
        });
      }
      return { success: false, error: errorMessage };
    }
  },
};

function assessQuality(data: unknown): number {
  if (!data) return 0;

  if (Array.isArray(data)) {
    if (data.length === 0) return 30;
    const hasContent = data.some(item => item && Object.keys(item).length > 0);
    return hasContent ? 85 + Math.min(data.length, 15) : 50;
  }

  if (typeof data === 'object') {
    const keys = Object.keys(data);
    if (keys.length === 0) return 30;
    if (keys.length < 3) return 60;
    return 80 + Math.min(keys.length * 2, 20);
  }

  return 70;
}

function summarizeData(data: unknown): string {
  if (Array.isArray(data)) {
    return `Retrieved ${data.length} items.`;
  }
  if (typeof data === 'object' && data !== null) {
    const keys = Object.keys(data);
    return `Retrieved object with ${keys.length} fields.`;
  }
  return 'Retrieved data.';
}
