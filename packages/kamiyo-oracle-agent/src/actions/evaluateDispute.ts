import type { Action, IAgentRuntime, Memory, State, HandlerCallback } from '../types';
import { gatherEvaluationContext } from '../lib/contextGatherer';
import { evaluateWithLLM } from '../lib/llmEvaluator';
import { calibrateVote } from '../lib/confidenceCalibrator';
import { getOracleStake } from '../lib/voteSubmitter';

export const evaluateDisputeAction: Action = {
  name: 'EVALUATE_DISPUTE',
  description: 'Evaluate a disputed escrow and determine quality score using LLM reasoning',
  similes: ['evaluate', 'assess', 'judge', 'review dispute', 'analyze escrow'],

  examples: [
    [
      {
        user: '{{user1}}',
        content: { text: 'Evaluate dispute for escrow ABC123...' },
      },
      {
        user: '{{agent}}',
        content: {
          text: 'Evaluating dispute ABC123...\n\nAssessment complete.\nScore: 65/100\nConfidence: medium\nRecommendation: Vote 68\nReasoning: Provider delivered partial service with some quality issues.',
          action: 'EVALUATE_DISPUTE',
        },
      },
    ],
    [
      {
        user: '{{user1}}',
        content: { text: 'What score would you give escrow XYZ789?' },
      },
      {
        user: '{{agent}}',
        content: {
          text: 'Assessment for XYZ789:\nScore: 85/100\nConfidence: high\nRecommendation: Vote 85\nReasoning: Strong evidence of service delivery, provider has excellent history.',
          action: 'EVALUATE_DISPUTE',
        },
      },
    ],
  ],

  async validate(_runtime: IAgentRuntime, message: Memory): Promise<boolean> {
    const text = message.content.text?.toLowerCase() || '';
    return (
      text.includes('evaluate') ||
      text.includes('assess') ||
      text.includes('judge') ||
      text.includes('review dispute') ||
      (text.includes('score') && text.includes('escrow'))
    );
  },

  async handler(
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<{
    success: boolean;
    assessment?: {
      score: number;
      confidence: string;
      reasoning: string;
    };
    strategy?: {
      shouldVote: boolean;
      adjustedScore: number;
      riskLevel: string;
    };
    error?: string;
  }> {
    try {
      // Extract escrow ID from message
      const escrowId = parseEscrowId(message.content.text || '');

      if (!escrowId) {
        callback?.({ text: 'Please provide an escrow address to evaluate.' });
        return { success: false, error: 'No escrow ID provided' };
      }

      callback?.({ text: `Evaluating dispute for escrow ${escrowId.slice(0, 8)}...` });

      // 1. Gather context
      const context = await gatherEvaluationContext(runtime, escrowId);

      callback?.({
        text: `Context gathered:\n- Amount: ${context.escrow.amount} SOL\n- Provider reputation: ${context.provider.reputation}/1000\n- Agent dispute rate: ${context.agent.disputeRate.toFixed(1)}%\n\nRunning LLM evaluation...`,
      });

      // 2. LLM evaluation
      const assessment = await evaluateWithLLM(runtime, context);

      // 3. Get stake for calibration
      const oracleStake = await getOracleStake(runtime);

      // 4. Calibrate vote
      const strategy = calibrateVote(assessment, context, oracleStake);

      // 5. Build response
      const response = buildAssessmentResponse(assessment, strategy, context);

      callback?.({ text: response });

      return {
        success: true,
        assessment: {
          score: assessment.score,
          confidence: assessment.confidence,
          reasoning: assessment.reasoning,
        },
        strategy: {
          shouldVote: strategy.shouldVote,
          adjustedScore: strategy.adjustedScore,
          riskLevel: strategy.riskLevel,
        },
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      callback?.({ text: `Evaluation failed: ${errorMsg}` });
      return { success: false, error: errorMsg };
    }
  },
};

function parseEscrowId(text: string): string | null {
  // Match Solana base58 addresses (32-44 chars)
  const match = text.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/);
  return match?.[0] || null;
}

function buildAssessmentResponse(
  assessment: {
    score: number;
    confidence: string;
    reasoning: string;
    factors: {
      deliveryComplete: boolean;
      slaCompliant: boolean;
      evidenceStrength: string;
      providerHistory: string;
      agentHistory: string;
    };
  },
  strategy: {
    shouldVote: boolean;
    adjustedScore: number;
    riskLevel: string;
    expectedReward: number;
    maxLoss: number;
  },
  context: { escrow: { pda: string } }
): string {
  const lines = [
    `Assessment complete for ${context.escrow.pda.slice(0, 8)}...`,
    '',
    `Score: ${assessment.score}/100`,
    `Confidence: ${assessment.confidence}`,
    `Risk Level: ${strategy.riskLevel}`,
    '',
    `Factors:`,
    `  Delivery: ${assessment.factors.deliveryComplete ? 'Complete' : 'Incomplete'}`,
    `  SLA: ${assessment.factors.slaCompliant ? 'Compliant' : 'Violated'}`,
    `  Evidence: ${assessment.factors.evidenceStrength}`,
    `  Provider History: ${assessment.factors.providerHistory}`,
    `  Agent History: ${assessment.factors.agentHistory}`,
    '',
    `Recommendation: ${strategy.shouldVote ? `Vote ${strategy.adjustedScore}` : 'Abstain'}`,
    '',
    `Economics:`,
    `  Expected Reward: ${strategy.expectedReward.toFixed(6)} SOL`,
    `  Max Loss (if slashed): ${strategy.maxLoss.toFixed(6)} SOL`,
    '',
    `Reasoning: ${assessment.reasoning}`,
  ];

  return lines.join('\n');
}
