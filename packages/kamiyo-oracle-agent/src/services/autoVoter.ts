import type { Service, IAgentRuntime, PendingDispute, OraclePerformance, EvaluationContext, QualityAssessment } from '../types';
import type { GatheredEvidence, DeliberationResult } from '../deliberation/types';
import { gatherEvaluationContext, hasAlreadyVoted } from '../lib/contextGatherer';
import { calibrateVote, shouldAbstainOnRisk, calculatePositionSizing } from '../lib/confidenceCalibrator';
import { submitOracleVote, getOracleStake } from '../lib/voteSubmitter';
import { createLogger } from '../lib/logger';
import { EvaluationError, VotingError } from '../lib/errors';
import { withLLMRateLimit, withRPCRateLimit } from '../lib/rateLimit';
import { onShutdown, isShuttingDown, ShutdownPriority } from '../lib/shutdown';
import { createDeliberationChamber } from '../deliberation/chamber';
import { EvidenceHunter, type EvidenceHuntResult } from '../evidence/hunter';
import { ReasoningChainBuilder, type ReasoningChain, type ReasoningCommitment } from '../verification/reasoningChain';
import { IPFSPublisher, type IPFSPublishResult } from '../verification/ipfsPublisher';

const log = createLogger('auto-voter');

interface ServiceState {
  timer: ReturnType<typeof setInterval> | null;
  isProcessing: boolean;
  runtime: IAgentRuntime | null;
}

const state: ServiceState = {
  timer: null,
  isProcessing: false,
  runtime: null,
};

const DEFAULT_PERFORMANCE: OraclePerformance = {
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

export const autoVoterService: Service = {
  name: 'kamiyo-auto-voter',
  description: 'Automatically evaluates and votes on pending disputes',

  async start(runtime: IAgentRuntime): Promise<void> {
    const autoVoteEnabled = runtime.getSetting('AUTO_VOTE_ENABLED') !== 'false';

    if (!autoVoteEnabled) {
      log.info('Auto voter disabled by configuration');
      return;
    }

    const pollInterval = parseInt(runtime.getSetting('POLL_INTERVAL_MS') || '30000');

    log.info('Starting auto voter', { pollInterval });

    state.isProcessing = false;
    state.runtime = runtime;

    // Register shutdown handler
    onShutdown(
      'auto-voter',
      async () => {
        await stopAutoVoter();
      },
      ShutdownPriority.NORMAL
    );

    const processDisputes = async () => {
      if (isShuttingDown() || state.isProcessing) return;

      state.isProcessing = true;
      try {
        await processPendingDisputes(runtime);
      } catch (err) {
        log.error('Process error', err instanceof Error ? err : new Error(String(err)));
      } finally {
        state.isProcessing = false;
      }
    };

    state.timer = setInterval(processDisputes, pollInterval);

    // Initial run after a short delay
    setTimeout(processDisputes, 5000);

    log.info('Auto voter started');
  },

  async stop(): Promise<void> {
    await stopAutoVoter();
  },
};

async function stopAutoVoter(): Promise<void> {
  if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }

  // Wait for current processing to complete
  let waitAttempts = 0;
  while (state.isProcessing && waitAttempts < 20) {
    await new Promise((r) => setTimeout(r, 500));
    waitAttempts++;
  }

  state.runtime = null;
  log.info('Auto voter stopped');
}

async function processPendingDisputes(runtime: IAgentRuntime): Promise<void> {
  const oracleState = (await runtime.getState?.('oracle_state')) as {
    pendingDisputes?: PendingDispute[];
    votedDisputes?: string[];
    performance?: OraclePerformance;
    voteHistory?: Record<string, number>;
  } | undefined;

  const pending = oracleState?.pendingDisputes || [];

  if (pending.length === 0) {
    return;
  }

  const performance = oracleState?.performance || DEFAULT_PERFORMANCE;
  const maxPending = parseInt(runtime.getSetting('MAX_PENDING_DISPUTES') || '5');
  const positionSize = calculatePositionSizing(performance, maxPending);

  log.info('Processing disputes', {
    pending: pending.length,
    processing: Math.min(pending.length, positionSize),
  });

  const processed: string[] = [];
  const voteHistory = oracleState?.voteHistory || {};

  for (const dispute of pending.slice(0, positionSize)) {
    if (isShuttingDown()) break;

    try {
      const result = await processDispute(runtime, dispute, voteHistory);
      if (result.processed) {
        processed.push(dispute.escrowPda);
        if (result.score !== undefined) {
          voteHistory[dispute.escrowPda] = result.score;
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      log.error('Failed to process dispute', new Error(errorMsg), {
        escrow: dispute.escrowPda.slice(0, 8),
      });

      dispute.evaluationAttempts += 1;
      dispute.lastError = errorMsg;
    }
  }

  // Update state
  const votedDisputes = [
    ...(oracleState?.votedDisputes || []),
    ...processed.filter((p) => !oracleState?.votedDisputes?.includes(p)),
  ];

  const remainingPending = pending
    .filter((d) => !processed.includes(d.escrowPda))
    .map((d) => ({ ...d }));

  await runtime.setState?.('oracle_state', {
    pendingDisputes: remainingPending,
    votedDisputes,
    performance,
    voteHistory,
  });

  log.info('Processing complete', {
    processed: processed.length,
    remaining: remainingPending.length,
  });
}

interface ProcessingResult {
  processed: boolean;
  score?: number;
  reasoningCid?: string;
}

async function processDispute(
  runtime: IAgentRuntime,
  dispute: PendingDispute,
  voteHistory: Record<string, number>
): Promise<ProcessingResult> {
  const escrowShort = dispute.escrowPda.slice(0, 8);

  // Skip if already voted
  if (await hasAlreadyVoted(runtime, dispute.escrowPda)) {
    log.debug('Already voted', { escrow: escrowShort });
    return { processed: true };
  }

  // Skip if too many failed attempts
  if (dispute.evaluationAttempts >= 3) {
    log.warn('Too many failed attempts', { escrow: escrowShort });
    return { processed: true };
  }

  log.info('Evaluating dispute', { escrow: escrowShort });

  // Gather context
  const context = await gatherEvaluationContext(runtime, dispute);

  // Phase 1: Evidence gathering
  const evidenceResult = await gatherEvidence(runtime, context);

  // Phase 2: Adversarial deliberation
  const deliberation = await runDeliberation(runtime, context, evidenceResult.evidence);
  log.info('Deliberation complete', {
    escrow: escrowShort,
    score: deliberation.finalScore,
    confidence: deliberation.confidence,
    rounds: deliberation.metadata.totalRounds,
  });

  // Phase 3: Build verifiable reasoning chain
  const { chain, commitment, ipfsResult } = await buildReasoningChain(
    runtime,
    deliberation,
    context,
    evidenceResult.evidence
  );

  // Convert deliberation result to assessment format for calibration
  const assessment = deliberationToAssessment(deliberation, context);

  // Get current stake
  const oracleStake = await getOracleStake(runtime);

  // Calibrate vote
  const strategy = calibrateVote(assessment, context, oracleStake);

  // Check if we should vote
  if (!strategy.shouldVote) {
    log.info('Abstaining', {
      escrow: escrowShort,
      reason: strategy.reasoning,
    });
    return { processed: true };
  }

  if (shouldAbstainOnRisk(runtime, strategy)) {
    log.info('Risk tolerance exceeded', {
      escrow: escrowShort,
      riskLevel: strategy.riskLevel,
    });
    return { processed: true };
  }

  // Check minimum confidence setting
  const minConfidence = runtime.getSetting('MIN_CONFIDENCE_TO_VOTE') || 'medium';
  if (!meetsConfidenceThreshold(deliberation.confidence, minConfidence as 'low' | 'medium' | 'high')) {
    log.info('Confidence below threshold', {
      escrow: escrowShort,
      actual: deliberation.confidence,
      required: minConfidence,
    });
    return { processed: true };
  }

  // Submit vote with reasoning commitment
  log.info('Submitting vote', {
    escrow: escrowShort,
    score: strategy.adjustedScore,
    reasoningHash: commitment.rootHash.slice(0, 16),
    ipfsCid: ipfsResult?.cid?.slice(0, 12) || 'none',
  });

  const result = await submitOracleVote(runtime, dispute.escrowPda, strategy, commitment);

  log.info('Vote submitted', {
    escrow: escrowShort,
    signature: result.signature.slice(0, 8),
    slot: result.slot,
    reasoningCid: ipfsResult?.cid,
  });

  return {
    processed: true,
    score: strategy.adjustedScore,
    reasoningCid: ipfsResult?.cid,
  };
}

async function gatherEvidence(
  runtime: IAgentRuntime,
  context: EvaluationContext
): Promise<EvidenceHuntResult> {
  const escrowShort = context.escrow.pda.slice(0, 8);
  log.debug('Gathering evidence', { escrow: escrowShort });

  const hunter = new EvidenceHunter(runtime, {
    maxTimeMs: 30000,
    enableOffChain: !!runtime.getSetting('TAVILY_API_KEY'),
    enablePatternMatching: true,
  });

  const result = await hunter.hunt(context);

  log.info('Evidence gathered', {
    escrow: escrowShort,
    quality: result.quality,
    sources: result.sourcesChecked.length,
    timeMs: result.gatheringTimeMs,
  });

  return result;
}

async function runDeliberation(
  runtime: IAgentRuntime,
  context: EvaluationContext,
  evidence: GatheredEvidence
): Promise<DeliberationResult> {
  const chamber = createDeliberationChamber(runtime);
  return chamber.deliberate(context, evidence);
}

interface ReasoningChainResult {
  chain: ReasoningChain;
  commitment: ReasoningCommitment;
  ipfsResult: IPFSPublishResult | null;
}

async function buildReasoningChain(
  runtime: IAgentRuntime,
  deliberation: DeliberationResult,
  context: EvaluationContext,
  evidence: GatheredEvidence
): Promise<ReasoningChainResult> {
  const builder = new ReasoningChainBuilder();
  const chain = builder.build(deliberation, context, evidence);
  const commitment = builder.createCommitment(chain);

  // Publish to IPFS if configured
  let ipfsResult: IPFSPublishResult | null = null;
  const pinataKey = runtime.getSetting('PINATA_API_KEY');
  const pinataSecret = runtime.getSetting('PINATA_SECRET_KEY');

  if (pinataKey && pinataSecret) {
    const publisher = new IPFSPublisher({
      pinataApiKey: pinataKey,
      pinataSecretKey: pinataSecret,
    });

    ipfsResult = await publisher.publish(chain);
    if (ipfsResult) {
      log.info('Reasoning published', {
        cid: ipfsResult.cid.slice(0, 12),
        size: ipfsResult.size,
      });
    }
  }

  return { chain, commitment, ipfsResult };
}

function meetsConfidenceThreshold(
  actual: 'low' | 'medium' | 'high',
  required: 'low' | 'medium' | 'high'
): boolean {
  const levels = { low: 1, medium: 2, high: 3 };
  return levels[actual] >= levels[required];
}

/**
 * Convert deliberation result to QualityAssessment for calibration
 */
function deliberationToAssessment(
  deliberation: DeliberationResult,
  context: EvaluationContext
): QualityAssessment {
  const analysis = deliberation.arbiterAnalysis;
  const evidence = analysis.evidenceWeight;

  // Derive delivery status from score
  const deliveryComplete = deliberation.finalScore <= 40;

  // SLA compliance: provider scores > 60 suggest compliance
  const slaCompliant = deliberation.finalScore > 60;

  // Evidence strength based on conclusiveness
  const inconclusiveRatio = evidence.inconclusive / 100;
  const evidenceStrength: 'weak' | 'moderate' | 'strong' =
    inconclusiveRatio > 0.5 ? 'weak' :
    inconclusiveRatio > 0.25 ? 'moderate' : 'strong';

  // Provider history from context
  const providerHistory: 'poor' | 'average' | 'good' =
    context.provider.reputation < 400 ? 'poor' :
    context.provider.reputation < 700 ? 'average' : 'good';

  // Agent history from dispute rate
  const agentHistory: 'frivolous' | 'average' | 'legitimate' =
    context.agent.disputeRate > 30 ? 'frivolous' :
    context.agent.disputeRate > 10 ? 'average' : 'legitimate';

  return {
    score: deliberation.finalScore,
    confidence: deliberation.confidence,
    reasoning: deliberation.arbiterReasoning,
    factors: {
      deliveryComplete,
      slaCompliant,
      evidenceStrength,
      providerHistory,
      agentHistory,
    },
  };
}
