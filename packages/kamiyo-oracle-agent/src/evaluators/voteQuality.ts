import type { Evaluator, IAgentRuntime, Memory, State, OraclePerformance } from '../types';
import { ORACLE_CONSTANTS } from '../config';

export const voteQualityEvaluator: Evaluator = {
  name: 'ORACLE_VOTE_QUALITY',
  description: 'Evaluates vote accuracy after dispute resolution and updates performance metrics',

  async validate(_runtime: IAgentRuntime, message: Memory): Promise<boolean> {
    const text = message.content.text?.toLowerCase() || '';
    // Trigger when we receive dispute resolution events
    return (
      text.includes('dispute resolved') ||
      text.includes('consensus reached') ||
      text.includes('settlement complete')
    );
  },

  async handler(
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State
  ): Promise<{
    wasAccurate: boolean;
    ourScore: number;
    consensusScore: number;
    deviation: number;
    wasSlashed: boolean;
  } | null> {
    try {
      // Parse the resolution details from message
      const resolution = parseResolutionDetails(message.content.text || '');
      if (!resolution) return null;

      // Get our submitted score for this escrow
      const oracleState = await runtime.getState?.('oracle_state') as {
        votedDisputes?: string[];
        voteHistory?: Record<string, number>;
        performance?: OraclePerformance;
      } | undefined;

      const ourScore = oracleState?.voteHistory?.[resolution.escrowPda];
      if (ourScore === undefined) {
        // We didn't vote on this dispute
        return null;
      }

      // Calculate deviation from consensus
      const deviation = Math.abs(ourScore - resolution.consensusScore);
      const wasAccurate = deviation <= ORACLE_CONSTANTS.MAX_SCORE_DEVIATION;
      const wasSlashed = !wasAccurate;

      // Update performance metrics
      const performance: OraclePerformance = oracleState?.performance || {
        totalVotes: 0,
        accurateVotes: 0,
        slashEvents: 0,
        totalRewardsEarned: 0,
        totalSlashLoss: 0,
        currentStake: 1.0,
        violationCount: 0,
        accuracyRate: 0,
        profitLoss: 0,
      };

      performance.totalVotes += 1;

      if (wasAccurate) {
        performance.accurateVotes += 1;
        performance.totalRewardsEarned += resolution.rewardAmount || 0;
      } else {
        performance.slashEvents += 1;
        performance.violationCount += 1;
        const slashAmount = performance.currentStake * (ORACLE_CONSTANTS.SLASH_PERCENTAGE / 100);
        performance.totalSlashLoss += slashAmount;
        performance.currentStake -= slashAmount;
      }

      performance.accuracyRate = (performance.accurateVotes / performance.totalVotes) * 100;
      performance.profitLoss = performance.totalRewardsEarned - performance.totalSlashLoss;

      // Save updated performance
      await runtime.setState?.('oracle_state', {
        ...oracleState,
        performance,
      });

      return {
        wasAccurate,
        ourScore,
        consensusScore: resolution.consensusScore,
        deviation,
        wasSlashed,
      };
    } catch {
      return null;
    }
  },
};

interface ResolutionDetails {
  escrowPda: string;
  consensusScore: number;
  rewardAmount?: number;
}

function parseResolutionDetails(text: string): ResolutionDetails | null {
  // Try to extract escrow PDA
  const escrowMatch = text.match(/escrow[:\s]+([1-9A-HJ-NP-Za-km-z]{32,44})/i);
  if (!escrowMatch) return null;

  // Try to extract consensus score
  const scoreMatch = text.match(/consensus[:\s]+(\d+)/i) ||
                     text.match(/score[:\s]+(\d+)/i);
  if (!scoreMatch) return null;

  // Try to extract reward amount
  const rewardMatch = text.match(/reward[:\s]+([\d.]+)/i);

  return {
    escrowPda: escrowMatch[1],
    consensusScore: parseInt(scoreMatch[1]),
    rewardAmount: rewardMatch ? parseFloat(rewardMatch[1]) : undefined,
  };
}
