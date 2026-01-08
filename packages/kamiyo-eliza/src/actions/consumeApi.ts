import type { Action, IAgentRuntime, Memory, State, HandlerCallback } from '../types';
import { generateId } from '../utils';

export const consumeApiAction: Action = {
  name: 'CONSUME_PAID_API',
  description: 'Call x402 API with payment and quality verification.',
  similes: ['call api', 'fetch data', 'paid request'],
  examples: [
    [
      { user: '{{user1}}', content: { text: 'Fetch data from https://api.example.com/data' } },
      { user: '{{agent}}', content: { text: 'Fetched 15 items. Cost: 0.001 SOL. Quality: 95%.', action: 'CONSUME_PAID_API' } },
    ],
  ],

  async validate(_runtime: IAgentRuntime, message: Memory): Promise<boolean> {
    const text = message.content.text?.toLowerCase() || '';
    return text.includes('fetch') || text.includes('api') || text.includes('https://');
  },

  async handler(
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<{ success: boolean; data?: unknown; cost?: number; quality?: number; error?: string }> {
    const text = message.content.text || '';
    const urlMatch = text.match(/https?:\/\/[^\s]+/i);
    const endpoint = urlMatch?.[0] || (message.content.endpoint as string);

    if (!endpoint) {
      callback?.({ text: 'Specify endpoint URL' });
      return { success: false, error: 'Endpoint not specified' };
    }

    const threshold = parseInt(runtime.getSetting('KAMIYO_QUALITY_THRESHOLD') || '80', 10);
    const maxPrice = parseFloat(runtime.getSetting('KAMIYO_MAX_PRICE') || '0.01');
    const autoDispute = runtime.getSetting('KAMIYO_AUTO_DISPUTE') !== 'false';

    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      let cost = 0;
      let data: unknown;

      if (response.status === 402) {
        const paymentInfo = await response.json() as { amount?: number };
        cost = paymentInfo.amount || 0.001;

        if (cost > maxPrice) {
          callback?.({ text: `Price ${cost} SOL exceeds max ${maxPrice}` });
          return { success: false, error: 'Price exceeds maximum' };
        }

        const txId = generateId('tx');
        const paidResponse = await fetch(endpoint, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'X-Payment-Proof': txId,
            'X-Payment-Amount': String(cost),
          },
        });

        if (!paidResponse.ok) throw new Error(`API returned ${paidResponse.status}`);
        data = await paidResponse.json();
      } else if (response.ok) {
        data = await response.json();
      } else {
        throw new Error(`API returned ${response.status}`);
      }

      const quality = assessQuality(data);
      const disputed = quality < threshold && autoDispute && cost > 0;
      const summary = summarize(data);

      callback?.({
        text: `${summary}${cost > 0 ? ` Cost: ${cost} SOL.` : ''} Quality: ${quality}%.${disputed ? ' Disputed.' : ''}`,
        content: { endpoint, data, cost, quality, disputed },
      });

      return { success: true, data, cost, quality };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      callback?.({ text: `Failed: ${error}` });
      return { success: false, error };
    }
  },
};

function assessQuality(data: unknown): number {
  if (!data) return 0;
  if (Array.isArray(data)) {
    if (data.length === 0) return 30;
    return data.some(item => item && Object.keys(item).length > 0) ? 85 + Math.min(data.length, 15) : 50;
  }
  if (typeof data === 'object') {
    const keys = Object.keys(data);
    if (keys.length === 0) return 30;
    return keys.length < 3 ? 60 : 80 + Math.min(keys.length * 2, 20);
  }
  return 70;
}

function summarize(data: unknown): string {
  if (Array.isArray(data)) return `Retrieved ${data.length} items.`;
  if (typeof data === 'object' && data !== null) return `Retrieved ${Object.keys(data).length} fields.`;
  return 'Retrieved data.';
}
