import type { EvaluationContext } from '../types';
import type {
  DebateRound,
  ArbiterAnalysis,
  GatheredEvidence,
  DeliberationResult,
} from './types';
import { Transcript } from './transcript';
import { createLogger } from '../lib/logger';

const log = createLogger('arbiter');

const JUDGMENT_PROMPT = `You are the ARBITER rendering final judgment in a blockchain escrow dispute. You have reviewed a full adversarial debate between advocates for both parties.

## Dispute Context
- Service Type: {{serviceType}}
- Amount at Stake: {{amount}} SOL
- Transaction ID: {{transactionId}}

## Debate Summary
{{debateSummary}}

## Key Concessions Made
Agent Advocate: {{agentConcessions}}
Provider Advocate: {{providerConcessions}}

## Evidence Assessment
{{evidenceAssessment}}

## Your Task
Based on the complete debate record, render judgment:

1. Evaluate the strength of each side's final position
2. Consider which arguments survived challenge
3. Weight the evidence and concessions
4. Determine a quality score (0-100):
   - 80-100: Service met/exceeded expectations (provider keeps funds)
   - 65-79: Minor issues (provider gets 65%)
   - 50-64: Significant problems (provider gets 25%)
   - 0-49: Service failed (full refund to agent)

Be impartial. If the debate was inconclusive, err toward the party with better reputation and history.

Respond in this format:
AGENT_STRENGTHS:
- [Strength 1]
- [Strength 2]
AGENT_WEAKNESSES:
- [Weakness 1]
- [Weakness 2]
PROVIDER_STRENGTHS:
- [Strength 1]
- [Strength 2]
PROVIDER_WEAKNESSES:
- [Weakness 1]
- [Weakness 2]
INVESTIGATOR_INSIGHTS:
- [Key insight 1]
- [Key insight 2]
EVIDENCE_WEIGHT:
  SUPPORTING_AGENT: [0-100]
  SUPPORTING_PROVIDER: [0-100]
  INCONCLUSIVE: [0-100]
FINAL_SCORE: [0-100]
CONFIDENCE: [low|medium|high]
KEY_FACTORS:
- [Factor 1]
- [Factor 2]
- [Factor 3]
REASONING: [3-5 sentence explanation of your judgment]
DISSENT: [If one advocate made a particularly strong case that deserves note, describe it here. Otherwise write "None"]`;

export class Arbiter {
  private apiKey: string;
  private model: string;
  private temperature: number;

  constructor(apiKey: string, model: string, temperature = 0.3) {
    this.apiKey = apiKey;
    this.model = model;
    this.temperature = temperature;
  }

  async renderJudgment(
    transcript: Transcript,
    context: EvaluationContext,
    evidence: GatheredEvidence | null
  ): Promise<DeliberationResult> {
    const prompt = this.buildJudgmentPrompt(transcript, context, evidence);

    log.info('Rendering judgment', {
      escrow: context.escrow.pda.slice(0, 8),
      rounds: transcript.getRoundCount(),
    });

    const response = await this.callLLM(prompt);
    transcript.incrementLLMCalls();

    const parsed = this.parseJudgment(response);

    return transcript.buildResult(
      parsed.analysis,
      parsed.finalScore,
      parsed.confidence,
      parsed.reasoning,
      parsed.keyFactors,
      this.model,
      parsed.dissent
    );
  }

  private buildJudgmentPrompt(
    transcript: Transcript,
    context: EvaluationContext,
    evidence: GatheredEvidence | null
  ): string {
    const rounds = transcript.getRounds();
    const debateSummary = this.formatDebateSummary(rounds);
    const concessions = this.extractConcessions(rounds);
    const evidenceAssessment = this.formatEvidenceAssessment(context, evidence);

    return JUDGMENT_PROMPT
      .replace('{{serviceType}}', context.service.type)
      .replace('{{amount}}', context.escrow.amount.toFixed(4))
      .replace('{{transactionId}}', context.escrow.transactionId)
      .replace('{{debateSummary}}', debateSummary)
      .replace('{{agentConcessions}}', concessions.agent.join('; ') || 'None')
      .replace('{{providerConcessions}}', concessions.provider.join('; ') || 'None')
      .replace('{{evidenceAssessment}}', evidenceAssessment);
  }

  private formatDebateSummary(rounds: DebateRound[]): string {
    return rounds
      .map((round) => {
        const challenges = round.investigatorChallenges
          .map((c) => `  - [${c.target}] ${c.challenge}`)
          .join('\n');

        return `### Round ${round.round}

**Agent Advocate:**
${round.agentArgument.position}
Key points: ${round.agentArgument.keyPoints.join(', ')}
Confidence: ${round.agentArgument.confidence}%

**Provider Advocate:**
${round.providerArgument.position}
Key points: ${round.providerArgument.keyPoints.join(', ')}
Confidence: ${round.providerArgument.confidence}%

**Investigator Challenges:**
${challenges}

**Agent Response:** ${round.agentResponse.response}
**Provider Response:** ${round.providerResponse.response}`;
      })
      .join('\n\n---\n\n');
  }

  private extractConcessions(
    rounds: DebateRound[]
  ): { agent: string[]; provider: string[] } {
    const agent: string[] = [];
    const provider: string[] = [];

    for (const round of rounds) {
      if (round.agentResponse.concession) {
        agent.push(`R${round.round}: ${round.agentResponse.concession}`);
      }
      if (round.providerResponse.concession) {
        provider.push(`R${round.round}: ${round.providerResponse.concession}`);
      }
    }

    return { agent, provider };
  }

  private formatEvidenceAssessment(
    context: EvaluationContext,
    evidence: GatheredEvidence | null
  ): string {
    const lines: string[] = [];

    lines.push('**On-Chain Data:**');
    lines.push(`- Agent reputation: ${context.agent.reputation}/1000`);
    lines.push(`- Provider reputation: ${context.provider.reputation}/1000`);
    lines.push(`- Agent dispute rate: ${context.agent.disputeRate.toFixed(1)}%`);
    lines.push(`- Provider dispute rate: ${context.provider.disputeRate.toFixed(1)}%`);

    if (evidence) {
      if (evidence.onChain.previousDisputes.length > 0) {
        const disputes = evidence.onChain.previousDisputes;
        const agentWins = disputes.filter((d) => d.outcome === 'agent_won').length;
        const providerWins = disputes.filter((d) => d.outcome === 'provider_won').length;
        lines.push(`- Historical disputes: ${agentWins} agent wins, ${providerWins} provider wins`);
      }

      lines.push('');
      lines.push('**Pattern Analysis:**');
      if (evidence.patterns.fraudIndicators.length > 0) {
        for (const indicator of evidence.patterns.fraudIndicators) {
          lines.push(`- FRAUD [${indicator.severity}]: ${indicator.description}`);
        }
      }
      if (evidence.patterns.legitimacySignals.length > 0) {
        for (const signal of evidence.patterns.legitimacySignals) {
          lines.push(`- LEGITIMATE [${signal.strength}]: ${signal.description}`);
        }
      }

      if (evidence.offChain.apiHealthCheck) {
        lines.push('');
        lines.push('**Off-Chain Verification:**');
        const health = evidence.offChain.apiHealthCheck;
        if (health.reachable) {
          lines.push(`- API healthy, response time: ${health.responseTimeMs}ms`);
        } else {
          lines.push(`- API unreachable: ${health.error}`);
        }
      }
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
        max_tokens: 1500,
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

  private parseJudgment(text: string): {
    analysis: ArbiterAnalysis;
    finalScore: number;
    confidence: 'low' | 'medium' | 'high';
    reasoning: string;
    keyFactors: string[];
    dissent?: { advocate: 'agent' | 'provider'; argument: string; suggestedScore: number };
  } {
    const agentStrengths = this.parseListSection(text, 'AGENT_STRENGTHS');
    const agentWeaknesses = this.parseListSection(text, 'AGENT_WEAKNESSES');
    const providerStrengths = this.parseListSection(text, 'PROVIDER_STRENGTHS');
    const providerWeaknesses = this.parseListSection(text, 'PROVIDER_WEAKNESSES');
    const investigatorInsights = this.parseListSection(text, 'INVESTIGATOR_INSIGHTS');
    const keyFactors = this.parseListSection(text, 'KEY_FACTORS');

    // Parse evidence weight
    const supportingAgentMatch = text.match(/SUPPORTING_AGENT:\s*(\d+)/i);
    const supportingProviderMatch = text.match(/SUPPORTING_PROVIDER:\s*(\d+)/i);
    const inconclusiveMatch = text.match(/INCONCLUSIVE:\s*(\d+)/i);

    const evidenceWeight = {
      supportingAgent: supportingAgentMatch ? parseInt(supportingAgentMatch[1]) : 33,
      supportingProvider: supportingProviderMatch ? parseInt(supportingProviderMatch[1]) : 33,
      inconclusive: inconclusiveMatch ? parseInt(inconclusiveMatch[1]) : 34,
    };

    // Parse final judgment
    const finalScoreMatch = text.match(/FINAL_SCORE:\s*(\d+)/i);
    const confidenceMatch = text.match(/CONFIDENCE:\s*(low|medium|high)/i);
    const reasoningMatch = text.match(/REASONING:\s*(.+?)(?=DISSENT:|$)/is);
    const dissentMatch = text.match(/DISSENT:\s*(.+?)$/is);

    const finalScore = finalScoreMatch
      ? Math.min(100, Math.max(0, parseInt(finalScoreMatch[1])))
      : 72;

    const confidence = (confidenceMatch?.[1]?.toLowerCase() as 'low' | 'medium' | 'high') || 'medium';

    const reasoning = reasoningMatch?.[1]?.trim() ||
      'Judgment rendered based on debate analysis.';

    // Parse dissent
    let dissent: { advocate: 'agent' | 'provider'; argument: string; suggestedScore: number } | undefined;
    const dissentText = dissentMatch?.[1]?.trim();
    if (dissentText && dissentText.toLowerCase() !== 'none') {
      // Try to determine which advocate the dissent favors
      const favorsAgent = dissentText.toLowerCase().includes('agent') ||
        dissentText.toLowerCase().includes('refund');
      dissent = {
        advocate: favorsAgent ? 'agent' : 'provider',
        argument: dissentText,
        suggestedScore: favorsAgent ? Math.max(0, finalScore - 15) : Math.min(100, finalScore + 15),
      };
    }

    return {
      analysis: {
        agentStrengths,
        agentWeaknesses,
        providerStrengths,
        providerWeaknesses,
        investigatorInsights,
        evidenceWeight,
      },
      finalScore,
      confidence,
      reasoning,
      keyFactors,
      dissent,
    };
  }

  private parseListSection(text: string, sectionName: string): string[] {
    const regex = new RegExp(`${sectionName}:\\s*([\\s\\S]*?)(?=[A-Z_]+:|$)`, 'i');
    const match = text.match(regex);
    if (!match) return [];

    return match[1]
      .split('\n')
      .map((line) => line.replace(/^[-*]\s*/, '').trim())
      .filter((line) => line.length > 0);
  }
}
