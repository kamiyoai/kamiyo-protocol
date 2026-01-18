import type { Action, IAgentRuntime, Memory, State, HandlerCallback } from '../types';
import { submitOracleVote, getOracleStake } from '../lib/voteSubmitter';
import { gatherEvaluationContext, hasAlreadyVoted } from '../lib/contextGatherer';
import { evaluateWithLLM } from '../lib/llmEvaluator';
import { calibrateVote, shouldAbstainOnRisk } from '../lib/confidenceCalibrator';

export const submitVoteAction: Action = {
  name: 'SUBMIT_ORACLE_VOTE',
  description: 'Submit a quality score vote to the KAMIYO protocol for a disputed escrow',
  similes: ['vote', 'submit score', 'cast vote', 'submit oracle vote'],

  examples: [
    [
      {
        user: '{{user1}}',
        content: { text: 'Submit vote 75 for escrow ABC123...' },
      },
      {
        user: '{{agent}}',
        content: {
          text: 'Vote submitted!\nEscrow: ABC123...\nScore: 75/100\nTransaction: 5xYz...',
          action: 'SUBMIT_ORACLE_VOTE',
        },
      },
    ],
    [
      {
        user: '{{user1}}',
        content: { text: 'Vote on dispute XYZ789' },
      },
      {
        user: '{{agent}}',
        content: {
          text: 'Evaluating and submitting vote...\nScore: 68/100\nTransaction: 3aBc...',
          action: 'SUBMIT_ORACLE_VOTE',
        },
      },
    ],
  ],

  async validate(_runtime: IAgentRuntime, message: Memory): Promise<boolean> {
    const text = message.content.text?.toLowerCase() || '';
    return (
      text.includes('vote') ||
      text.includes('submit score') ||
      text.includes('cast')
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
    transaction?: string;
    score?: number;
    error?: string;
  }> {
    try {
      // Parse escrow ID and optional score
      const { escrowId, explicitScore } = parseVoteParams(message.content.text || '');

      if (!escrowId) {
        callback?.({ text: 'Please provide an escrow address to vote on.' });
        return { success: false, error: 'No escrow ID provided' };
      }

      // Check if already voted
      if (await hasAlreadyVoted(runtime, escrowId)) {
        callback?.({ text: `Already voted on escrow ${escrowId.slice(0, 8)}...` });
        return { success: false, error: 'Already voted on this dispute' };
      }

      callback?.({ text: `Preparing vote for escrow ${escrowId.slice(0, 8)}...` });

      let finalScore: number;

      if (explicitScore !== null) {
        // User provided explicit score
        finalScore = explicitScore;
        callback?.({ text: `Using provided score: ${finalScore}` });
      } else {
        // Evaluate and determine score
        callback?.({ text: 'No score provided, running evaluation...' });

        const context = await gatherEvaluationContext(runtime, escrowId);
        const assessment = await evaluateWithLLM(runtime, context);
        const oracleStake = await getOracleStake(runtime);
        const strategy = calibrateVote(assessment, context, oracleStake);

        if (!strategy.shouldVote) {
          callback?.({
            text: `Abstaining from vote: ${strategy.reasoning}`,
          });
          return { success: false, error: 'Strategy recommends abstaining' };
        }

        if (shouldAbstainOnRisk(runtime, strategy)) {
          callback?.({
            text: `Risk tolerance exceeded. Risk level: ${strategy.riskLevel}. Abstaining.`,
          });
          return { success: false, error: 'Risk tolerance exceeded' };
        }

        finalScore = strategy.adjustedScore;
        callback?.({
          text: `Evaluation complete. Voting ${finalScore}/100 (${assessment.confidence} confidence)`,
        });
      }

      // Submit the vote
      callback?.({ text: 'Signing and submitting vote to blockchain...' });

      const txSignature = await submitOracleVote(runtime, escrowId, {
        shouldVote: true,
        adjustedScore: finalScore,
        riskLevel: 'medium',
        expectedReward: 0,
        maxLoss: 0,
        reasoning: 'Manual or auto-evaluated vote',
      });

      callback?.({
        text: `Vote submitted successfully!\n\nEscrow: ${escrowId.slice(0, 8)}...\nScore: ${finalScore}/100\nTransaction: ${txSignature}`,
      });

      return {
        success: true,
        transaction: txSignature,
        score: finalScore,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      callback?.({ text: `Vote submission failed: ${errorMsg}` });
      return { success: false, error: errorMsg };
    }
  },
};

function parseVoteParams(text: string): {
  escrowId: string | null;
  explicitScore: number | null;
} {
  // Match Solana base58 addresses
  const addressMatch = text.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/);

  // Match explicit score (e.g., "vote 75", "score 80", "submit 65")
  const scoreMatch = text.match(/(?:vote|score|submit)\s+(\d+)/i);

  return {
    escrowId: addressMatch?.[0] || null,
    explicitScore: scoreMatch ? Math.min(100, Math.max(0, parseInt(scoreMatch[1]))) : null,
  };
}
