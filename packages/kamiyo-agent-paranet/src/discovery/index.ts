// Provider discovery and evaluation using paranet data

import type {
  DKGClient,
  ProviderSearchCriteria,
  ProviderSearchResult,
  CreditScore,
  TaskType,
  QueryResult,
  KamiyoTier,
} from '../types';
import { scoreToTier } from '../types';
import * as queries from '../queries/index';
import { CreditScoreCalculator, getQuickScore } from '../scoring/index';

export class ProviderDiscovery {
  private dkg: DKGClient;
  private scoreCalculator: CreditScoreCalculator;

  constructor(dkg: DKGClient) {
    this.dkg = dkg;
    this.scoreCalculator = new CreditScoreCalculator(dkg);
  }

  /**
   * Find providers matching search criteria
   */
  async findProviders(criteria: ProviderSearchCriteria): Promise<QueryResult<ProviderSearchResult[]>> {
    try {
      let results: ProviderSearchResult[] = [];

      if (criteria.taskType) {
        // Search by task type
        results = await this.searchByTaskType(
          criteria.taskType,
          criteria.minQuality ?? 80,
          criteria.minTasks ?? 5,
          criteria.limit ?? 20
        );
      } else if (criteria.trustedBy) {
        // Search by trust relationship
        results = await this.searchByTrust(
          criteria.trustedBy,
          criteria.limit ?? 20
        );
      } else if (criteria.capabilities?.length) {
        // Search by capabilities
        results = await this.searchByCapabilities(
          criteria.capabilities,
          criteria.limit ?? 20
        );
      } else {
        // General search - top providers
        results = await this.searchTopProviders(
          criteria.minQuality ?? 80,
          criteria.minTasks ?? 10,
          criteria.limit ?? 20
        );
      }

      // Filter by tier if specified
      if (criteria.minTier !== undefined) {
        results = results.filter(r => r.tier >= criteria.minTier!);
      }

      // Filter by response time if specified
      if (criteria.maxResponseTimeMs !== undefined) {
        results = results.filter(r => r.avgResponseTimeMs <= criteria.maxResponseTimeMs!);
      }

      return {
        success: true,
        data: results,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Search failed',
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Get detailed credit score for a specific provider
   */
  async getProviderScore(globalId: string): Promise<QueryResult<CreditScore>> {
    return this.scoreCalculator.calculateScore(globalId);
  }

  /**
   * Quick check if a provider meets minimum requirements
   */
  async meetsRequirements(
    globalId: string,
    requirements: {
      minScore?: number;
      minTier?: KamiyoTier;
      minTasks?: number;
      taskType?: TaskType;
    }
  ): Promise<{ meets: boolean; reason?: string }> {
    const quick = await getQuickScore(this.dkg, globalId);

    if (!quick) {
      return { meets: false, reason: 'Agent not found in paranet' };
    }

    if (requirements.minScore && quick.score < requirements.minScore) {
      return { meets: false, reason: `Score ${quick.score} below minimum ${requirements.minScore}` };
    }

    if (requirements.minTier && quick.tier < requirements.minTier) {
      return { meets: false, reason: `Tier ${quick.tier} below minimum ${requirements.minTier}` };
    }

    if (requirements.minTasks && quick.taskCount < requirements.minTasks) {
      return { meets: false, reason: `Task count ${quick.taskCount} below minimum ${requirements.minTasks}` };
    }

    // If taskType specified, check capability
    if (requirements.taskType) {
      const capabilities = await this.getAgentCapabilities(globalId);
      if (!capabilities.includes(requirements.taskType)) {
        return { meets: false, reason: `No attestations for capability: ${requirements.taskType}` };
      }
    }

    return { meets: true };
  }

  /**
   * Get all capabilities attested for an agent
   */
  async getAgentCapabilities(globalId: string): Promise<string[]> {
    try {
      const query = queries.queryCapabilitiesByAgent(globalId);
      const { data: results } = await this.dkg.graph.query(query, 'SELECT') as {
        data: Array<{ capability?: { value?: string } }>;
      };
      return results
        .map(r => r.capability?.value)
        .filter((c): c is string => !!c);
    } catch {
      return [];
    }
  }

  /**
   * Check direct trust between two agents
   */
  async checkTrust(
    trustorGlobalId: string,
    trusteeGlobalId: string
  ): Promise<{ trusted: boolean; level?: number; type?: string }> {
    try {
      const query = queries.queryDirectTrust(trustorGlobalId, trusteeGlobalId);
      const { data: results } = await this.dkg.graph.query(query, 'SELECT') as {
        data: Array<{
          trustLevel?: { value?: number };
          trustType?: { value?: string };
        }>;
      };

      if (!results.length) {
        return { trusted: false };
      }

      const r = results[0];
      return {
        trusted: true,
        level: Number(r.trustLevel?.value || 0),
        type: r.trustType?.value,
      };
    } catch {
      return { trusted: false };
    }
  }

  private async searchByTaskType(
    taskType: TaskType,
    minQuality: number,
    minTasks: number,
    limit: number
  ): Promise<ProviderSearchResult[]> {
    const query = queries.queryProvidersByTaskType(taskType, { minQuality, minTasks, limit });
    const { data: results } = await this.dkg.graph.query(query, 'SELECT') as {
      data: Array<Record<string, { value?: unknown }>>;
    };

    return results.map(r => {
      const avgQuality = Number(r.avgQuality?.value || 0);
      return {
        globalId: String(r.provider?.value || '').replace('urn:erc8004:', ''),
        creditScore: Math.round(avgQuality),
        tier: scoreToTier(avgQuality),
        taskCount: Number(r.taskCount?.value || 0),
        avgQuality,
        avgResponseTimeMs: Number(r.avgResponseTime?.value || 0),
        capabilities: [taskType],
      };
    });
  }

  private async searchByTrust(trustorGlobalId: string, limit: number): Promise<ProviderSearchResult[]> {
    const query = queries.queryProvidersTrustedBy(trustorGlobalId, { minLevel: 70, limit });
    const { data: results } = await this.dkg.graph.query(query, 'SELECT') as {
      data: Array<Record<string, { value?: unknown }>>;
    };

    return results.map(r => {
      const avgQuality = Number(r.avgQuality?.value || 0);
      return {
        globalId: String(r.provider?.value || '').replace('urn:erc8004:', ''),
        creditScore: Math.round(avgQuality),
        tier: scoreToTier(avgQuality),
        taskCount: Number(r.taskCount?.value || 0),
        avgQuality,
        avgResponseTimeMs: 0,
        capabilities: [],
        trustLevel: Number(r.trustLevel?.value || 0),
      };
    });
  }

  private async searchByCapabilities(capabilities: string[], limit: number): Promise<ProviderSearchResult[]> {
    // Search for agents with any of the capabilities
    const allResults: Map<string, ProviderSearchResult> = new Map();

    for (const cap of capabilities) {
      const query = queries.queryAgentsByCapability(cap, { minConfidence: 70, limit });
      const { data: results } = await this.dkg.graph.query(query, 'SELECT') as {
        data: Array<Record<string, { value?: unknown }>>;
      };

      for (const r of results) {
        const globalId = String(r.agent?.value || '').replace('urn:erc8004:', '');
        const existing = allResults.get(globalId);
        const confidence = Number(r.avgConfidence?.value || 0);

        if (existing) {
          existing.capabilities.push(cap);
        } else {
          allResults.set(globalId, {
            globalId,
            creditScore: Math.round(confidence),
            tier: scoreToTier(confidence),
            taskCount: 0,
            avgQuality: confidence,
            avgResponseTimeMs: 0,
            capabilities: [cap],
          });
        }
      }
    }

    return Array.from(allResults.values())
      .sort((a, b) => b.capabilities.length - a.capabilities.length || b.creditScore - a.creditScore)
      .slice(0, limit);
  }

  private async searchTopProviders(
    minQuality: number,
    minTasks: number,
    limit: number
  ): Promise<ProviderSearchResult[]> {
    const query = queries.queryTopProviders({ minQuality, minTasks, limit });
    const { data: results } = await this.dkg.graph.query(query, 'SELECT') as {
      data: Array<Record<string, { value?: unknown }>>;
    };

    return results.map(r => {
      const avgQuality = Number(r.avgQuality?.value || 0);
      return {
        globalId: String(r.provider?.value || '').replace('urn:erc8004:', ''),
        creditScore: Math.round(avgQuality),
        tier: scoreToTier(avgQuality),
        taskCount: Number(r.taskCount?.value || 0),
        avgQuality,
        avgResponseTimeMs: Number(r.avgResponseTime?.value || 0),
        capabilities: [],
      };
    });
  }
}

/**
 * Quick provider check - single function for simple use cases
 */
export async function findBestProvider(
  dkg: DKGClient,
  taskType: TaskType,
  minQuality = 80
): Promise<ProviderSearchResult | null> {
  const discovery = new ProviderDiscovery(dkg);
  const result = await discovery.findProviders({
    taskType,
    minQuality,
    minTasks: 3,
    limit: 1,
  });

  if (!result.success || !result.data?.length) {
    return null;
  }

  return result.data[0];
}
