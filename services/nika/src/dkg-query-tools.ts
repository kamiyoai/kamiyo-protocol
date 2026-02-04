/**
 * DKG Query Tools - fact-checking and agent lookup.
 */

import { createLogger, getMetrics, withRetry, CircuitBreaker, sanitizeForSPARQL } from './lib';
import { getDKGMemory, type DKGMemory } from './dkg-memory';

const log = createLogger('nika:dkg-query');
const metrics = getMetrics();

const queryCircuit = new CircuitBreaker('dkg-query', {
  failureThreshold: 3,
  resetTimeoutMs: 60000,
});

export interface KnowledgeQueryResult {
  asset: string;
  name: string;
  description: string;
  about: string;
}

export interface AgentReputationResult {
  globalId: string;
  tier: 'Unverified' | 'Bronze' | 'Silver' | 'Gold' | 'Platinum';
  overallScore: number;
  totalTasks: number;
  avgQuality: number;
  summary: string;
}

export interface ProviderResult {
  globalId: string;
  name: string;
  tier: 'Unverified' | 'Bronze' | 'Silver' | 'Gold' | 'Platinum';
  creditScore: number;
  taskCount: number;
  avgQuality: number;
  capabilities: string[];
}

type TopicFilter = 'crypto' | 'defi' | 'agents' | 'kamiyo' | 'general';

/**
 * Query the knowledge graph for facts. Use for fact-checking before posting.
 */
export async function queryKnowledge(
  query: string,
  options: { topic?: TopicFilter; limit?: number } = {}
): Promise<{ results: KnowledgeQueryResult[]; count: number; summary: string }> {
  const { topic, limit = 5 } = options;
  const startTime = Date.now();

  const sanitizedQuery = sanitizeForSPARQL(query.toLowerCase());
  const topicFilter = topic
    ? `FILTER(CONTAINS(LCASE(?about), "${sanitizeForSPARQL(topic)}"))`
    : '';

  const sparql = `
    PREFIX schema: <https://schema.org/>
    PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
    SELECT ?asset ?name ?description ?about WHERE {
      ?asset a schema:Article .
      OPTIONAL { ?asset schema:name ?name }
      OPTIONAL { ?asset schema:description ?description }
      OPTIONAL { ?asset schema:about ?about }
      FILTER(
        CONTAINS(LCASE(?name), "${sanitizedQuery}") ||
        CONTAINS(LCASE(?description), "${sanitizedQuery}")
      )
      ${topicFilter}
    }
    LIMIT ${limit}
  `;

  try {
    const dkgMemory = getDKGMemory();
    if (!dkgMemory) {
      return { results: [], count: 0, summary: 'DKG not initialized' };
    }

    const result = await queryCircuit.execute(() =>
      withRetry(
        async () => executeSparqlQuery(dkgMemory, sparql),
        { maxAttempts: 2, initialDelayMs: 1000 }
      )
    );

    metrics.incrementCounter('nika_dkg_queries');

    if (!result || result.length === 0) {
      return { results: [], count: 0, summary: `No knowledge found for "${query}"` };
    }

    const results = result.map((row: Record<string, unknown>) => ({
      asset: String(row.asset || ''),
      name: String(row.name || 'Untitled'),
      description: String(row.description || ''),
      about: String(row.about || ''),
    }));

    log.info('Knowledge query complete', {
      query,
      resultCount: results.length,
      durationMs: Date.now() - startTime,
    });

    return {
      results,
      count: results.length,
      summary: `Found ${results.length} result(s) for "${query}"`,
    };
  } catch (error) {
    metrics.incrementCounter('nika_dkg_query_errors');
    log.error('Knowledge query failed', { query, error: String(error) });
    throw error;
  }
}

/**
 * Look up agent reputation on the KAMIYO Paranet.
 */
export async function getAgentReputation(agentId: string): Promise<AgentReputationResult> {
  const sanitizedId = sanitizeForSPARQL(agentId);

  const sparql = `
    PREFIX schema: <https://schema.org/>
    PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
    SELECT ?taskCount ?avgQuality ?tier ?lastTask WHERE {
      ?agent a schema:Person ;
             schema:identifier "${sanitizedId}" .
      OPTIONAL { ?agent schema:aggregateRating/schema:reviewCount ?taskCount }
      OPTIONAL { ?agent schema:aggregateRating/schema:ratingValue ?avgQuality }
      OPTIONAL { ?agent schema:memberOf/schema:name ?tier }
      OPTIONAL { ?agent schema:dateModified ?lastTask }
    }
    LIMIT 1
  `;

  try {
    const dkgMemory = getDKGMemory();
    if (!dkgMemory) {
      return {
        globalId: agentId,
        tier: 'Unverified',
        overallScore: 0,
        totalTasks: 0,
        avgQuality: 0,
        summary: 'DKG not initialized',
      };
    }

    const result = await queryCircuit.execute(() =>
      withRetry(
        async () => executeSparqlQuery(dkgMemory, sparql),
        { maxAttempts: 2, initialDelayMs: 1000 }
      )
    );

    if (!result || result.length === 0) {
      return {
        globalId: agentId,
        tier: 'Unverified',
        overallScore: 0,
        totalTasks: 0,
        avgQuality: 0,
        summary: `Agent ${agentId.slice(0, 16)}... has no verified reputation`,
      };
    }

    const row = result[0] as Record<string, unknown>;
    const taskCount = Number(row.taskCount) || 0;
    const avgQuality = Number(row.avgQuality) || 0;
    const storedTier = String(row.tier || '');

    const tier = calculateTier(storedTier, avgQuality);

    return {
      globalId: agentId,
      tier,
      overallScore: avgQuality,
      totalTasks: taskCount,
      avgQuality,
      summary: `${tier} tier agent with ${avgQuality}% quality across ${taskCount} tasks`,
    };
  } catch (error) {
    log.error('Reputation lookup failed', { agentId, error: String(error) });
    throw error;
  }
}

/**
 * Find verified agent providers by capability and quality.
 */
export async function findProviders(options: {
  capability?: string;
  minQuality?: number;
  minTier?: 'Bronze' | 'Silver' | 'Gold' | 'Platinum';
  limit?: number;
}): Promise<{ providers: ProviderResult[]; count: number; summary: string }> {
  const { capability, minQuality = 75, minTier, limit = 5 } = options;

  const tierScores: Record<string, number> = {
    Bronze: 50,
    Silver: 70,
    Gold: 80,
    Platinum: 90,
  };
  const minScore = minTier ? Math.max(tierScores[minTier] || 0, minQuality) : minQuality;

  const capabilityFilter = capability
    ? `?agent schema:knowsAbout "${sanitizeForSPARQL(capability)}" .`
    : '';

  const sparql = `
    PREFIX schema: <https://schema.org/>
    PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
    SELECT ?agent ?name ?score ?taskCount ?capabilities WHERE {
      ?agent a schema:Person ;
             schema:aggregateRating/schema:ratingValue ?score .
      FILTER(?score >= ${minScore})
      ${capabilityFilter}
      OPTIONAL { ?agent schema:name ?name }
      OPTIONAL { ?agent schema:aggregateRating/schema:reviewCount ?taskCount }
      OPTIONAL { ?agent schema:knowsAbout ?capabilities }
    }
    ORDER BY DESC(?score)
    LIMIT ${limit}
  `;

  try {
    const dkgMemory = getDKGMemory();
    if (!dkgMemory) {
      return { providers: [], count: 0, summary: 'DKG not initialized' };
    }

    const result = await queryCircuit.execute(() =>
      withRetry(
        async () => executeSparqlQuery(dkgMemory, sparql),
        { maxAttempts: 2, initialDelayMs: 1000 }
      )
    );

    if (!result || result.length === 0) {
      return {
        providers: [],
        count: 0,
        summary: capability
          ? `No providers found with "${capability}" capability and ${minScore}+ quality`
          : `No providers found with ${minScore}+ quality`,
      };
    }

    const providers = result.map((row: Record<string, unknown>) => {
      const score = Number(row.score) || 0;
      return {
        globalId: String(row.agent || ''),
        name: String(row.name || 'Unknown'),
        tier: calculateTier('', score),
        creditScore: score,
        taskCount: Number(row.taskCount) || 0,
        avgQuality: score,
        capabilities: row.capabilities ? [String(row.capabilities)] : [],
      };
    });

    return {
      providers,
      count: providers.length,
      summary: `Found ${providers.length} provider(s) with ${minScore}+ quality${
        capability ? ` and "${capability}" capability` : ''
      }`,
    };
  } catch (error) {
    log.error('Provider search failed', { error: String(error) });
    throw error;
  }
}

/**
 * Get circuit breaker status.
 */
export function getQueryCircuitStatus(): string {
  return queryCircuit.getState();
}

function calculateTier(
  storedTier: string,
  avgQuality: number
): 'Unverified' | 'Bronze' | 'Silver' | 'Gold' | 'Platinum' {
  if (storedTier && storedTier !== 'Unverified') {
    return storedTier as 'Bronze' | 'Silver' | 'Gold' | 'Platinum';
  }
  if (avgQuality >= 90) return 'Platinum';
  if (avgQuality >= 80) return 'Gold';
  if (avgQuality >= 70) return 'Silver';
  if (avgQuality >= 50) return 'Bronze';
  return 'Unverified';
}

async function executeSparqlQuery(
  dkgMemory: DKGMemory,
  sparql: string
): Promise<Record<string, unknown>[]> {
  return dkgMemory.query(sparql);
}
