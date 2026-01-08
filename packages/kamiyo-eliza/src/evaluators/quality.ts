import type { Evaluator, IAgentRuntime, Memory, State, PaymentRecord } from '../types';

export const qualityEvaluator: Evaluator = {
  name: 'KAMIYO_QUALITY_EVALUATOR',
  description: 'Evaluates service quality and determines if dispute should be filed.',
  similes: ['quality check', 'service evaluation'],
  examples: [
    {
      context: 'Agent received data from paid API',
      messages: [
        { user: 'agent', content: { text: 'Fetched 15 exploits. Quality: 45%.' } },
      ],
      outcome: 'DISPUTE - quality below threshold',
    },
    {
      context: 'Agent received high quality data',
      messages: [
        { user: 'agent', content: { text: 'Retrieved market data. Quality: 95%.' } },
      ],
      outcome: 'ACCEPT - quality meets threshold',
    },
  ],

  async validate(runtime: IAgentRuntime, message: Memory): Promise<boolean> {
    const text = message.content.text?.toLowerCase() || '';
    return (
      text.includes('quality') ||
      text.includes('fetched') ||
      text.includes('retrieved') ||
      text.includes('received data')
    );
  },

  async handler(
    runtime: IAgentRuntime,
    message: Memory,
    state?: State
  ): Promise<{ shouldDispute: boolean; quality: number; reason?: string }> {
    const threshold = parseInt(runtime.getSetting('KAMIYO_QUALITY_THRESHOLD') || '80', 10);

    const text = message.content.text || '';
    const qualityMatch = text.match(/quality[:\s]+(\d+)%?/i) || text.match(/(\d+)%\s*quality/i);

    if (!qualityMatch) {
      return { shouldDispute: false, quality: -1, reason: 'No quality score found' };
    }

    const quality = parseInt(qualityMatch[1], 10);

    if (quality < threshold) {
      return {
        shouldDispute: true,
        quality,
        reason: `Quality ${quality}% below threshold ${threshold}%`,
      };
    }

    return {
      shouldDispute: false,
      quality,
      reason: `Quality ${quality}% meets threshold`,
    };
  },
};
