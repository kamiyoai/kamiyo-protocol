import Anthropic from '@anthropic-ai/sdk';
import { FAST_MODEL, type MoltbookPost, type JobEvaluation } from './types.js';

const RELEVANT_KEYWORDS = [
  'escrow',
  'trust',
  'reputation',
  'identity',
  'payment',
  'dispute',
  'oracle',
  'agent-to-agent',
  'quality guarantee',
  'refund',
  'collateral',
  'stake',
  'slashing',
  'arbitration',
  'settlement',
  'on-chain',
  'solana',
  'wallet',
  'smart contract',
];

const EVALUATION_SYSTEM = `You evaluate job postings for relevance to agent trust infrastructure.

Relevant topics include:
- Escrow payments and payment guarantees
- Dispute resolution and arbitration
- Agent identity and authentication
- Reputation systems and trust scores
- Quality assessment and SLAs
- Oracle voting and consensus
- On-chain settlement
- Multi-agent coordination with payments

You must respond with valid JSON only, no other text:
{
  "relevant": boolean,
  "reason": "brief explanation",
  "suggestedPrice": number (in SOL, 0.01-10 range based on complexity),
  "complexity": "low" | "medium" | "high"
}

Price guidelines:
- low complexity (simple question, quick research): 0.01-0.05 SOL
- medium complexity (code review, documentation, analysis): 0.05-0.5 SOL
- high complexity (implementation, architecture, in-depth research): 0.5-5 SOL`;

export function hasRelevantKeywords(post: MoltbookPost): boolean {
  const text = `${post.title} ${post.body}`.toLowerCase();
  return RELEVANT_KEYWORDS.some((keyword) => text.includes(keyword.toLowerCase()));
}

export async function evaluateJob(
  post: MoltbookPost,
  anthropic: Anthropic
): Promise<JobEvaluation> {
  // Fast path: no keywords = not relevant
  if (!hasRelevantKeywords(post)) {
    return {
      relevant: false,
      reason: 'No relevant keywords found',
    };
  }

  try {
    const response = await anthropic.messages.create({
      model: FAST_MODEL,
      max_tokens: 300,
      system: EVALUATION_SYSTEM,
      messages: [
        {
          role: 'user',
          content: `Evaluate this job posting:\n\nTitle: ${post.title}\n\n${post.body}`,
        },
      ],
    });

    const text = response.content[0];
    if (text.type !== 'text') {
      return { relevant: false, reason: 'Invalid response format' };
    }

    // Extract JSON from response (handle markdown code blocks)
    let jsonStr = text.text.trim();
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    let evaluation: JobEvaluation;
    try {
      evaluation = JSON.parse(jsonStr) as JobEvaluation;
    } catch {
      return { relevant: false, reason: 'Failed to parse evaluation response' };
    }

    // Validate response structure
    if (typeof evaluation.relevant !== 'boolean') {
      return { relevant: false, reason: 'Invalid evaluation structure' };
    }

    // Clamp price to reasonable range
    if (typeof evaluation.suggestedPrice === 'number') {
      evaluation.suggestedPrice = Math.max(0.01, Math.min(10, evaluation.suggestedPrice));
    } else {
      evaluation.suggestedPrice = 0.05;
    }

    return evaluation;
  } catch (err) {
    console.error('Evaluation error:', err);
    return {
      relevant: false,
      reason: `Evaluation failed: ${err instanceof Error ? err.message : 'unknown'}`,
    };
  }
}

export function formatOffer(evaluation: JobEvaluation): string {
  const price = evaluation.suggestedPrice ?? 0.05;

  return `I can help with this. My rate is ${price} SOL.

For payment protection, I use KAMIYO escrow:
1. You create an escrow with your wallet (locks funds)
2. I complete the work
3. You review and release payment (or dispute if not satisfied)

The escrow ensures you only pay for quality work, and I'm guaranteed payment for delivered work.

Reply with your Solana wallet address to proceed.`;
}
