import type { IAgentRuntime, EvaluationContext } from '../types';
import type { GatheredEvidence } from '../deliberation/types';
import { EvidenceHunter, type EvidenceHuntResult } from '../evidence/hunter';
import { RiskScorer, type EscrowRiskScore, type EscrowSnapshot } from './riskScorer';
import { createLogger } from '../lib/logger';

const log = createLogger('pre-gatherer');

export interface PreGatheredEvidence {
  escrowPda: string;
  evidence: GatheredEvidence;
  riskScore: EscrowRiskScore;
  gatheredAt: number;
  expiresAt: number;
}

export interface PreGathererConfig {
  riskThreshold: number;
  maxConcurrent: number;
  cacheExpiryMs: number;
  pollIntervalMs: number;
}

const DEFAULT_CONFIG: PreGathererConfig = {
  riskThreshold: 60,
  maxConcurrent: 3,
  cacheExpiryMs: 300000, // 5 minutes
  pollIntervalMs: 60000, // 1 minute
};

export class PreGatherer {
  private runtime: IAgentRuntime;
  private riskScorer: RiskScorer;
  private evidenceHunter: EvidenceHunter;
  private config: PreGathererConfig;
  private cache: Map<string, PreGatheredEvidence> = new Map();
  private inProgress: Set<string> = new Set();
  private timer: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;

  constructor(runtime: IAgentRuntime, config: Partial<PreGathererConfig> = {}) {
    this.runtime = runtime;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.riskScorer = new RiskScorer(runtime);
    this.evidenceHunter = new EvidenceHunter(runtime, {
      maxTimeMs: 20000,
      enableOffChain: true,
      enablePatternMatching: true,
    });
  }

  /**
   * Start automatic pre-gathering for high-risk escrows
   */
  start(escrowProvider: () => Promise<EscrowSnapshot[]>): void {
    if (this.isRunning) return;

    this.isRunning = true;
    log.info('Pre-gatherer started', {
      threshold: this.config.riskThreshold,
      interval: this.config.pollIntervalMs,
    });

    const poll = async () => {
      if (!this.isRunning) return;

      try {
        const escrows = await escrowProvider();
        await this.processEscrows(escrows);
      } catch (err) {
        log.error('Poll error', err instanceof Error ? err : new Error(String(err)));
      }
    };

    // Initial poll after short delay
    setTimeout(poll, 5000);

    // Regular polling
    this.timer = setInterval(poll, this.config.pollIntervalMs);
  }

  /**
   * Stop pre-gathering
   */
  stop(): void {
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    log.info('Pre-gatherer stopped');
  }

  /**
   * Get pre-gathered evidence for an escrow (if available)
   */
  getEvidence(escrowPda: string): PreGatheredEvidence | null {
    const cached = this.cache.get(escrowPda);
    if (!cached) return null;

    // Check expiry
    if (Date.now() > cached.expiresAt) {
      this.cache.delete(escrowPda);
      return null;
    }

    return cached;
  }

  /**
   * Check if evidence is being gathered for an escrow
   */
  isGathering(escrowPda: string): boolean {
    return this.inProgress.has(escrowPda);
  }

  /**
   * Manually trigger pre-gathering for specific escrows
   */
  async preGatherForEscrows(escrows: EscrowSnapshot[]): Promise<PreGatheredEvidence[]> {
    const results: PreGatheredEvidence[] = [];

    for (const escrow of escrows) {
      const result = await this.gatherForEscrow(escrow);
      if (result) {
        results.push(result);
      }
    }

    return results;
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    cached: number;
    inProgress: number;
    cacheHitRate: number;
  } {
    return {
      cached: this.cache.size,
      inProgress: this.inProgress.size,
      cacheHitRate: 0, // Would track hits/misses in production
    };
  }

  private async processEscrows(escrows: EscrowSnapshot[]): Promise<void> {
    // Score all escrows
    const scores = await this.riskScorer.scoreMultiple(escrows);

    // Filter to high-risk that need pre-gathering
    const highRisk = scores.filter(
      (s) =>
        s.riskScore >= this.config.riskThreshold &&
        s.recommendation !== 'ignore' &&
        !this.cache.has(s.escrowPda) &&
        !this.inProgress.has(s.escrowPda)
    );

    if (highRisk.length === 0) return;

    log.info('High-risk escrows detected', {
      count: highRisk.length,
      scores: highRisk.map((s) => ({ pda: s.escrowPda.slice(0, 8), score: s.riskScore })),
    });

    // Process up to maxConcurrent at a time
    const toProcess = highRisk.slice(0, this.config.maxConcurrent);
    const escrowMap = new Map(escrows.map((e) => [e.pda, e]));

    await Promise.all(
      toProcess.map(async (score) => {
        const escrow = escrowMap.get(score.escrowPda);
        if (escrow) {
          await this.gatherForEscrow(escrow, score);
        }
      })
    );
  }

  private async gatherForEscrow(
    escrow: EscrowSnapshot,
    existingScore?: EscrowRiskScore
  ): Promise<PreGatheredEvidence | null> {
    const escrowShort = escrow.pda.slice(0, 8);

    // Skip if already in progress
    if (this.inProgress.has(escrow.pda)) {
      return null;
    }

    // Skip if already cached and not expired
    const cached = this.cache.get(escrow.pda);
    if (cached && Date.now() < cached.expiresAt) {
      return cached;
    }

    this.inProgress.add(escrow.pda);
    log.debug('Pre-gathering evidence', { escrow: escrowShort });

    try {
      // Get or compute risk score
      const riskScore = existingScore || await this.riskScorer.scoreEscrow(escrow);

      // Build minimal evaluation context for evidence hunter
      const context = this.buildContext(escrow);

      // Gather evidence
      const result = await this.evidenceHunter.hunt(context);

      const preGathered: PreGatheredEvidence = {
        escrowPda: escrow.pda,
        evidence: result.evidence,
        riskScore,
        gatheredAt: Date.now(),
        expiresAt: Date.now() + this.config.cacheExpiryMs,
      };

      // Cache result
      this.cache.set(escrow.pda, preGathered);

      log.info('Evidence pre-gathered', {
        escrow: escrowShort,
        quality: result.quality,
        riskScore: riskScore.riskScore,
      });

      return preGathered;
    } catch (err) {
      log.error('Pre-gather failed', err instanceof Error ? err : new Error(String(err)), {
        escrow: escrowShort,
      });
      return null;
    } finally {
      this.inProgress.delete(escrow.pda);
    }
  }

  private buildContext(escrow: EscrowSnapshot): EvaluationContext {
    return {
      escrow: {
        pda: escrow.pda,
        amount: escrow.amount / 1e9,
        status: 'active',
        createdAt: escrow.createdAt,
        expiresAt: escrow.expiresAt,
        transactionId: `pre-gather-${escrow.pda.slice(0, 8)}`,
      },
      agent: {
        pubkey: escrow.agent,
        reputation: 500,
        totalEscrows: 0,
        disputeRate: 0,
      },
      provider: {
        pubkey: escrow.provider,
        reputation: 500,
        totalEscrows: 0,
        disputeRate: 0,
        averageQualityScore: 50,
      },
      service: {
        type: 'unknown',
        description: 'Pre-gathering - service details unknown',
        slaTerms: [],
      },
      evidence: {
        agentClaim: 'Pre-gathering - no claim yet',
      },
    };
  }

  /**
   * Clean up expired cache entries
   */
  cleanupCache(): number {
    const now = Date.now();
    let removed = 0;

    for (const [pda, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(pda);
        removed++;
      }
    }

    if (removed > 0) {
      log.debug('Cache cleanup', { removed, remaining: this.cache.size });
    }

    return removed;
  }
}

/**
 * Create a pre-gatherer with default runtime settings
 */
export function createPreGatherer(
  runtime: IAgentRuntime,
  config?: Partial<PreGathererConfig>
): PreGatherer {
  const riskThreshold = parseInt(runtime.getSetting('PRE_GATHER_RISK_THRESHOLD') || '60');

  return new PreGatherer(runtime, {
    riskThreshold,
    ...config,
  });
}
