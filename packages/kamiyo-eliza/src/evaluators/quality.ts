import type { Evaluator, IAgentRuntime, Memory, State } from '../types';
import { parseQuality } from '../utils';

export const qualityEvaluator: Evaluator = {
  name: 'KAMIYO_QUALITY',
  description: 'Evaluates if service quality warrants dispute.',
  similes: ['quality check'],
  examples: [
    {
      context: 'Agent received low quality data',
      messages: [{ user: 'agent', content: { text: 'Quality: 45%.' } }],
      outcome: 'DISPUTE',
    },
  ],

  async validate(_runtime: IAgentRuntime, message: Memory): Promise<boolean> {
    const text = message.content.text?.toLowerCase() || '';
    return text.includes('quality') || text.includes('fetched');
  },

  async handler(
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State
  ): Promise<{ shouldDispute: boolean; quality: number; reason?: string }> {
    const threshold = parseInt(runtime.getSetting('KAMIYO_QUALITY_THRESHOLD') || '80', 10);
    const quality = parseQuality(message.content.text || '');

    if (quality === null) {
      return { shouldDispute: false, quality: -1, reason: 'No quality score' };
    }

    if (quality < threshold) {
      return { shouldDispute: true, quality, reason: `${quality}% < ${threshold}%` };
    }

    return { shouldDispute: false, quality, reason: 'Meets threshold' };
  },
};
