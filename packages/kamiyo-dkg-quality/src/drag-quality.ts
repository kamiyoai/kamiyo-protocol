import type {
  UAL,
  QualityQuery,
  QualityQueryResult,
  QualityMetadata,
} from './types.js';

export interface DKGClientInterface {
  query(sparql: string): Promise<unknown[]>;
  get(ual: UAL): Promise<{ content: unknown; metadata?: Record<string, unknown> }>;
  update(ual: UAL, data: Record<string, unknown>): Promise<void>;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export interface CacheConfig {
  ttlMs: number;
  maxSize: number;
}

const DEFAULT_CACHE_CONFIG: CacheConfig = {
  ttlMs: 5 * 60 * 1000, // 5 minutes
  maxSize: 1000,
};

/**
 * Decentralized RAG with quality filters.
 */
export class DragQualityClient {
  private dkgClient: DKGClientInterface;
  private qualityCache: Map<string, CacheEntry<QualityMetadata>> = new Map();
  private cacheConfig: CacheConfig;

  constructor(dkgClient: DKGClientInterface, cacheConfig?: Partial<CacheConfig>) {
    this.dkgClient = dkgClient;
    this.cacheConfig = { ...DEFAULT_CACHE_CONFIG, ...cacheConfig };
  }

  async queryWithQuality<T = unknown>(
    query: QualityQuery
  ): Promise<QualityQueryResult<T>[]> {
    // Execute base SPARQL query
    const rawResults = await this.dkgClient.query(query.sparql);

    // Filter by quality requirements
    const filtered: QualityQueryResult<T>[] = [];

    for (const result of rawResults) {
      const ual = this.extractUAL(result);
      if (!ual) continue;

      const metadata = await this.getQualityMetadata(ual);
      if (!metadata) continue;

      // Apply quality filters
      if (!this.passesQualityFilters(metadata, query.qualityRequirements)) {
        continue;
      }

      filtered.push({
        data: result as T,
        metadata: {
          qualityScore: metadata.qualityScore,
          verifiedAt: metadata.verifiedAt,
          publisherReputation: metadata.publisherReputation,
          assetUal: ual,
        },
      });
    }

    // Sort by quality score descending
    filtered.sort((a, b) => b.metadata.qualityScore - a.metadata.qualityScore);

    return filtered;
  }

  async getWithQuality<T = unknown>(
    ual: UAL
  ): Promise<QualityQueryResult<T> | null> {
    try {
      const asset = await this.dkgClient.get(ual);
      const metadata = await this.getQualityMetadata(ual);

      if (!metadata) {
        return null;
      }

      return {
        data: asset.content as T,
        metadata: {
          qualityScore: metadata.qualityScore,
          verifiedAt: metadata.verifiedAt,
          publisherReputation: metadata.publisherReputation,
          assetUal: ual,
        },
      };
    } catch {
      return null;
    }
  }

  async queryByQualityTier(params: {
    sparql: string;
    tier: 'verified' | 'unverified' | 'all';
    limit?: number;
  }): Promise<QualityQueryResult[]> {
    const thresholds: Record<string, { min: number; max: number }> = {
      verified: { min: 80, max: 100 },
      unverified: { min: 0, max: 79 },
      all: { min: 0, max: 100 },
    };

    const { min, max } = thresholds[params.tier];

    const results = await this.queryWithQuality({
      sparql: params.sparql,
      qualityRequirements: {
        minOverallScore: min,
      },
    });

    return results
      .filter((r) => r.metadata.qualityScore <= max)
      .slice(0, params.limit || 100);
  }

  async getQualityMetadata(ual: UAL): Promise<QualityMetadata | null> {
    // Check cache with TTL
    const cached = this.qualityCache.get(ual);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    // Remove expired entry
    if (cached) {
      this.qualityCache.delete(ual);
    }

    try {
      const asset = await this.dkgClient.get(ual);
      const rawMetadata = asset.metadata || {};

      // Extract KAMIYO quality metadata
      const metadata = this.parseQualityMetadata(rawMetadata);
      if (metadata) {
        this.setCacheEntry(ual, metadata);
      }

      return metadata;
    } catch {
      return null;
    }
  }

  private setCacheEntry(ual: UAL, metadata: QualityMetadata): void {
    // Evict oldest entries if at capacity
    if (this.qualityCache.size >= this.cacheConfig.maxSize) {
      const keysToDelete: string[] = [];
      const now = Date.now();

      // First pass: delete expired entries
      for (const [key, entry] of this.qualityCache) {
        if (entry.expiresAt <= now) {
          keysToDelete.push(key);
        }
      }

      for (const key of keysToDelete) {
        this.qualityCache.delete(key);
      }

      // If still at capacity, delete oldest entry
      if (this.qualityCache.size >= this.cacheConfig.maxSize) {
        const firstKey = this.qualityCache.keys().next().value;
        if (firstKey) {
          this.qualityCache.delete(firstKey);
        }
      }
    }

    this.qualityCache.set(ual, {
      value: metadata,
      expiresAt: Date.now() + this.cacheConfig.ttlMs,
    });
  }

  buildQualityFilteredSparql(
    baseSparql: string,
    minScore: number
  ): string {
    // Add quality filter to WHERE clause
    const qualityFilter = `
      ?asset <https://kamiyo.ai/schema/qualityScore> ?qualityScore .
      FILTER(?qualityScore >= ${minScore})
    `;

    // Insert before closing brace of WHERE clause
    const whereMatch = baseSparql.match(/WHERE\s*\{([^}]*)\}/i);
    if (!whereMatch) {
      return baseSparql;
    }

    const whereContent = whereMatch[1];
    const enhancedWhere = `WHERE { ${whereContent} ${qualityFilter} }`;

    return baseSparql.replace(/WHERE\s*\{[^}]*\}/i, enhancedWhere);
  }

  clearCache(): void {
    this.qualityCache.clear();
  }

  invalidateCache(ual: UAL): void {
    this.qualityCache.delete(ual);
  }

  getCacheStats(): { size: number; maxSize: number; ttlMs: number } {
    return {
      size: this.qualityCache.size,
      maxSize: this.cacheConfig.maxSize,
      ttlMs: this.cacheConfig.ttlMs,
    };
  }

  cleanExpired(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.qualityCache) {
      if (entry.expiresAt <= now) {
        this.qualityCache.delete(key);
        cleaned++;
      }
    }

    return cleaned;
  }

  private passesQualityFilters(
    metadata: QualityMetadata,
    requirements: QualityQuery['qualityRequirements']
  ): boolean {
    if (
      requirements.minOverallScore !== undefined &&
      metadata.qualityScore < requirements.minOverallScore
    ) {
      return false;
    }

    if (requirements.excludeDisputed && metadata.status === 'disputed') {
      return false;
    }

    if (requirements.maxAgeHours !== undefined) {
      const ageHours =
        (Date.now() / 1000 - metadata.verifiedAt) / 3600;
      if (ageHours > requirements.maxAgeHours) {
        return false;
      }
    }

    return true;
  }

  private extractUAL(result: unknown): UAL | null {
    if (typeof result === 'object' && result !== null) {
      const obj = result as Record<string, unknown>;
      // Look for common UAL field names
      const ualFields = ['@id', 'id', 'ual', 'assetUal', 'asset'];
      for (const field of ualFields) {
        if (typeof obj[field] === 'string' && obj[field].startsWith('did:dkg:')) {
          return obj[field] as UAL;
        }
      }
    }
    return null;
  }

  private parseQualityMetadata(
    raw: Record<string, unknown>
  ): QualityMetadata | null {
    const qualityScore =
      raw['kamiyo:qualityScore'] ??
      raw['qualityScore'] ??
      raw['https://kamiyo.ai/schema/qualityScore'];

    if (typeof qualityScore !== 'number') {
      return null;
    }

    return {
      qualityScore,
      verifiedAt: this.parseTimestamp(
        raw['kamiyo:verifiedAt'] ?? raw['verifiedAt']
      ),
      oracleConsensus: Number(
        raw['kamiyo:oracleConsensus'] ?? raw['oracleConsensus'] ?? 0
      ),
      publisherReputation: Number(
        raw['kamiyo:publisherReputation'] ?? raw['publisherReputation'] ?? 0
      ),
      stakeAmount: String(
        raw['kamiyo:stakeAmount'] ?? raw['stakeAmount'] ?? '0'
      ),
      verificationTx: String(
        raw['kamiyo:verificationTx'] ?? raw['verificationTx'] ?? ''
      ),
      status: this.parseStatus(raw['kamiyo:status'] ?? raw['status']),
    };
  }

  private parseTimestamp(value: unknown): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = Date.parse(value);
      return isNaN(parsed) ? 0 : Math.floor(parsed / 1000);
    }
    return 0;
  }

  private parseStatus(value: unknown): QualityMetadata['status'] {
    const valid = ['pending', 'verified', 'disputed', 'contested'];
    if (typeof value === 'string' && valid.includes(value)) {
      return value as QualityMetadata['status'];
    }
    return 'pending';
  }
}

export class QualityRAGContextBuilder {
  private client: DragQualityClient;

  constructor(client: DragQualityClient) {
    this.client = client;
  }

  async buildContext(params: {
    query: string;
    sparql: string;
    minQuality: number;
    maxResults: number;
  }): Promise<{
    context: string;
    sources: Array<{ ual: UAL; score: number; excerpt: string }>;
  }> {
    const results = await this.client.queryWithQuality({
      sparql: params.sparql,
      qualityRequirements: {
        minOverallScore: params.minQuality,
        excludeDisputed: true,
      },
    });

    const sources: Array<{ ual: UAL; score: number; excerpt: string }> = [];
    const contextParts: string[] = [];

    for (const result of results.slice(0, params.maxResults)) {
      const excerpt = this.extractExcerpt(result.data);
      sources.push({
        ual: result.metadata.assetUal,
        score: result.metadata.qualityScore,
        excerpt,
      });

      contextParts.push(
        `[Source: ${result.metadata.assetUal} | Quality: ${result.metadata.qualityScore}/100]\n${excerpt}\n`
      );
    }

    return {
      context: contextParts.join('\n---\n'),
      sources,
    };
  }

  private extractExcerpt(data: unknown, maxLength: number = 500): string {
    if (typeof data === 'string') {
      return data.slice(0, maxLength);
    }
    if (typeof data === 'object' && data !== null) {
      const obj = data as Record<string, unknown>;
      const textFields = ['text', 'content', 'description', 'body'];
      for (const field of textFields) {
        if (typeof obj[field] === 'string') {
          return (obj[field] as string).slice(0, maxLength);
        }
      }
      return JSON.stringify(data).slice(0, maxLength);
    }
    return String(data).slice(0, maxLength);
  }
}
