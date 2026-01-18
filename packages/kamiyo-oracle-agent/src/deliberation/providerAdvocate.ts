import type { EvaluationContext } from '../types';
import type {
  DebateArgument,
  AdvocateResponse,
  InvestigatorChallenge,
  GatheredEvidence,
} from './types';
import { createLogger } from '../lib/logger';

const log = createLogger('provider-advocate');

const INITIAL_ARGUMENT_PROMPT = `You are an advocate arguing for the PROVIDER in a blockchain escrow dispute. Your goal is to argue that the provider deserves full or substantial payment.

## Context
- Service Type: {{serviceType}}
- Amount at Stake: {{amount}} SOL
- Transaction ID: {{transactionId}}

## Provider's Position
{{providerClaim}}

## Provider Information
- Reputation: {{providerReputation}}/1000
- Total Escrows: {{providerTotalEscrows}}
- Average Quality: {{providerAvgScore}}/100

## Agent (Disputer) Information
- Reputation: {{agentReputation}}/1000
- Dispute Rate: {{agentDisputeRate}}%
- Total Escrows: {{agentTotalEscrows}}

## Evidence Available
{{evidence}}

## Your Task
Construct the STRONGEST possible argument for why the provider deserves FULL or SUBSTANTIAL payment. Consider:
1. What evidence suggests the service was delivered properly?
2. What does the provider's track record demonstrate?
3. Is this dispute potentially frivolous?
4. What about the agent's history suggests they may be unreasonable?

Be aggressive but truthful. Cite specific evidence. Identify every weakness in the agent's claim.

Respond in this format:
POSITION: [Your main argument in 2-3 sentences]
KEY_POINTS:
- [Point 1]
- [Point 2]
- [Point 3]
EVIDENCE_CITED:
- [Evidence 1]
- [Evidence 2]
CONFIDENCE: [0-100]`;

const RESPONSE_PROMPT = `You are the PROVIDER ADVOCATE responding to investigator challenges.

## Your Previous Argument
{{previousArgument}}

## Investigator Challenges
{{challenges}}

## Your Task
Respond to each challenge, defending or strengthening your position. If a challenge reveals a genuine weakness, you may make a tactical concession while emphasizing other strengths.

Be strategic: concede minor points to strengthen credibility on major ones.

Respond in this format:
RESPONSE: [Your response addressing the challenges]
CONCESSION: [Any tactical concession, or "None"]
STRENGTHENED_POINTS:
- [Strengthened point 1]
- [Strengthened point 2]`;

export class ProviderAdvocate {
  private apiKey: string;
  private model: string;
  private temperature: number;

  constructor(apiKey: string, model: string, temperature = 0.7) {
    this.apiKey = apiKey;
    this.model = model;
    this.temperature = temperature;
  }

  async constructInitialArgument(
    context: EvaluationContext,
    evidence: GatheredEvidence | null
  ): Promise<DebateArgument> {
    const prompt = this.buildInitialPrompt(context, evidence);

    log.debug('Constructing initial argument', {
      escrow: context.escrow.pda.slice(0, 8),
    });

    const response = await this.callLLM(prompt);
    return this.parseArgumentResponse(response);
  }

  async respondToChallenge(
    previousArgument: DebateArgument,
    challenges: InvestigatorChallenge[],
    context: EvaluationContext
  ): Promise<AdvocateResponse> {
    const relevantChallenges = challenges.filter(
      (c) => c.target === 'provider' || c.target === 'both'
    );

    if (relevantChallenges.length === 0) {
      return {
        advocate: 'provider',
        response: 'No challenges directed at provider position.',
        strengthenedPoints: previousArgument.keyPoints,
      };
    }

    const prompt = this.buildResponsePrompt(previousArgument, relevantChallenges);

    log.debug('Responding to challenges', {
      challengeCount: relevantChallenges.length,
    });

    const response = await this.callLLM(prompt);
    return this.parseResponseResponse(response);
  }

  private buildInitialPrompt(
    context: EvaluationContext,
    evidence: GatheredEvidence | null
  ): string {
    const evidenceText = this.formatEvidence(evidence, context);
    const providerClaim = context.evidence.providerClaim ||
      'Provider believes service was delivered as agreed.';

    return INITIAL_ARGUMENT_PROMPT
      .replace('{{serviceType}}', context.service.type)
      .replace('{{amount}}', context.escrow.amount.toFixed(4))
      .replace('{{transactionId}}', context.escrow.transactionId)
      .replace('{{providerClaim}}', providerClaim)
      .replace('{{providerReputation}}', context.provider.reputation.toString())
      .replace('{{providerTotalEscrows}}', context.provider.totalEscrows.toString())
      .replace('{{providerAvgScore}}', context.provider.averageQualityScore.toString())
      .replace('{{agentReputation}}', context.agent.reputation.toString())
      .replace('{{agentDisputeRate}}', context.agent.disputeRate.toFixed(1))
      .replace('{{agentTotalEscrows}}', context.agent.totalEscrows.toString())
      .replace('{{evidence}}', evidenceText);
  }

  private buildResponsePrompt(
    previousArgument: DebateArgument,
    challenges: InvestigatorChallenge[]
  ): string {
    const challengeText = challenges
      .map((c, i) => `${i + 1}. ${c.challenge}\n   Weakness identified: ${c.weaknessIdentified}`)
      .join('\n');

    return RESPONSE_PROMPT
      .replace('{{previousArgument}}', previousArgument.position)
      .replace('{{challenges}}', challengeText);
  }

  private formatEvidence(
    evidence: GatheredEvidence | null,
    context: EvaluationContext
  ): string {
    const lines: string[] = [];

    // Provider strengths
    if (context.provider.reputation > 600) {
      lines.push(`- Provider has strong reputation: ${context.provider.reputation}/1000`);
    }
    if (context.provider.averageQualityScore > 75) {
      lines.push(`- Provider average quality: ${context.provider.averageQualityScore}/100`);
    }

    // Agent's dispute history
    if (context.agent.disputeRate > 20) {
      lines.push(`- Agent has high dispute rate: ${context.agent.disputeRate.toFixed(1)}%`);
      lines.push('- Pattern suggests potentially frivolous disputes');
    }

    if (evidence) {
      // Provider's successful history
      if (evidence.onChain.previousDisputes.length > 0) {
        const providerDisputes = evidence.onChain.previousDisputes;
        const wonCount = providerDisputes.filter((d) => d.outcome === 'provider_won').length;
        if (wonCount > 0) {
          lines.push(`- Provider won ${wonCount}/${providerDisputes.length} previous disputes`);
        }
      }

      // Legitimacy signals
      for (const signal of evidence.patterns.legitimacySignals) {
        if (signal.strength === 'strong') {
          lines.push(`- LEGITIMACY: ${signal.description}`);
        }
      }

      // API health if good
      if (evidence.offChain.apiHealthCheck?.reachable) {
        lines.push(`- API endpoint is healthy (${evidence.offChain.apiHealthCheck.responseTimeMs}ms response)`);
      }
    }

    // Delivery proof
    if (context.service.deliveryProof) {
      lines.push(`- Delivery proof available: ${context.service.deliveryProof}`);
    }

    return lines.join('\n');
  }

  private async callLLM(prompt: string): Promise<string> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 1000,
        temperature: this.temperature,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      throw new Error(`LLM API error: ${response.status}`);
    }

    const data = (await response.json()) as { content?: Array<{ text?: string }> };
    return data.content?.[0]?.text || '';
  }

  private parseArgumentResponse(text: string): DebateArgument {
    const positionMatch = text.match(/POSITION:\s*(.+?)(?=KEY_POINTS:|$)/is);
    const keyPointsMatch = text.match(/KEY_POINTS:\s*([\s\S]*?)(?=EVIDENCE_CITED:|$)/i);
    const evidenceMatch = text.match(/EVIDENCE_CITED:\s*([\s\S]*?)(?=CONFIDENCE:|$)/i);
    const confidenceMatch = text.match(/CONFIDENCE:\s*(\d+)/i);

    const keyPoints = this.parseListItems(keyPointsMatch?.[1] || '');
    const evidenceCited = this.parseListItems(evidenceMatch?.[1] || '');

    return {
      position: positionMatch?.[1]?.trim() || 'Provider delivered service as agreed.',
      keyPoints,
      evidenceCited,
      confidence: confidenceMatch ? parseInt(confidenceMatch[1]) : 70,
    };
  }

  private parseResponseResponse(text: string): AdvocateResponse {
    const responseMatch = text.match(/RESPONSE:\s*(.+?)(?=CONCESSION:|$)/is);
    const concessionMatch = text.match(/CONCESSION:\s*(.+?)(?=STRENGTHENED_POINTS:|$)/is);
    const strengthenedMatch = text.match(/STRENGTHENED_POINTS:\s*([\s\S]*?)$/i);

    const concession = concessionMatch?.[1]?.trim();
    const strengthenedPoints = this.parseListItems(strengthenedMatch?.[1] || '');

    return {
      advocate: 'provider',
      response: responseMatch?.[1]?.trim() || 'Maintaining position.',
      concession: concession && concession.toLowerCase() !== 'none' ? concession : undefined,
      strengthenedPoints,
    };
  }

  private parseListItems(text: string): string[] {
    return text
      .split('\n')
      .map((line) => line.replace(/^[-*]\s*/, '').trim())
      .filter((line) => line.length > 0);
  }
}
