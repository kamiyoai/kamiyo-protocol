/**
 * Credit Score Calculator
 * Computes verifiable credit scores from DKG paranet data
 */

import type {
  DKGClient,
  CreditScore,
  CreditScoreComponents,
  TaskBreakdown,
  TaskType,
  QueryResult,
} from '../types.js';
import { SCORE_WEIGHTS, scoreToTier, KamiyoTier } from '../types.js';
import * as queries from '../queries/index.js';

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

export class CreditScoreCalculator {
  private dkg: DKGClient;
  private cache: Map<string, { score: CreditScore; expires: number }> = new Map();
  private cacheTTL: number;

  constructor(dkg: DKGClient, cacheTTLMs = 5 * 60 * 1000) {
    this.dkg = dkg;
    this.cacheTTL = cacheTTLMs;
  }

  async calculateScore(globalId: string, useCache = true): Promise<QueryResult<CreditScore>> {
    // Check cache
    if (useCache) {
      const cached = this.cache.get(globalId);
      if (cached && cached.expires > Date.now()) {
        return {
          success: true,
          data: cached.score,
          cached: true,
          timestamp: new Date().toISOString(),
        };
      }
    }

    try {
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

      // Cache the result
      this.cache.set(globalId, {
        score,
        expires: Date.now() + this.cacheTTL,
      });

      return {
        success: true,
        data: score,
        cached: false,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
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
    // Task Quality: direct average quality score
    const taskQuality = task.avgQuality;

    // Reliability: based on consistency (low variance) and response time
    // For now, use a simplified model
    const reliabilityFromTasks = task.taskCount > 0 ? Math.min(100, task.taskCount * 2) : 0;
    const reliabilityFromTime = task.avgResponseTime > 0
      ? Math.max(0, 100 - (task.avgResponseTime / 3600000) * 10) // Penalize slow response
      : 50;
    const reliability = (reliabilityFromTasks + reliabilityFromTime) / 2;

    // Dispute Record: win rate weighted by dispute frequency
    let disputeRecord = 100; // Start at 100 if no disputes
    if (task.disputeCount > 0) {
      const winRate = task.disputesWon / task.disputeCount;
      const disputeFrequency = task.taskCount > 0
        ? task.disputeCount / task.taskCount
        : 1;
      // Penalize high dispute frequency, reward high win rate
      disputeRecord = winRate * 100 * (1 - disputeFrequency * 0.5);
    }

    // Peer Trust: average incoming trust level
    const peerTrust = trust.trustorCount > 0 ? trust.avgTrust : 50;

    // Tenure: days since first task, capped at 365 for max score
    const tenureDays = this.calculateTenure(task.firstTask);
    const tenure = Math.min(100, (tenureDays / 365) * 100);

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

  clearCache(globalId?: string): void {
    if (globalId) {
      this.cache.delete(globalId);
    } else {
      this.cache.clear();
    }
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
