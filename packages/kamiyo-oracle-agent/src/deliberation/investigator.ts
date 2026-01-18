import type { EvaluationContext } from '../types';
import type {
  DebateArgument,
  InvestigatorChallenge,
  GatheredEvidence,
  DebateRound,
} from './types';
import { createLogger } from '../lib/logger';

const log = createLogger('investigator');

const CHALLENGE_PROMPT = `You are an impartial INVESTIGATOR examining arguments in a blockchain escrow dispute. Your job is to find weaknesses, inconsistencies, and gaps in BOTH sides' arguments.

## Agent Advocate's Argument
Position: {{agentPosition}}
Key Points:
{{agentPoints}}
Evidence Cited:
{{agentEvidence}}
Confidence: {{agentConfidence}}%

## Provider Advocate's Argument
Position: {{providerPosition}}
Key Points:
{{providerPoints}}
Evidence Cited:
{{providerEvidence}}
Confidence: {{providerConfidence}}%

## Available Evidence
{{availableEvidence}}

## Previous Rounds (if any)
{{previousRounds}}

## Your Task
Critically examine BOTH arguments. For each side, identify:
1. Logical weaknesses or unsupported claims
2. Evidence gaps or misinterpretations
3. Inconsistencies with available data
4. Questions that need answers

Be rigorous but fair. Challenge BOTH sides equally. Your goal is to stress-test the arguments, not to favor either party.

Respond with 2-4 challenges total (at least one per side) in this format:
CHALLENGE_1:
  TARGET: [agent|provider|both]
  CHALLENGE: [Your specific challenge]
  WEAKNESS: [The weakness this exposes]
  EVIDENCE_NEEDED: [What evidence would resolve this, if any]

CHALLENGE_2:
  TARGET: [agent|provider|both]
  CHALLENGE: [Your specific challenge]
  WEAKNESS: [The weakness this exposes]
  EVIDENCE_NEEDED: [What evidence would resolve this, if any]

[Continue for additional challenges...]`;

const FOLLOWUP_PROMPT = `You are the INVESTIGATOR reviewing advocate responses to your previous challenges.

## Your Previous Challenges
{{previousChallenges}}

## Agent's Response
{{agentResponse}}
Concession: {{agentConcession}}

## Provider's Response
{{providerResponse}}
Concession: {{providerConcession}}

## Your Task
Based on the responses:
1. Were your challenges adequately addressed?
2. Did any concessions reveal new weaknesses?
3. What new questions arise from the responses?

Generate 1-3 follow-up challenges that dig deeper.

Respond in the same format as before:
CHALLENGE_1:
  TARGET: [agent|provider|both]
  CHALLENGE: [Your specific challenge]
  WEAKNESS: [The weakness this exposes]
  EVIDENCE_NEEDED: [What evidence would resolve this, if any]`;

export class Investigator {
  private apiKey: string;
  private model: string;
  private temperature: number;

  constructor(apiKey: string, model: string, temperature = 0.5) {
    this.apiKey = apiKey;
    this.model = model;
    this.temperature = temperature;
  }

  async generateChallenges(
    agentArgument: DebateArgument,
    providerArgument: DebateArgument,
    context: EvaluationContext,
    evidence: GatheredEvidence | null,
    previousRounds: DebateRound[]
  ): Promise<InvestigatorChallenge[]> {
    const prompt = this.buildChallengePrompt(
      agentArgument,
      providerArgument,
      context,
      evidence,
      previousRounds
    );

    log.debug('Generating challenges', {
      round: previousRounds.length + 1,
    });

    const response = await this.callLLM(prompt);
    return this.parseChallenges(response);
  }

  async generateFollowupChallenges(
    previousChallenges: InvestigatorChallenge[],
    agentResponse: { response: string; concession?: string },
    providerResponse: { response: string; concession?: string }
  ): Promise<InvestigatorChallenge[]> {
    const prompt = this.buildFollowupPrompt(
      previousChallenges,
      agentResponse,
      providerResponse
    );

    log.debug('Generating followup challenges');

    const response = await this.callLLM(prompt);
    return this.parseChallenges(response);
  }

  private buildChallengePrompt(
    agentArgument: DebateArgument,
    providerArgument: DebateArgument,
    context: EvaluationContext,
    evidence: GatheredEvidence | null,
    previousRounds: DebateRound[]
  ): string {
    const agentPoints = agentArgument.keyPoints.map((p) => `- ${p}`).join('\n');
    const agentEvidence = agentArgument.evidenceCited.map((e) => `- ${e}`).join('\n');
    const providerPoints = providerArgument.keyPoints.map((p) => `- ${p}`).join('\n');
    const providerEvidence = providerArgument.evidenceCited.map((e) => `- ${e}`).join('\n');

    const availableEvidence = this.formatAvailableEvidence(context, evidence);
    const previousRoundsText = this.formatPreviousRounds(previousRounds);

    return CHALLENGE_PROMPT
      .replace('{{agentPosition}}', agentArgument.position)
      .replace('{{agentPoints}}', agentPoints || 'None stated')
      .replace('{{agentEvidence}}', agentEvidence || 'None cited')
      .replace('{{agentConfidence}}', agentArgument.confidence.toString())
      .replace('{{providerPosition}}', providerArgument.position)
      .replace('{{providerPoints}}', providerPoints || 'None stated')
      .replace('{{providerEvidence}}', providerEvidence || 'None cited')
      .replace('{{providerConfidence}}', providerArgument.confidence.toString())
      .replace('{{availableEvidence}}', availableEvidence)
      .replace('{{previousRounds}}', previousRoundsText || 'This is the first round.');
  }

  private buildFollowupPrompt(
    previousChallenges: InvestigatorChallenge[],
    agentResponse: { response: string; concession?: string },
    providerResponse: { response: string; concession?: string }
  ): string {
    const challengesText = previousChallenges
      .map((c, i) => `${i + 1}. [${c.target}] ${c.challenge}`)
      .join('\n');

    return FOLLOWUP_PROMPT
      .replace('{{previousChallenges}}', challengesText)
      .replace('{{agentResponse}}', agentResponse.response)
      .replace('{{agentConcession}}', agentResponse.concession || 'None')
      .replace('{{providerResponse}}', providerResponse.response)
      .replace('{{providerConcession}}', providerResponse.concession || 'None');
  }

  private formatAvailableEvidence(
    context: EvaluationContext,
    evidence: GatheredEvidence | null
  ): string {
    const lines: string[] = [];

    // Basic facts
    lines.push(`- Escrow amount: ${context.escrow.amount.toFixed(4)} SOL`);
    lines.push(`- Service type: ${context.service.type}`);
    lines.push(`- Agent reputation: ${context.agent.reputation}/1000`);
    lines.push(`- Provider reputation: ${context.provider.reputation}/1000`);
    lines.push(`- Agent dispute rate: ${context.agent.disputeRate.toFixed(1)}%`);
    lines.push(`- Provider dispute rate: ${context.provider.disputeRate.toFixed(1)}%`);

    if (evidence) {
      // On-chain data
      lines.push(`- Previous disputes on file: ${evidence.onChain.previousDisputes.length}`);

      // Fraud/legitimacy indicators
      if (evidence.patterns.fraudIndicators.length > 0) {
        lines.push(`- Fraud indicators detected: ${evidence.patterns.fraudIndicators.length}`);
      }
      if (evidence.patterns.legitimacySignals.length > 0) {
        lines.push(`- Legitimacy signals: ${evidence.patterns.legitimacySignals.length}`);
      }

      // API health
      if (evidence.offChain.apiHealthCheck) {
        const health = evidence.offChain.apiHealthCheck;
        lines.push(`- API health check: ${health.reachable ? 'Reachable' : 'Unreachable'}`);
      }
    }

    return lines.join('\n');
  }

  private formatPreviousRounds(rounds: DebateRound[]): string {
    if (rounds.length === 0) return '';

    return rounds
      .map((round) => {
        const challenges = round.investigatorChallenges
          .map((c) => `    - [${c.target}] ${c.challenge}`)
          .join('\n');

        return `Round ${round.round}:
  Agent argued: ${round.agentArgument.position.slice(0, 100)}...
  Provider argued: ${round.providerArgument.position.slice(0, 100)}...
  Challenges:
${challenges}
  Agent concession: ${round.agentResponse.concession || 'None'}
  Provider concession: ${round.providerResponse.concession || 'None'}`;
      })
      .join('\n\n');
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

  private parseChallenges(text: string): InvestigatorChallenge[] {
    const challenges: InvestigatorChallenge[] = [];

    // Match each CHALLENGE_N block
    const challengeBlocks = text.split(/CHALLENGE_\d+:/i).slice(1);

    for (const block of challengeBlocks) {
      const targetMatch = block.match(/TARGET:\s*(agent|provider|both)/i);
      const challengeMatch = block.match(/CHALLENGE:\s*(.+?)(?=WEAKNESS:|$)/is);
      const weaknessMatch = block.match(/WEAKNESS:\s*(.+?)(?=EVIDENCE_NEEDED:|$)/is);
      const evidenceMatch = block.match(/EVIDENCE_NEEDED:\s*(.+?)$/is);

      if (targetMatch && challengeMatch) {
        challenges.push({
          target: targetMatch[1].toLowerCase() as 'agent' | 'provider' | 'both',
          challenge: challengeMatch[1].trim(),
          weaknessIdentified: weaknessMatch?.[1]?.trim() || 'Unspecified weakness',
          evidenceRequested: evidenceMatch?.[1]?.trim(),
        });
      }
    }

    // Ensure at least one challenge per side if possible
    if (challenges.length === 0) {
      challenges.push({
        target: 'both',
        challenge: 'Neither side has provided sufficient evidence for their claims.',
        weaknessIdentified: 'Lack of concrete evidence',
      });
    }

    return challenges;
  }
}
