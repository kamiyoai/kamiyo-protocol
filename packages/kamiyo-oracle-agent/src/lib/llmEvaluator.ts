import type { IAgentRuntime, EvaluationContext, QualityAssessment } from '../types';

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
{{#if providerClaim}}Provider's Claim: {{providerClaim}}{{/if}}
{{#if deliveryProof}}Delivery Proof: {{deliveryProof}}{{/if}}
{{#if thirdPartyData}}Third Party Data: {{thirdPartyData}}{{/if}}

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

export async function evaluateWithLLM(
  runtime: IAgentRuntime,
  context: EvaluationContext
): Promise<QualityAssessment> {
  const model = runtime.getSetting('EVALUATION_MODEL') || 'claude-3-5-sonnet-20241022';
  const apiKey = runtime.getSetting('ANTHROPIC_API_KEY');

  if (!apiKey) {
    // Fallback to heuristic evaluation if no API key
    return heuristicEvaluation(context);
  }

  const prompt = buildPrompt(context);

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
    });

    if (!response.ok) {
      console.error('LLM API error:', response.status);
      return heuristicEvaluation(context);
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';

    return parseAssessment(text, context);
  } catch (error) {
    console.error('LLM evaluation failed:', error);
    return heuristicEvaluation(context);
  }
}

function buildPrompt(context: EvaluationContext): string {
  const timeSinceCreation = Math.floor(
    (Date.now() / 1000 - context.escrow.createdAt) / 3600
  );

  let prompt = EVALUATION_PROMPT
    .replace('{{serviceType}}', context.service.type)
    .replace('{{amount}}', context.escrow.amount.toFixed(4))
    .replace('{{transactionId}}', context.escrow.transactionId)
    .replace('{{timeSinceCreation}}', `${timeSinceCreation} hours`)
    .replace('{{providerReputation}}', context.provider.reputation.toString())
    .replace('{{providerDisputeRate}}', context.provider.disputeRate.toFixed(1))
    .replace('{{providerAvgScore}}', context.provider.averageQualityScore.toString())
    .replace('{{providerTotalEscrows}}', context.provider.totalEscrows.toString())
    .replace('{{agentReputation}}', context.agent.reputation.toString())
    .replace('{{agentDisputeRate}}', context.agent.disputeRate.toFixed(1))
    .replace('{{agentTotalEscrows}}', context.agent.totalEscrows.toString())
    .replace('{{slaTerms}}', context.service.slaTerms.map(t => `- ${t}`).join('\n'))
    .replace('{{agentClaim}}', context.evidence.agentClaim);

  // Handle optional fields
  if (context.evidence.providerClaim) {
    prompt = prompt.replace('{{#if providerClaim}}', '').replace('{{/if}}', '');
    prompt = prompt.replace('{{providerClaim}}', context.evidence.providerClaim);
  } else {
    prompt = prompt.replace(/{{#if providerClaim}}.*{{\/if}}/s, '');
  }

  if (context.service.deliveryProof) {
    prompt = prompt.replace('{{#if deliveryProof}}', '').replace('{{/if}}', '');
    prompt = prompt.replace('{{deliveryProof}}', context.service.deliveryProof);
  } else {
    prompt = prompt.replace(/{{#if deliveryProof}}.*{{\/if}}/s, '');
  }

  if (context.evidence.thirdPartyData?.length) {
    prompt = prompt.replace('{{#if thirdPartyData}}', '').replace('{{/if}}', '');
    prompt = prompt.replace('{{thirdPartyData}}', context.evidence.thirdPartyData.join('\n'));
  } else {
    prompt = prompt.replace(/{{#if thirdPartyData}}.*{{\/if}}/s, '');
  }

  return prompt;
}

function parseAssessment(text: string, context: EvaluationContext): QualityAssessment {
  const scoreMatch = text.match(/SCORE:\s*(\d+)/i);
  const confidenceMatch = text.match(/CONFIDENCE:\s*(low|medium|high)/i);
  const reasoningMatch = text.match(/REASONING:\s*(.+?)(?=\n[A-Z_]+:|$)/is);
  const deliveryMatch = text.match(/DELIVERY_COMPLETE:\s*(true|false)/i);
  const slaMatch = text.match(/SLA_COMPLIANT:\s*(true|false|unknown)/i);
  const evidenceMatch = text.match(/EVIDENCE_STRENGTH:\s*(weak|moderate|strong)/i);

  const score = scoreMatch ? Math.min(100, Math.max(0, parseInt(scoreMatch[1]))) : 72;
  const confidence = (confidenceMatch?.[1]?.toLowerCase() as 'low' | 'medium' | 'high') || 'medium';

  return {
    score,
    confidence,
    reasoning: reasoningMatch?.[1]?.trim() || 'Unable to parse detailed reasoning.',
    factors: {
      deliveryComplete: deliveryMatch?.[1]?.toLowerCase() === 'true',
      slaCompliant: slaMatch?.[1]?.toLowerCase() === 'true',
      evidenceStrength: (evidenceMatch?.[1]?.toLowerCase() as 'weak' | 'moderate' | 'strong') || 'weak',
      providerHistory: categorizeHistory(context.provider.reputation, context.provider.disputeRate),
      agentHistory: categorizeAgentHistory(context.agent.reputation, context.agent.disputeRate),
    },
  };
}

function heuristicEvaluation(context: EvaluationContext): QualityAssessment {
  // Fallback heuristic when LLM is unavailable
  let score = 72; // Start neutral

  // Adjust based on provider history
  if (context.provider.reputation > 700) score += 10;
  else if (context.provider.reputation < 300) score -= 15;

  if (context.provider.disputeRate > 30) score -= 10;
  else if (context.provider.disputeRate < 10) score += 5;

  // Adjust based on agent history (high dispute rate = possibly frivolous)
  if (context.agent.disputeRate > 40) score += 10;
  else if (context.agent.disputeRate < 5) score -= 5;

  // Clamp to valid range
  score = Math.min(100, Math.max(0, score));

  return {
    score,
    confidence: 'low',
    reasoning: 'Heuristic evaluation based on party histories. LLM unavailable.',
    factors: {
      deliveryComplete: true, // Assume true without evidence
      slaCompliant: true,
      evidenceStrength: 'weak',
      providerHistory: categorizeHistory(context.provider.reputation, context.provider.disputeRate),
      agentHistory: categorizeAgentHistory(context.agent.reputation, context.agent.disputeRate),
    },
  };
}

function categorizeHistory(reputation: number, disputeRate: number): 'poor' | 'average' | 'good' {
  if (reputation > 700 && disputeRate < 15) return 'good';
  if (reputation < 300 || disputeRate > 40) return 'poor';
  return 'average';
}

function categorizeAgentHistory(reputation: number, disputeRate: number): 'frivolous' | 'average' | 'legitimate' {
  if (disputeRate > 50) return 'frivolous';
  if (reputation > 700 && disputeRate < 20) return 'legitimate';
  return 'average';
}
