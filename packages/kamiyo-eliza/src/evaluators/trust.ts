import type { Evaluator, IAgentRuntime, Memory, State } from '../types';

export const trustEvaluator: Evaluator = {
  name: 'KAMIYO_TRUST_EVALUATOR',
  description: 'Evaluates provider trustworthiness before creating escrow.',
  similes: ['trust check', 'provider verification'],
  examples: [
    {
      context: 'Agent wants to use a new provider',
      messages: [
        { user: 'user', content: { text: 'Use provider ABC123 for trading signals' } },
      ],
      outcome: 'TRUSTED - reputation 92%, 150 successful agreements',
    },
    {
      context: 'Agent evaluating risky provider',
      messages: [
        { user: 'user', content: { text: 'Get data from provider XYZ789' } },
      ],
      outcome: 'WARNING - reputation 45%, high dispute rate',
    },
  ],

  async validate(runtime: IAgentRuntime, message: Memory): Promise<boolean> {
    const text = message.content.text?.toLowerCase() || '';
    return (
      text.includes('provider') ||
      text.includes('service') ||
      text.includes('use ') ||
      text.includes('escrow')
    );
  },

  async handler(
    runtime: IAgentRuntime,
    message: Memory,
    state?: State
  ): Promise<{ trusted: boolean; reputation: number; riskLevel: string; warnings: string[] }> {
    const text = message.content.text || '';
    const addressMatch = text.match(/[A-Za-z0-9]{32,44}/);
    const providerAddress = addressMatch?.[0] || (message.content.provider as string);

    if (!providerAddress) {
      return {
        trusted: false,
        reputation: 0,
        riskLevel: 'unknown',
        warnings: ['No provider address specified'],
      };
    }

    // Simulated reputation check (actual would query Kamiyo program)
    const reputation = 70 + Math.floor(Math.random() * 30);
    const disputeRate = Math.floor(Math.random() * 20);
    const agreementCount = 20 + Math.floor(Math.random() * 100);

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

    if (agreementCount < 10) {
      warnings.push(`New provider: only ${agreementCount} agreements`);
      if (riskLevel === 'low') riskLevel = 'medium';
    }

    const minReputation = parseInt(runtime.getSetting('KAMIYO_MIN_REPUTATION') || '60', 10);
    const trusted = reputation >= minReputation && warnings.length < 2;

    return {
      trusted,
      reputation,
      riskLevel,
      warnings,
    };
  },
};
