import type { Service, IAgentRuntime, PendingDispute, OraclePerformance } from '../types';
import { gatherEvaluationContext, hasAlreadyVoted } from '../lib/contextGatherer';
import { evaluateWithLLM } from '../lib/llmEvaluator';
import { calibrateVote, shouldAbstainOnRisk, calculatePositionSizing } from '../lib/confidenceCalibrator';
import { submitOracleVote, getOracleStake } from '../lib/voteSubmitter';

export const autoVoterService: Service = {
  name: 'kamiyo-auto-voter',
  description: 'Automatically evaluates and votes on pending disputes',

  async start(runtime: IAgentRuntime): Promise<void> {
    const autoVoteEnabled = runtime.getSetting('AUTO_VOTE_ENABLED') !== 'false';

    if (!autoVoteEnabled) {
      console.log('[auto-voter] Disabled by configuration');
      return;
    }

    const pollInterval = parseInt(runtime.getSetting('POLL_INTERVAL_MS') || '30000');

    console.log('[auto-voter] Starting autonomous voting service...');
    console.log(`[auto-voter] Poll interval: ${pollInterval}ms`);

    const processDisputes = async () => {
      try {
        await processPendingDisputes(runtime);
      } catch (err) {
        console.error('[auto-voter] Process error:', err);
      }
    };

    const timer = setInterval(processDisputes, pollInterval);
    (this as any)._timer = timer;

    // Initial run after a short delay
    setTimeout(processDisputes, 5000);

    console.log('[auto-voter] Service started');
  },

  async stop(): Promise<void> {
    if ((this as any)._timer) {
      clearInterval((this as any)._timer);
      console.log('[auto-voter] Service stopped');
    }
  },
};

async function processPendingDisputes(runtime: IAgentRuntime): Promise<void> {
  const state = await runtime.getState?.('oracle_state') as {
    pendingDisputes?: PendingDispute[];
    votedDisputes?: string[];
    performance?: OraclePerformance;
    voteHistory?: Record<string, number>;
  } | undefined;

  const pending = state?.pendingDisputes || [];

  if (pending.length === 0) {
    return; // Nothing to process
  }

  const performance = state?.performance || {
    totalVotes: 0,
    accurateVotes: 0,
    slashEvents: 0,
    totalRewardsEarned: 0,
    totalSlashLoss: 0,
    currentStake: 1.0,
    violationCount: 0,
    accuracyRate: 100,
    profitLoss: 0,
  };

  // Calculate how many disputes we should process based on risk
  const maxPending = parseInt(runtime.getSetting('MAX_PENDING_DISPUTES') || '5');
  const positionSize = calculatePositionSizing(performance, maxPending);

  console.log(`[auto-voter] Processing ${Math.min(pending.length, positionSize)} of ${pending.length} pending disputes`);

  const processed: string[] = [];
  const voteHistory = state?.voteHistory || {};

  for (const dispute of pending.slice(0, positionSize)) {
    try {
      // Skip if already voted
      if (await hasAlreadyVoted(runtime, dispute.escrowPda)) {
        processed.push(dispute.escrowPda);
        continue;
      }

      // Skip if too many failed attempts
      if (dispute.evaluationAttempts >= 3) {
        console.log(`[auto-voter] Skipping ${dispute.escrowPda.slice(0, 8)}... - too many failed attempts`);
        processed.push(dispute.escrowPda);
        continue;
      }

      console.log(`[auto-voter] Evaluating ${dispute.escrowPda.slice(0, 8)}...`);

      // Gather context
      const context = await gatherEvaluationContext(runtime, dispute);

      // LLM evaluation
      const assessment = await evaluateWithLLM(runtime, context);
      console.log(`[auto-voter] Assessment: score=${assessment.score}, confidence=${assessment.confidence}`);

      // Get current stake
      const oracleStake = await getOracleStake(runtime);

      // Calibrate vote
      const strategy = calibrateVote(assessment, context, oracleStake);

      // Check if we should abstain based on risk tolerance
      if (!strategy.shouldVote) {
        console.log(`[auto-voter] Abstaining: ${strategy.reasoning}`);
        processed.push(dispute.escrowPda);
        continue;
      }

      if (shouldAbstainOnRisk(runtime, strategy)) {
        console.log(`[auto-voter] Risk tolerance exceeded (${strategy.riskLevel}), abstaining`);
        processed.push(dispute.escrowPda);
        continue;
      }

      // Check minimum confidence setting
      const minConfidence = runtime.getSetting('MIN_CONFIDENCE_TO_VOTE') || 'medium';
      if (!meetsConfidenceThreshold(assessment.confidence, minConfidence as 'low' | 'medium' | 'high')) {
        console.log(`[auto-voter] Confidence (${assessment.confidence}) below minimum (${minConfidence}), abstaining`);
        processed.push(dispute.escrowPda);
        continue;
      }

      // Submit vote
      console.log(`[auto-voter] Submitting vote: ${strategy.adjustedScore}`);
      const txSignature = await submitOracleVote(runtime, dispute.escrowPda, strategy);
      console.log(`[auto-voter] Vote submitted: ${txSignature}`);

      // Record vote in history
      voteHistory[dispute.escrowPda] = strategy.adjustedScore;
      processed.push(dispute.escrowPda);

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[auto-voter] Failed to process ${dispute.escrowPda.slice(0, 8)}...: ${errorMsg}`);

      // Increment attempt counter
      dispute.evaluationAttempts += 1;
      dispute.lastError = errorMsg;
    }
  }

  // Update state
  const votedDisputes = [...(state?.votedDisputes || []), ...processed.filter(p =>
    !state?.votedDisputes?.includes(p)
  )];

  const remainingPending = pending
    .filter(d => !processed.includes(d.escrowPda))
    .map(d => ({ ...d })); // Clone to preserve updates

  await runtime.setState?.('oracle_state', {
    pendingDisputes: remainingPending,
    votedDisputes,
    performance,
    voteHistory,
  });

  console.log(`[auto-voter] Processed ${processed.length} disputes, ${remainingPending.length} remaining`);
}

function meetsConfidenceThreshold(
  actual: 'low' | 'medium' | 'high',
  required: 'low' | 'medium' | 'high'
): boolean {
  const levels = { low: 1, medium: 2, high: 3 };
  return levels[actual] >= levels[required];
}
