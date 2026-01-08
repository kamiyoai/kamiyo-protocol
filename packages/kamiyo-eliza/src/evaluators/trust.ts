import type { Evaluator, IAgentRuntime, Memory, State } from '../types';
import { parseAddress, getNetworkConfig, createConnection } from '../utils';

export const trustEvaluator: Evaluator = {
  name: 'KAMIYO_TRUST',
  description: 'Evaluates provider trustworthiness before payment.',
  similes: ['trust check'],
  examples: [
    {
      context: 'Agent wants to use provider',
      messages: [{ user: 'user', content: { text: 'Use provider ABC123' } }],
      outcome: 'TRUSTED',
    },
  ],

  async validate(_runtime: IAgentRuntime, message: Memory): Promise<boolean> {
    const text = message.content.text?.toLowerCase() || '';
    return text.includes('provider') || text.includes('escrow');
  },

  async handler(
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State
  ): Promise<{ trusted: boolean; reputation: number; riskLevel: string; warnings: string[] }> {
    const text = message.content.text || '';
    const address = parseAddress(text) || (message.content.provider as string);

    if (!address) {
      return { trusted: false, reputation: 0, riskLevel: 'unknown', warnings: ['No address'] };
    }

    const { rpcUrl } = getNetworkConfig(runtime);
    const minRep = parseInt(runtime.getSetting('KAMIYO_MIN_REPUTATION') || '60', 10);

    try {
      const connection = createConnection(rpcUrl);

      // TODO: Replace with actual Kamiyo SDK call
      // const agent = await kamiyoClient.getAgent(address);
      const reputation = 85;
      const disputeRate = 5;
      const agreements = 100;

      const warnings: string[] = [];
      let riskLevel = 'low';

      if (reputation < 60) {
        warnings.push(`Low reputation: ${reputation}%`);
        riskLevel = 'high';
      } else if (reputation < 75) {
        warnings.push(`Moderate reputation: ${reputation}%`);
        riskLevel = 'medium';
      }

      if (disputeRate > 15) {
        warnings.push(`High dispute rate: ${disputeRate}%`);
        if (riskLevel !== 'high') riskLevel = 'medium';
      }

      if (agreements < 10) {
        warnings.push(`New provider: ${agreements} agreements`);
        if (riskLevel === 'low') riskLevel = 'medium';
      }

      return {
        trusted: reputation >= minRep && warnings.length < 2,
        reputation,
        riskLevel,
        warnings,
      };
    } catch {
      return { trusted: false, reputation: 0, riskLevel: 'error', warnings: ['Query failed'] };
    }
  },
};
