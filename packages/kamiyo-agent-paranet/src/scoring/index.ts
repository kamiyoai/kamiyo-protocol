// Credit score calculator using DKG paranet data

import type {
  DKGClient,
  CreditScore,
  CreditScoreComponents,
  TaskBreakdown,
  TaskType,
  QueryResult,
} from '../types';
import { SCORE_WEIGHTS, scoreToTier, KamiyoTier } from '../types';
import * as queries from '../queries/index';
import { getLogger, createTimer } from '../logger';
import type { Logger } from '../logger';
import { LRUCache, CacheInvalidator, createCacheWithInvalidation } from '../cache';
import type { CacheStats } from '../cache';

interface TaskSummary {
  taskCount: number;
  avgQuality: number;
  avgResponseTime: number;
  firstTask: string | null;
  lastTask: string | null;
  disputeCount: number;
  disputesWon: number;
}

interface TrustSummary {
  avgTrust: number;
  trustorCount: number;
}

interface TaskTypeBreakdown {
  taskType: string;
  count: number;
  avgQuality: number;
  avgResponseTime: number;
  totalPayment: number;
}

export interface CreditScoreCalculatorConfig {
  cacheTTLMs?: number;
  maxCacheSize?: number;
}

export class CreditScoreCalculator {
  private dkg: DKGClient;
  private cache: LRUCache<CreditScore>;
  private invalidator: CacheInvalidator<CreditScore>;
  private cacheTTL: number;
  private logger: Logger;

  constructor(dkg: DKGClient, config: CreditScoreCalculatorConfig | number = {}, logger?: Logger) {
    // Support legacy constructor signature (cacheTTLMs as number)
    const normalizedConfig = typeof config === 'number' ? { cacheTTLMs: config } : config;
    const { cacheTTLMs = 5 * 60 * 1000, maxCacheSize = 1000 } = normalizedConfig;

    this.dkg = dkg;
    this.cacheTTL = cacheTTLMs;
    this.logger = logger || getLogger();

    const { cache, invalidator } = createCacheWithInvalidation<CreditScore>(
      { maxSize: maxCacheSize, defaultTTLMs: cacheTTLMs },
      this.logger
    );
    this.cache = cache;
    this.invalidator = invalidator;
  }

  async calculateScore(globalId: string, useCache = true): Promise<QueryResult<CreditScore>> {
    const timer = createTimer();
    const log = this.logger.child({ operation: 'calculateScore', globalId });

    // Validate input
    if (typeof globalId !== 'string' || !/^eip155:\d+:0x[a-fA-F0-9]{40}:\d+$/.test(globalId)) {
      log.warn('Invalid global ID format');
      return {
        success: false,
        error: 'Invalid global ID format',
        timestamp: new Date().toISOString(),
      };
    }

    // Check cache (use sync method for backward compatibility)
    if (useCache) {
      const cached = this.cache.getSync(globalId);
      if (cached) {
        log.debug('Cache hit', { duration: timer() });
        return {
          success: true,
          data: cached,
          cached: true,
          timestamp: new Date().toISOString(),
        };
      }
    }

    try {
      log.debug('Fetching score data from DKG');
      // Fetch all required data in parallel
      const [taskData, trustData, breakdownData] = await Promise.all([
        this.queryTaskSummary(globalId),
        this.queryTrustSummary(globalId),
        this.queryTaskBreakdown(globalId),
      ]);

      // Calculate components
      const components = this.calculateComponents(taskData, trustData);

      // Calculate overall score
      const overallScore = this.calculateOverallScore(components);

      // Build credit score
      const score: CreditScore = {
        globalId,
        overallScore: Math.round(overallScore),
        tier: scoreToTier(overallScore),
        components,
        taskBreakdown: breakdownData,
        totalTasks: taskData.taskCount,
        totalDisputes: taskData.disputeCount,
        disputeWinRate: taskData.disputeCount > 0
          ? (taskData.disputesWon / taskData.disputeCount) * 100
          : 100,
        avgQuality: taskData.avgQuality,
        avgResponseTimeMs: taskData.avgResponseTime,
        tenureDays: this.calculateTenure(taskData.firstTask),
        firstTaskDate: taskData.firstTask || undefined,
        lastTaskDate: taskData.lastTask || undefined,
        lastUpdated: new Date().toISOString(),
        evidenceUALs: [],
      };

      // Cache the result with tag for invalidation (use sync method)
      this.cache.setSync(globalId, score, this.cacheTTL);
      this.invalidator.register(globalId, [`globalId:${globalId}`]);

      log.info('Score calculated', { duration: timer(), score: score.overallScore, tier: score.tier });

      return {
        success: true,
        data: score,
        cached: false,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      log.error('Score calculation failed', { duration: timer(), error: error instanceof Error ? error.message : String(error) });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Score calculation failed',
        timestamp: new Date().toISOString(),
      };
    }
  }

  private async queryTaskSummary(globalId: string): Promise<TaskSummary> {
    const query = queries.queryCreditScoreData(globalId);
    const { data: results } = await this.dkg.graph.query(query, 'SELECT') as {
      data: Array<Record<string, { value?: unknown }>>;
    };

    if (!results.length) {
      return {
        taskCount: 0,
        avgQuality: 0,
        avgResponseTime: 0,
        firstTask: null,
        lastTask: null,
        disputeCount: 0,
        disputesWon: 0,
      };
    }

    const r = results[0];
    return {
      taskCount: Number(r.taskCount?.value || 0),
      avgQuality: Number(r.avgQuality?.value || 0),
      avgResponseTime: Number(r.avgResponseTime?.value || 0),
      firstTask: r.firstTask?.value ? String(r.firstTask.value) : null,
      lastTask: r.lastTask?.value ? String(r.lastTask.value) : null,
      disputeCount: Number(r.disputeCount?.value || 0),
      disputesWon: Number(r.disputesWon?.value || 0),
    };
  }

  private async queryTrustSummary(globalId: string): Promise<TrustSummary> {
    const query = queries.queryTrustScore(globalId);
    const { data: results } = await this.dkg.graph.query(query, 'SELECT') as {
      data: Array<Record<string, { value?: unknown }>>;
    };

    if (!results.length) {
      return { avgTrust: 0, trustorCount: 0 };
    }

    const r = results[0];
    return {
      avgTrust: Number(r.avgTrust?.value || 0),
      trustorCount: Number(r.trustorCount?.value || 0),
    };
  }

  private async queryTaskBreakdown(globalId: string): Promise<TaskBreakdown[]> {
    const query = queries.queryTaskBreakdownByType(globalId);
    const { data: results } = await this.dkg.graph.query(query, 'SELECT') as {
      data: Array<Record<string, { value?: unknown }>>;
    };

    return results.map(r => ({
      taskType: String(r.taskType?.value || 'custom') as TaskType,
      count: Number(r.count?.value || 0),
      avgQuality: Number(r.avgQuality?.value || 0),
      avgResponseTimeMs: Number(r.avgResponseTime?.value || 0),
      disputeRate: 0, // TODO: add dispute rate per type
      totalPaymentUSD: Number(r.totalPayment?.value || 0),
    }));
  }

  private calculateComponents(task: TaskSummary, trust: TrustSummary): CreditScoreComponents {
    // Clamp helper to ensure all values are bounded 0-100
    const clamp = (v: number) => Math.max(0, Math.min(100, Number.isFinite(v) ? v : 0));

    // Task Quality: direct average quality score
    const taskQuality = clamp(task.avgQuality);

    // Reliability: based on consistency (low variance) and response time
    const reliabilityFromTasks = task.taskCount > 0 ? Math.min(100, task.taskCount * 2) : 0;
    const reliabilityFromTime = task.avgResponseTime > 0
      ? Math.max(0, 100 - (task.avgResponseTime / 3600000) * 10)
      : 50;
    const reliability = clamp((reliabilityFromTasks + reliabilityFromTime) / 2);

    // Dispute Record: win rate weighted by dispute frequency
    let disputeRecord = 100;
    if (task.disputeCount > 0 && task.taskCount > 0) {
      const winRate = task.disputesWon / task.disputeCount;
      const disputeFrequency = task.disputeCount / task.taskCount;
      disputeRecord = clamp(winRate * 100 * (1 - disputeFrequency * 0.5));
    }

    // Peer Trust: average incoming trust level
    const peerTrust = clamp(trust.trustorCount > 0 ? trust.avgTrust : 50);

    // Tenure: days since first task, capped at 365 for max score
    const tenureDays = this.calculateTenure(task.firstTask);
    const tenure = clamp((tenureDays / 365) * 100);

    return {
      taskQuality,
      reliability,
      disputeRecord,
      peerTrust,
      tenure,
    };
  }

  private calculateOverallScore(components: CreditScoreComponents): number {
    return (
      components.taskQuality * SCORE_WEIGHTS.taskQuality +
      components.reliability * SCORE_WEIGHTS.reliability +
      components.disputeRecord * SCORE_WEIGHTS.disputeRecord +
      components.peerTrust * SCORE_WEIGHTS.peerTrust +
      components.tenure * SCORE_WEIGHTS.tenure
    );
  }

  private calculateTenure(firstTaskDate: string | null): number {
    if (!firstTaskDate) return 0;
    const first = new Date(firstTaskDate);
    const now = new Date();
    const diffMs = now.getTime() - first.getTime();
    return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  }

  async clearCache(globalId?: string): Promise<void> {
    if (globalId) {
      await this.cache.delete(globalId);
    } else {
      await this.cache.clear();
    }
  }

  // Invalidate cache for a specific agent (call after publishing)
  async invalidateAgent(globalId: string): Promise<number> {
    return this.invalidator.invalidateByGlobalId(globalId);
  }

  // Get cache statistics
  getCacheStats(): CacheStats {
    return this.cache.getStats();
  }

  // Prune expired entries
  async pruneCache(): Promise<number> {
    return this.cache.prune();
  }
}

// Quick score lookup without full calculation
export async function getQuickScore(
  dkg: DKGClient,
  globalId: string
): Promise<{ score: number; tier: KamiyoTier; taskCount: number } | null> {
  try {
    const query = queries.queryCreditScoreData(globalId);
    const { data: results } = await dkg.graph.query(query, 'SELECT') as {
      data: Array<Record<string, { value?: unknown }>>;
    };

    if (!results.length) return null;

    const r = results[0];
    const taskCount = Number(r.taskCount?.value || 0);
    const avgQuality = Number(r.avgQuality?.value || 0);

    // Quick score is just task quality for simplicity
    const score = Math.round(avgQuality);

    return {
      score,
      tier: scoreToTier(score),
      taskCount,
    };
  } catch {
    return null;
  }
}

// Compare two agents
export async function compareAgents(
  dkg: DKGClient,
  globalId1: string,
  globalId2: string
): Promise<{ agent1: CreditScore; agent2: CreditScore; winner: string } | null> {
  const calculator = new CreditScoreCalculator(dkg);

  const [result1, result2] = await Promise.all([
    calculator.calculateScore(globalId1),
    calculator.calculateScore(globalId2),
  ]);

  if (!result1.success || !result2.success || !result1.data || !result2.data) {
    return null;
  }

  return {
    agent1: result1.data,
    agent2: result2.data,
    winner: result1.data.overallScore >= result2.data.overallScore ? globalId1 : globalId2,
  };
}
