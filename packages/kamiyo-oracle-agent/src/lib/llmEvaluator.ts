import type { IAgentRuntime, EvaluationContext, QualityAssessment } from '../types';
import { createLogger } from './logger';
import { withRetry, withCircuitBreaker } from './retry';
import { EvaluationError, RateLimitError } from './errors';
import { sanitizeForLLM } from './validation';

const log = createLogger('llm-evaluator');

const EVALUATION_PROMPT = `You are an impartial oracle evaluating service quality for a blockchain escrow dispute.

## Context
- Service Type: {{serviceType}}
- Amount at Stake: {{amount}} SOL
- Transaction ID: {{transactionId}}
- Time Since Creation: {{timeSinceCreation}}

## Provider History
- Reputation Score: {{providerReputation}}/1000
- Past Dispute Rate: {{providerDisputeRate}}%
- Average Quality Score: {{providerAvgScore}}/100
- Total Escrows: {{providerTotalEscrows}}

## Agent (Disputer) History
- Reputation Score: {{agentReputation}}/1000
- Past Dispute Rate: {{agentDisputeRate}}%
- Total Escrows: {{agentTotalEscrows}}

## Service Terms
{{slaTerms}}

## Evidence
Agent's Claim: {{agentClaim}}
{{providerClaimSection}}
{{deliveryProofSection}}
{{thirdPartySection}}

## Your Task
Evaluate the quality of service delivered on a scale of 0-100:
- 80-100: Service met or exceeded expectations (provider keeps funds)
- 65-79: Minor issues but acceptable (provider gets 65%)
- 50-64: Significant problems (provider gets 25%)
- 0-49: Service failed or was not delivered (full refund to agent)

Consider:
1. Did the provider likely deliver what was promised?
2. Is the dispute claim reasonable given the evidence?
3. What does the provider's history suggest about reliability?
4. Is this agent known for frivolous disputes?

Be fair to both parties. When evidence is unclear, lean toward the party with better history.

Respond ONLY in this exact format:
SCORE: [number 0-100]
CONFIDENCE: [low|medium|high]
REASONING: [2-3 sentences explaining your assessment]
DELIVERY_COMPLETE: [true|false]
SLA_COMPLIANT: [true|false|unknown]
EVIDENCE_STRENGTH: [weak|moderate|strong]`;

interface AnthropicResponse {
  content?: Array<{ text?: string }>;
  error?: { type?: string; message?: string };
}

export async function evaluateWithLLM(
  runtime: IAgentRuntime,
  context: EvaluationContext
): Promise<QualityAssessment> {
  const apiKey = runtime.getSetting('ANTHROPIC_API_KEY');

  if (!apiKey) {
    log.info('No API key, using heuristic evaluation');
    return heuristicEvaluation(context);
  }

  const model = runtime.getSetting('EVALUATION_MODEL') || 'claude-3-5-sonnet-20241022';
  const prompt = buildPrompt(context);

  try {
    const assessment = await withCircuitBreaker(
      () => callAnthropicAPI(apiKey, model, prompt, context),
      'anthropic-api'
    );
    return assessment;
  } catch (err) {
    log.warn('LLM evaluation failed, using heuristic', {
      error: err instanceof Error ? err.message : String(err),
    });
    return heuristicEvaluation(context);
  }
}

async function callAnthropicAPI(
  apiKey: string,
  model: string,
  prompt: string,
  context: EvaluationContext
): Promise<QualityAssessment> {
  return withRetry(
    async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model,
            max_tokens: 500,
            messages: [{ role: 'user', content: prompt }],
          }),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (response.status === 429) {
          const retryAfter = response.headers.get('retry-after');
          const delayMs = retryAfter ? parseInt(retryAfter) * 1000 : 60000;
          throw new RateLimitError(delayMs);
        }

        if (!response.ok) {
          throw new EvaluationError(`API error: ${response.status}`, {
            status: response.status,
          });
        }

        const data = (await response.json()) as AnthropicResponse;

        if (data.error) {
          throw new EvaluationError(data.error.message || 'Unknown API error');
        }

        const text = data.content?.[0]?.text || '';
        if (!text) {
          throw new EvaluationError('Empty response from API');
        }

        return parseAssessment(text, context);
      } finally {
        clearTimeout(timeout);
      }
    },
    'anthropicAPI',
    { maxAttempts: 2, baseDelayMs: 2000 }
  );
}

function buildPrompt(context: EvaluationContext): string {
  const timeSinceCreation = Math.floor(
    (Date.now() / 1000 - context.escrow.createdAt) / 3600
  );

  const providerClaimSection = context.evidence.providerClaim
    ? `Provider's Claim: ${sanitizeForLLM(context.evidence.providerClaim)}`
    : '';

  const deliveryProofSection = context.service.deliveryProof
    ? `Delivery Proof: ${sanitizeForLLM(context.service.deliveryProof)}`
    : '';

  const thirdPartySection = context.evidence.thirdPartyData?.length
    ? `Third Party Data:\n${context.evidence.thirdPartyData.map((d) => `- ${d}`).join('\n')}`
    : '';

  return EVALUATION_PROMPT
    .replace('{{serviceType}}', context.service.type)
    .replace('{{amount}}', context.escrow.amount.toFixed(4))
    .replace('{{transactionId}}', context.escrow.transactionId.slice(0, 16))
    .replace('{{timeSinceCreation}}', `${timeSinceCreation} hours`)
    .replace('{{providerReputation}}', context.provider.reputation.toString())
    .replace('{{providerDisputeRate}}', context.provider.disputeRate.toFixed(1))
    .replace('{{providerAvgScore}}', context.provider.averageQualityScore.toString())
    .replace('{{providerTotalEscrows}}', context.provider.totalEscrows.toString())
    .replace('{{agentReputation}}', context.agent.reputation.toString())
    .replace('{{agentDisputeRate}}', context.agent.disputeRate.toFixed(1))
    .replace('{{agentTotalEscrows}}', context.agent.totalEscrows.toString())
    .replace('{{slaTerms}}', context.service.slaTerms.map((t) => `- ${t}`).join('\n'))
    .replace('{{agentClaim}}', sanitizeForLLM(context.evidence.agentClaim))
    .replace('{{providerClaimSection}}', providerClaimSection)
    .replace('{{deliveryProofSection}}', deliveryProofSection)
    .replace('{{thirdPartySection}}', thirdPartySection);
}

function parseAssessment(text: string, context: EvaluationContext): QualityAssessment {
  const scoreMatch = text.match(/SCORE:\s*(\d+)/i);
  const confidenceMatch = text.match(/CONFIDENCE:\s*(low|medium|high)/i);
  const reasoningMatch = text.match(/REASONING:\s*(.+?)(?=\n[A-Z_]+:|$)/is);
  const deliveryMatch = text.match(/DELIVERY_COMPLETE:\s*(true|false)/i);
  const slaMatch = text.match(/SLA_COMPLIANT:\s*(true|false|unknown)/i);
  const evidenceMatch = text.match(/EVIDENCE_STRENGTH:\s*(weak|moderate|strong)/i);

  const rawScore = scoreMatch ? parseInt(scoreMatch[1]) : 72;
  const score = Math.min(100, Math.max(0, rawScore));
  const confidence =
    (confidenceMatch?.[1]?.toLowerCase() as 'low' | 'medium' | 'high') || 'medium';

  log.debug('Parsed LLM response', {
    score,
    confidence,
    hasReasoning: !!reasoningMatch,
  });

  return {
    score,
    confidence,
    reasoning: reasoningMatch?.[1]?.trim() || 'Unable to parse detailed reasoning.',
    factors: {
      deliveryComplete: deliveryMatch?.[1]?.toLowerCase() === 'true',
      slaCompliant: slaMatch?.[1]?.toLowerCase() === 'true',
      evidenceStrength:
        (evidenceMatch?.[1]?.toLowerCase() as 'weak' | 'moderate' | 'strong') || 'weak',
      providerHistory: categorizeHistory(
        context.provider.reputation,
        context.provider.disputeRate
      ),
      agentHistory: categorizeAgentHistory(
        context.agent.reputation,
        context.agent.disputeRate
      ),
    },
  };
}

function heuristicEvaluation(context: EvaluationContext): QualityAssessment {
  let score = 72; // Start neutral

  // Adjust based on provider history
  if (context.provider.reputation > 700) score += 10;
  else if (context.provider.reputation < 300) score -= 15;

  if (context.provider.disputeRate > 30) score -= 10;
  else if (context.provider.disputeRate < 10) score += 5;

  // Adjust based on agent history (high dispute rate = possibly frivolous)
  if (context.agent.disputeRate > 40) score += 10;
  else if (context.agent.disputeRate < 5) score -= 5;

  score = Math.min(100, Math.max(0, score));

  log.info('Heuristic evaluation complete', { score });

  return {
    score,
    confidence: 'low',
    reasoning: 'Heuristic evaluation based on party histories.',
    factors: {
      deliveryComplete: true,
      slaCompliant: true,
      evidenceStrength: 'weak',
      providerHistory: categorizeHistory(
        context.provider.reputation,
        context.provider.disputeRate
      ),
      agentHistory: categorizeAgentHistory(
        context.agent.reputation,
        context.agent.disputeRate
      ),
    },
  };
}

function categorizeHistory(
  reputation: number,
  disputeRate: number
): 'poor' | 'average' | 'good' {
  if (reputation > 700 && disputeRate < 15) return 'good';
  if (reputation < 300 || disputeRate > 40) return 'poor';
  return 'average';
}

function categorizeAgentHistory(
  reputation: number,
  disputeRate: number
): 'frivolous' | 'average' | 'legitimate' {
  if (disputeRate > 50) return 'frivolous';
  if (reputation > 700 && disputeRate < 20) return 'legitimate';
  return 'average';
}
