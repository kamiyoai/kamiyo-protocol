import { Connection, PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import type { IAgentRuntime } from '../types';
import { KnowledgeBase, type OutcomeRecord } from './knowledgeBase';
import { getNetworkConfig, PROGRAM_IDS, ORACLE_CONSTANTS } from '../config';
import { createLogger } from '../lib/logger';
import { withRetry } from '../lib/retry';

const log = createLogger('outcome-tracker');

interface EscrowOutcome {
  pda: string;
  status: 'active' | 'released' | 'disputed' | 'resolved';
  qualityScore?: number;
  refundPercentage?: number;
  oracleSubmissions: Array<{
    oracle: string;
    score: number;
  }>;
}

export class OutcomeTracker {
  private connection: Connection;
  private programId: PublicKey;
  private oraclePubkey: PublicKey;
  private knowledgeBase: KnowledgeBase;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private pendingEscrows: Set<string> = new Set();

  constructor(
    runtime: IAgentRuntime,
    knowledgeBase: KnowledgeBase
  ) {
    const { rpcUrl, network } = getNetworkConfig(runtime);
    this.connection = new Connection(rpcUrl, 'confirmed');
    this.programId = new PublicKey(PROGRAM_IDS[network as keyof typeof PROGRAM_IDS]);
    this.knowledgeBase = knowledgeBase;

    const privateKeyStr = runtime.getSetting('ORACLE_PRIVATE_KEY');
    if (privateKeyStr) {
      const { Keypair } = require('@solana/web3.js');
      const keypair = Keypair.fromSecretKey(Buffer.from(privateKeyStr, 'base64'));
      this.oraclePubkey = keypair.publicKey;
    } else {
      this.oraclePubkey = PublicKey.default;
    }
  }

  /**
   * Track a new escrow we voted on
   */
  trackVote(escrowPda: string, ourScore: number, deliberationId: string): void {
    this.pendingEscrows.add(escrowPda);

    this.knowledgeBase.recordOutcome({
      escrowPda,
      ourScore,
      consensusScore: null,
      deviation: null,
      wasSlashed: false,
      rewardAmount: 0,
      deliberationId,
      timestamp: Date.now(),
      finalized: false,
    });

    log.info('Tracking vote outcome', {
      escrow: escrowPda.slice(0, 8),
      score: ourScore,
    });
  }

  /**
   * Start polling for outcomes
   */
  startPolling(intervalMs = 60000): void {
    if (this.pollInterval) return;

    log.info('Starting outcome polling', { intervalMs });

    this.pollInterval = setInterval(() => {
      this.checkPendingOutcomes().catch((err) => {
        log.error('Outcome check failed', err instanceof Error ? err : new Error(String(err)));
      });
    }, intervalMs);

    // Initial check
    this.checkPendingOutcomes().catch(() => {});
  }

  /**
   * Stop polling
   */
  stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
      log.info('Outcome polling stopped');
    }
  }

  /**
   * Check all pending escrows for resolution
   */
  async checkPendingOutcomes(): Promise<void> {
    if (this.pendingEscrows.size === 0) {
      // Load unfinalized from database
      const unfinalized = this.knowledgeBase.getRecentOutcomes(50)
        .filter((o) => !o.finalized);

      for (const outcome of unfinalized) {
        this.pendingEscrows.add(outcome.escrowPda);
      }
    }

    if (this.pendingEscrows.size === 0) return;

    log.debug('Checking pending outcomes', { count: this.pendingEscrows.size });

    for (const escrowPda of this.pendingEscrows) {
      try {
        const outcome = await this.fetchEscrowOutcome(escrowPda);

        if (outcome.status === 'resolved' && outcome.qualityScore !== undefined) {
          await this.processOutcome(escrowPda, outcome);
          this.pendingEscrows.delete(escrowPda);
        }
      } catch (err) {
        log.warn('Failed to check outcome', {
          escrow: escrowPda.slice(0, 8),
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  private async fetchEscrowOutcome(escrowPda: string): Promise<EscrowOutcome> {
    const accountInfo = await withRetry(
      () => this.connection.getAccountInfo(new PublicKey(escrowPda)),
      'fetchEscrow'
    );

    if (!accountInfo) {
      throw new Error('Escrow not found');
    }

    return this.parseEscrowOutcome(escrowPda, accountInfo.data);
  }

  private parseEscrowOutcome(pda: string, data: Buffer): EscrowOutcome {
    let offset = 8; // Skip discriminator

    // Skip agent, api, amount
    offset += 32 + 32 + 8;

    const status = data[offset];
    offset += 1;

    // Skip created_at, expires_at
    offset += 8 + 8;

    // Skip transaction_id
    const txIdLen = data.readUInt32LE(offset);
    offset += 4 + txIdLen;

    // Skip bump
    offset += 1;

    // Read quality_score option
    const hasQualityScore = data[offset] === 1;
    offset += 1;
    const qualityScore = hasQualityScore ? data[offset++] : undefined;

    // Read refund_percentage option
    const hasRefundPercentage = offset < data.length && data[offset] === 1;
    offset += 1;
    const refundPercentage = hasRefundPercentage && offset < data.length ? data[offset++] : undefined;

    // Read oracle_submissions
    const submissions: Array<{ oracle: string; score: number }> = [];
    if (offset + 4 <= data.length) {
      const submissionsLen = data.readUInt32LE(offset);
      offset += 4;

      for (let i = 0; i < submissionsLen && offset + 41 <= data.length; i++) {
        const oracle = new PublicKey(data.slice(offset, offset + 32)).toBase58();
        offset += 32;
        const score = data[offset];
        offset += 1 + 8; // Skip submittedAt

        submissions.push({ oracle, score });
      }
    }

    const statusNames = ['active', 'released', 'disputed', 'resolved'] as const;

    return {
      pda,
      status: statusNames[status] || 'active',
      qualityScore,
      refundPercentage,
      oracleSubmissions: submissions,
    };
  }

  private async processOutcome(escrowPda: string, outcome: EscrowOutcome): Promise<void> {
    const storedOutcome = this.knowledgeBase.getOutcome(escrowPda);
    if (!storedOutcome) {
      log.warn('No stored outcome for resolved escrow', {
        escrow: escrowPda.slice(0, 8),
      });
      return;
    }

    const consensusScore = outcome.qualityScore ?? 72;
    const ourScore = storedOutcome.ourScore;
    const deviation = Math.abs(ourScore - consensusScore);

    // Check if we were slashed (deviation > MAX_SCORE_DEVIATION)
    const wasSlashed = deviation > ORACLE_CONSTANTS.MAX_SCORE_DEVIATION;

    // Calculate reward/loss
    let rewardAmount = 0;
    if (wasSlashed) {
      // Lost stake
      rewardAmount = -(storedOutcome.rewardAmount || 0);
    } else {
      // Earned reward
      const ourSubmission = outcome.oracleSubmissions.find(
        (s) => s.oracle === this.oraclePubkey.toBase58()
      );
      if (ourSubmission) {
        // Would need to calculate actual reward from on-chain
        rewardAmount = 0.01; // Placeholder
      }
    }

    this.knowledgeBase.finalizeOutcome(escrowPda, consensusScore, wasSlashed, rewardAmount);

    log.info('Outcome processed', {
      escrow: escrowPda.slice(0, 8),
      ourScore,
      consensus: consensusScore,
      deviation,
      slashed: wasSlashed,
    });
  }

  /**
   * Get pending escrow count
   */
  getPendingCount(): number {
    return this.pendingEscrows.size;
  }

  /**
   * Get performance summary
   */
  getPerformanceSummary(): {
    totalVotes: number;
    finalized: number;
    accuracy: number;
    slashRate: number;
    avgDeviation: number;
  } {
    const stats = this.knowledgeBase.getStatistics();

    return {
      totalVotes: stats.totalOutcomes,
      finalized: stats.finalizedOutcomes,
      accuracy: stats.accuracy,
      slashRate: stats.slashRate,
      avgDeviation: stats.averageDeviation,
    };
  }
}
