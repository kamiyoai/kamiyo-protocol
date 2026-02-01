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

const MS_PER_HOUR = 3600000;
const MS_PER_DAY = 86400000;
const MAX_TENURE_DAYS = 365;
const TASK_RELIABILITY_MULT = 2;
const TASK_RELIABILITY_CAP = 100;
const RESPONSE_PENALTY = 10;
const DEFAULT_SCORE = 50;

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

    if (typeof globalId !== 'string' || !/^eip155:\d+:0x[a-fA-F0-9]{40}:\d+$/.test(globalId)) {
      log.warn('Invalid global ID format');
      return {
        success: false,
        error: 'Invalid global ID format',
        timestamp: new Date().toISOString(),
      };
    }

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
      log.debug('Fetching from DKG');
      const [taskData, trustData, breakdownData] = await Promise.all([
        this.queryTaskSummary(globalId),
        this.queryTrustSummary(globalId),
        this.queryTaskBreakdown(globalId),
      ]);

      const components = this.calculateComponents(taskData, trustData);
      const overallScore = this.calculateOverallScore(components);
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
    const response = await this.dkg.graph.query(query, 'SELECT') as {
      data?: Array<Record<string, { value?: unknown }>> | null;
    };

    const results = response?.data;
    if (!results || !Array.isArray(results) || results.length === 0) {
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
    const response = await this.dkg.graph.query(query, 'SELECT') as {
      data?: Array<Record<string, { value?: unknown }>> | null;
    };

    const results = response?.data;
    if (!results || !Array.isArray(results) || results.length === 0) {
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
    const response = await this.dkg.graph.query(query, 'SELECT') as {
      data?: Array<Record<string, { value?: unknown }>> | null;
    };

    const results = response?.data;
    if (!results || !Array.isArray(results)) {
      return [];
    }

    return results.map(r => ({
      taskType: String(r.taskType?.value || 'custom') as TaskType,
      count: Number(r.count?.value || 0),
      avgQuality: Number(r.avgQuality?.value || 0),
      avgResponseTimeMs: Number(r.avgResponseTime?.value || 0),
      disputeRate: 0,
      totalPaymentUSD: Number(r.totalPayment?.value || 0),
    }));
  }

  private calculateComponents(task: TaskSummary, trust: TrustSummary): CreditScoreComponents {
    const clamp = (v: number) => Math.max(0, Math.min(100, Number.isFinite(v) ? v : 0));

    const taskQuality = clamp(task.avgQuality);

    const reliabilityFromTasks = task.taskCount > 0
      ? Math.min(TASK_RELIABILITY_CAP, task.taskCount * TASK_RELIABILITY_MULT)
      : 0;
    const reliabilityFromTime = task.avgResponseTime > 0
      ? Math.max(0, 100 - (task.avgResponseTime / MS_PER_HOUR) * RESPONSE_PENALTY)
      : DEFAULT_SCORE;
    const reliability = clamp((reliabilityFromTasks + reliabilityFromTime) / 2);

    let disputeRecord = 100;
    if (task.disputeCount > 0 && task.taskCount > 0) {
      const winRate = task.disputesWon / task.disputeCount;
      const freq = task.disputeCount / task.taskCount;
      disputeRecord = clamp(winRate * 100 * (1 - freq * 0.5));
    }

    const peerTrust = clamp(trust.trustorCount > 0 ? trust.avgTrust : DEFAULT_SCORE);

    const tenureDays = this.calculateTenure(task.firstTask);
    const tenure = clamp((tenureDays / MAX_TENURE_DAYS) * 100);

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
    return Math.max(0, Math.floor(diffMs / MS_PER_DAY));
  }

  async clearCache(globalId?: string): Promise<void> {
    if (globalId) {
      await this.cache.delete(globalId);
    } else {
      await this.cache.clear();
    }
  }

  async invalidateAgent(globalId: string): Promise<number> {
    return this.invalidator.invalidateByGlobalId(globalId);
  }

  getCacheStats(): CacheStats {
    return this.cache.getStats();
  }

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
    const response = await dkg.graph.query(query, 'SELECT') as {
      data?: Array<Record<string, { value?: unknown }>> | null;
    };

    // Defensive: handle undefined/null data from DKG
    const results = response?.data;
    if (!results || !Array.isArray(results) || results.length === 0) {
      return null;
    }

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
