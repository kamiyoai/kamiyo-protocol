/**
 * DKG Memory - stores tweets and observations on OriginTrail.
 */

import { createDKGClient, type DKGClient, type ParanetConfig } from '@kamiyo/agent-paranet';
import {
  createLogger,
  withRetry,
  CircuitBreaker,
  LRUCache,
  getMetrics,
  sanitizeForSPARQL,
} from './lib';
import type { Config } from './config';

const log = createLogger('nika:dkg-memory');
const metrics = getMetrics();

export type MemoryType = 'tweet' | 'reply' | 'quote' | 'observation' | 'interaction' | 'compliance_audit';

export interface MemoryMetadata {
  type: MemoryType;
  timestamp: string;
  tweetId?: string;
  inReplyTo?: string;
  quotedTweet?: string;
  mood?: string;
  topics?: string[];
  engagement?: {
    likes?: number;
    retweets?: number;
    replies?: number;
  };
}

export interface KnowledgeAsset {
  ual: string;
  content: Record<string, unknown>;
  metadata: MemoryMetadata;
  createdAt: Date;
}

export interface SearchResult {
  ual: string;
  score: number;
  content: string;
  metadata: MemoryMetadata;
}

export interface DKGMemoryConfig {
  endpoint: string;
  port: number;
  blockchain: string;
  privateKey: string;
  paranetUAL: string;
  twitterHandle: string;
}

function propertyValue(name: string, value: unknown): Record<string, unknown> {
  return {
    '@type': 'PropertyValue',
    name,
    value,
  };
}

type SupportedBlockchain = ParanetConfig['blockchain'];

const dkgCircuit = new CircuitBreaker('dkg', {
  failureThreshold: 5,
  resetTimeoutMs: 120000,
  halfOpenSuccessThreshold: 2,
});

export class DKGMemory {
  private dkg: DKGClient | null = null;
  private config: DKGMemoryConfig;
  private cache: LRUCache<KnowledgeAsset>;
  private recentUALs: string[] = [];
  private maxRecentSize = 100;
  private initialized = false;
  private activePort: number;

  constructor(config: DKGMemoryConfig) {
    this.config = config;
    this.activePort = config.port;
    this.cache = new LRUCache<KnowledgeAsset>({
      maxSize: 1000,
      ttlMs: 30 * 60 * 1000, // 30 minutes
    });
  }

  /**
   * Initialize the DKG client. Must be called before use.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Map blockchain string to supported type
    const blockchainMap: Record<string, SupportedBlockchain> = {
      'otp::mainnet': 'otp:2043',
      'otp::testnet': 'otp:2043',
      'otp:2043': 'otp:2043',
      'gnosis::mainnet': 'gnosis:100',
      'gnosis:100': 'gnosis:100',
      'base::mainnet': 'base:8453',
      'base:8453': 'base:8453',
    };

    const blockchain = blockchainMap[this.config.blockchain] || 'otp:2043';

    const candidatePorts = this.resolveCandidatePorts(this.config.endpoint, this.config.port);
    const errors: string[] = [];

    for (const candidatePort of candidatePorts) {
      try {
        const dkg = await createDKGClient({
          dkgEndpoint: this.config.endpoint,
          dkgPort: candidatePort,
          blockchain,
          privateKey: this.config.privateKey,
          paranetUAL: this.config.paranetUAL || undefined,
        });

        await this.probeConnectivity(dkg);

        this.dkg = dkg;
        this.activePort = candidatePort;
        this.initialized = true;
        log.info('DKG memory initialized', {
          endpoint: this.config.endpoint,
          blockchain,
          port: candidatePort,
          fallbackUsed: candidatePort !== this.config.port,
        });
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`port ${candidatePort}: ${message}`);
      }
    }

    const combined = errors.join(' | ');
    log.error('Failed to initialize DKG client', {
      endpoint: this.config.endpoint,
      blockchain,
      attemptedPorts: candidatePorts,
      error: combined,
    });
    throw new Error(`DKG initialization failed (${combined})`);
  }

  private getDKG(): DKGClient {
    if (!this.dkg) {
      throw new Error('DKG memory not initialized. Call initialize() first.');
    }
    return this.dkg;
  }

  private resolveCandidatePorts(endpoint: string, configuredPort: number): number[] {
    const candidates: number[] = [configuredPort];

    try {
      const url = new URL(endpoint);
      if (url.protocol === 'http:' && configuredPort === 8900) {
        candidates.push(80);
      }
      if (url.protocol === 'https:' && configuredPort !== 443) {
        candidates.push(443);
      }
    } catch {
      // If endpoint is not a valid URL, keep configured port only.
    }

    return [...new Set(candidates)];
  }

  private async probeConnectivity(dkg: DKGClient): Promise<void> {
    const query = `
      PREFIX schema: <https://schema.org/>
      SELECT ?s WHERE { ?s a schema:Thing } LIMIT 1
    `;
    await Promise.race([
      dkg.graph.query(query, 'SELECT'),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('DKG connectivity probe timeout')), 8000)
      ),
    ]);
  }

  /**
   * Store a tweet as a knowledge asset.
   */
  async storeTweet(params: {
    content: string;
    tweetId?: string;
    mood?: string;
    topics?: string[];
  }): Promise<string | null> {
    const asset = this.buildTweetAsset(params);
    return this.createAsset(asset, {
      type: 'tweet',
      timestamp: new Date().toISOString(),
      tweetId: params.tweetId,
      mood: params.mood,
      topics: params.topics,
    });
  }

  /**
   * Store a reply as a knowledge asset.
   */
  async storeReply(params: {
    content: string;
    replyId?: string;
    inReplyTo: string;
    originalAuthor: string;
    originalContent: string;
  }): Promise<string | null> {
    const asset = {
      '@context': {
        schema: 'https://schema.org/',
        sioc: 'http://rdfs.org/sioc/ns#',
        nika: 'https://kamiyo.ai/ontology/nika/',
      },
      '@type': 'sioc:Reply',
      'schema:articleBody': params.content,
      'schema:author': {
        '@type': 'schema:Person',
        'schema:name': 'Nika (二化)',
        'schema:url': `https://x.com/${this.config.twitterHandle}`,
      },
      'schema:datePublished': new Date().toISOString(),
      'sioc:reply_of': {
        '@type': 'schema:SocialMediaPosting',
        'schema:author': params.originalAuthor,
        'schema:articleBody': params.originalContent,
      },
      'nika:assetType': 'reply',
      'nika:tweetId': params.replyId,
      'nika:inReplyTo': params.inReplyTo,
    };

    return this.createAsset(asset, {
      type: 'reply',
      timestamp: new Date().toISOString(),
      tweetId: params.replyId,
      inReplyTo: params.inReplyTo,
    });
  }

  /**
   * Store a quote tweet as a knowledge asset.
   */
  async storeQuote(params: {
    content: string;
    quoteId?: string;
    quotedTweetId: string;
    originalAuthor: string;
    originalContent: string;
  }): Promise<string | null> {
    const asset = {
      '@context': {
        schema: 'https://schema.org/',
        sioc: 'http://rdfs.org/sioc/ns#',
        nika: 'https://kamiyo.ai/ontology/nika/',
      },
      '@type': 'schema:SocialMediaPosting',
      'schema:articleBody': params.content,
      'schema:author': {
        '@type': 'schema:Person',
        'schema:name': 'Nika (二化)',
        'schema:url': `https://x.com/${this.config.twitterHandle}`,
      },
      'schema:datePublished': new Date().toISOString(),
      'schema:citation': {
        '@type': 'schema:SocialMediaPosting',
        'schema:author': params.originalAuthor,
        'schema:articleBody': params.originalContent,
      },
      'nika:assetType': 'quote',
      'nika:tweetId': params.quoteId,
      'nika:quotedTweet': params.quotedTweetId,
    };

    return this.createAsset(asset, {
      type: 'quote',
      timestamp: new Date().toISOString(),
      tweetId: params.quoteId,
      quotedTweet: params.quotedTweetId,
    });
  }

  /**
   * Store an observation (something Nika noticed but didn't tweet about).
   */
  async storeObservation(params: {
    content: string;
    source?: string;
    confidence: number;
    topics?: string[];
  }): Promise<string | null> {
    const asset = {
      '@context': {
        schema: 'https://schema.org/',
        nika: 'https://kamiyo.ai/ontology/nika/',
      },
      '@type': 'nika:Observation',
      'schema:description': params.content,
      'schema:dateCreated': new Date().toISOString(),
      'nika:source': params.source,
      'nika:confidence': params.confidence,
      'schema:keywords': params.topics || this.extractKeywords(params.content),
    };

    return this.createAsset(asset, {
      type: 'observation',
      timestamp: new Date().toISOString(),
      topics: params.topics,
    });
  }

  /**
   * Store a Meishi-compatible compliance audit record.
   */
  async storeComplianceAudit(params: {
    agentId: string;
    score: number;
    auditType?: 'periodic' | 'triggered' | 'initial';
    jurisdiction?: string;
    classification?: string;
    summary?: string;
    source?: string;
    evidenceUrl?: string;
    tweetId?: string;
    taskType?: string;
  }): Promise<string | null> {
    const classification = params.classification
      ?? (params.score >= 80 ? 'minimal'
        : params.score >= 60 ? 'limited'
          : params.score >= 40 ? 'high'
            : 'unacceptable');

    const asset: Record<string, unknown> = {
      '@context': ['https://schema.org/'],
      '@type': 'Review',
      name: 'ComplianceAudit',
      itemReviewed: {
        '@type': 'SoftwareApplication',
        identifier: params.agentId,
        name: `Nika (${this.config.twitterHandle})`,
      },
      author: {
        '@type': 'Organization',
        identifier: `nika:${this.config.twitterHandle}`,
        name: 'Nika',
      },
      reviewRating: {
        '@type': 'Rating',
        ratingValue: Math.max(0, Math.min(100, Math.round(params.score))),
        bestRating: 100,
        worstRating: 0,
      },
      reviewBody: params.summary || 'Automated quality-based compliance audit for published agent output.',
      additionalProperty: [
        propertyValue('classification', classification),
        propertyValue('jurisdiction', params.jurisdiction || 'global'),
        propertyValue('auditType', params.auditType || 'periodic'),
        propertyValue('source', params.source || 'nika-task-publisher'),
        ...(params.taskType ? [propertyValue('taskType', params.taskType)] : []),
        ...(params.tweetId ? [propertyValue('tweetId', params.tweetId)] : []),
      ],
      datePublished: new Date().toISOString(),
      ...(params.evidenceUrl
        ? {
            isBasedOn: {
              '@type': 'DigitalDocument',
              '@id': params.evidenceUrl,
            },
          }
        : {}),
    };

    return this.createAsset(asset, {
      type: 'compliance_audit',
      timestamp: new Date().toISOString(),
      tweetId: params.tweetId,
      topics: ['ComplianceAudit', 'meishi', 'nika'],
    });
  }

  /**
   * Query DKG with SPARQL.
   */
  async query(sparql: string): Promise<Record<string, unknown>[]> {
    const startTime = Date.now();

    try {
      const result = await dkgCircuit.execute(() =>
        withRetry(
          async () => {
            const dkg = this.getDKG();
            return dkg.graph.query(sparql, 'SELECT');
          },
          { maxAttempts: 3, initialDelayMs: 2000 }
        )
      );

      metrics.recordHistogram('dkg_query_duration_ms', Date.now() - startTime);
      metrics.incrementCounter('dkg_query_success');

      // Cast unknown[] to Record<string, unknown>[]
      const data = (result.data || []) as Record<string, unknown>[];
      return data;
    } catch (error) {
      metrics.incrementCounter('dkg_query_error');
      log.error('DKG query failed', {
        error: String(error),
        duration: Date.now() - startTime,
      });
      return [];
    }
  }

  /**
   * Search for recent memories by type.
   */
  async searchRecent(params: {
    type?: MemoryType;
    limit?: number;
    since?: Date;
  }): Promise<SearchResult[]> {
    const sinceDate = params.since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const typeFilter = params.type
      ? `FILTER (?type = "${sanitizeForSPARQL(params.type)}")`
      : '';

    const sparql = `
      PREFIX schema: <https://schema.org/>
      PREFIX nika: <https://kamiyo.ai/ontology/nika/>
      PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

      SELECT ?ual ?content ?type ?date
      WHERE {
        ?ual schema:articleBody ?content .
        ?ual nika:assetType ?type .
        ?ual schema:datePublished ?date .
        FILTER (xsd:dateTime(?date) >= xsd:dateTime("${sinceDate.toISOString()}"))
        ${typeFilter}
      }
      ORDER BY DESC(?date)
      LIMIT ${Math.min(params.limit || 20, 100)}
    `;

    const results = await this.query(sparql);
    return results.map((r) => ({
      ual: String(r.ual || ''),
      score: 1.0,
      content: String(r.content || ''),
      metadata: {
        type: (r.type as MemoryType) || 'observation',
        timestamp: String(r.date || new Date().toISOString()),
      },
    }));
  }

  /**
   * Search memories by topic/keyword.
   */
  async searchByTopic(topic: string, limit = 10): Promise<SearchResult[]> {
    if (!topic || typeof topic !== 'string' || topic.trim().length === 0) {
      return [];
    }
    if (topic.length > 200) {
      log.warn('Topic too long, truncating', { length: topic.length });
      topic = topic.slice(0, 200);
    }
    const safeTopic = sanitizeForSPARQL(topic.trim());

    const sparql = `
      PREFIX schema: <https://schema.org/>
      PREFIX nika: <https://kamiyo.ai/ontology/nika/>

      SELECT ?ual ?content ?type ?date
      WHERE {
        ?ual schema:articleBody ?content .
        ?ual nika:assetType ?type .
        ?ual schema:datePublished ?date .
        ?ual schema:keywords ?keyword .
        FILTER (CONTAINS(LCASE(STR(?keyword)), LCASE("${safeTopic}")))
      }
      ORDER BY DESC(?date)
      LIMIT ${Math.min(limit, 100)}
    `;

    const results = await this.query(sparql);
    return results.map((r) => ({
      ual: String(r.ual || ''),
      score: 1.0,
      content: String(r.content || ''),
      metadata: {
        type: (r.type as MemoryType) || 'observation',
        timestamp: String(r.date || new Date().toISOString()),
      },
    }));
  }

  /**
   * Get a specific asset by UAL.
   */
  async get(ual: string): Promise<KnowledgeAsset | null> {
    const cached = this.cache.get(ual);
    if (cached) {
      metrics.incrementCounter('dkg_cache_hit');
      return cached;
    }

    metrics.incrementCounter('dkg_cache_miss');
    const startTime = Date.now();

    try {
      const result = await dkgCircuit.execute(() =>
        withRetry(
          async () => {
            const dkg = this.getDKG();
            return dkg.asset.get(ual);
          },
          { maxAttempts: 2, initialDelayMs: 1000 }
        )
      );

      // The result.public is an object containing the assertion data
      const publicData = result?.public as Record<string, unknown> | undefined;
      if (!publicData) {
        log.debug('Asset not found', { ual });
        return null;
      }

      const content = publicData as Record<string, unknown>;
      const asset: KnowledgeAsset = {
        ual,
        content,
        metadata: this.extractMetadata(content),
        createdAt: new Date((content['schema:datePublished'] as string) || Date.now()),
      };

      this.cache.set(ual, asset);
      metrics.recordHistogram('dkg_get_duration_ms', Date.now() - startTime);

      return asset;
    } catch (error) {
      log.error('Failed to get asset', {
        error: String(error),
        ual,
        duration: Date.now() - startTime,
      });
      return null;
    }
  }

  /**
   * Get Nika's recent tweet topics (for avoiding repetition).
   */
  async getRecentTopics(hours = 24): Promise<string[]> {
    // Clamp hours to reasonable bounds
    const safeHours = Math.min(Math.max(1, hours), 168); // 1 hour to 1 week
    const since = new Date(Date.now() - safeHours * 60 * 60 * 1000);
    const sparql = `
      PREFIX schema: <https://schema.org/>
      PREFIX nika: <https://kamiyo.ai/ontology/nika/>
      PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

      SELECT DISTINCT ?keyword
      WHERE {
        ?ual nika:assetType "tweet" .
        ?ual schema:datePublished ?date .
        ?ual schema:keywords ?keyword .
        FILTER (xsd:dateTime(?date) >= xsd:dateTime("${since.toISOString()}"))
      }
      LIMIT 50
    `;

    const results = await this.query(sparql);
    return results.map((r) => String(r.keyword || '')).filter((k) => k.length > 0);
  }

  /**
   * Get engagement patterns for learning.
   */
  async getEngagementPatterns(days = 7): Promise<{
    topMoods: string[];
    topTypes: string[];
    recentTweetCount: number;
  }> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const sparql = `
      PREFIX schema: <https://schema.org/>
      PREFIX nika: <https://kamiyo.ai/ontology/nika/>
      PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

      SELECT ?mood (COUNT(?ual) as ?count)
      WHERE {
        ?ual nika:assetType "tweet" .
        ?ual schema:datePublished ?date .
        OPTIONAL { ?ual nika:mood ?mood }
        FILTER (xsd:dateTime(?date) >= xsd:dateTime("${since.toISOString()}"))
      }
      GROUP BY ?mood
      ORDER BY DESC(?count)
      LIMIT 20
    `;

    const results = await this.query(sparql);
    const moods = results.filter((r) => r.mood).map((r) => String(r.mood));
    const totalCount = results.reduce(
      (sum, r) => sum + (parseInt(String(r.count)) || 0),
      0
    );

    return {
      topMoods: [...new Set(moods)].slice(0, 3),
      topTypes: ['tweet', 'reply', 'quote'],
      recentTweetCount: totalCount,
    };
  }

  /**
   * Update engagement metrics for a tweet.
   */
  async updateEngagement(
    tweetId: string,
    engagement: { likes?: number; retweets?: number; replies?: number }
  ): Promise<void> {
    // Find the asset by tweetId
    const sparql = `
      PREFIX nika: <https://kamiyo.ai/ontology/nika/>

      SELECT ?ual
      WHERE {
        ?ual nika:tweetId "${sanitizeForSPARQL(tweetId)}" .
      }
      LIMIT 1
    `;

    const results = await this.query(sparql);
    if (results.length === 0) {
      log.debug('Tweet not found for engagement update', { tweetId });
      return;
    }

    const ual = String(results[0].ual);
    const cached = this.cache.get(ual);
    if (cached) {
      cached.metadata.engagement = { ...cached.metadata.engagement, ...engagement };
      this.cache.set(ual, cached);
    }

    log.debug('Engagement updated', { tweetId, engagement });
  }

  /**
   * Get recent UALs for bulk operations.
   */
  getRecentUALs(): string[] {
    return [...this.recentUALs];
  }

  /**
   * Check if DKG circuit is healthy.
   */
  getCircuitStatus(): string {
    return dkgCircuit.getState();
  }

  getActivePort(): number {
    return this.activePort;
  }

  private async createAsset(
    content: Record<string, unknown>,
    metadata: MemoryMetadata
  ): Promise<string | null> {
    const startTime = Date.now();

    try {
      const result = await dkgCircuit.execute(() =>
        withRetry(
          async () => {
            const dkg = this.getDKG();
            return dkg.asset.create(
              { public: content },
              {
                epochsNum: 2,
                paranetUAL: this.config.paranetUAL || undefined,
              }
            );
          },
          { maxAttempts: 3, initialDelayMs: 2000 }
        )
      );

      const ual = result?.UAL;
      if (ual) {
        this.cache.set(ual, {
          ual,
          content,
          metadata,
          createdAt: new Date(),
        });

        this.recentUALs.unshift(ual);
        if (this.recentUALs.length > this.maxRecentSize) {
          this.recentUALs.pop();
        }

        metrics.incrementCounter('dkg_create_success');
        metrics.recordHistogram('dkg_create_duration_ms', Date.now() - startTime);
        log.debug('Asset created', { ual, type: metadata.type });
      }

      return ual || null;
    } catch (error) {
      metrics.incrementCounter('dkg_create_error');
      log.error('Failed to create asset', {
        error: String(error),
        type: metadata.type,
        duration: Date.now() - startTime,
      });
      return null;
    }
  }

  private buildTweetAsset(params: {
    content: string;
    tweetId?: string;
    mood?: string;
    topics?: string[];
  }): Record<string, unknown> {
    return {
      '@context': {
        schema: 'https://schema.org/',
        sioc: 'http://rdfs.org/sioc/ns#',
        nika: 'https://kamiyo.ai/ontology/nika/',
      },
      '@type': 'schema:SocialMediaPosting',
      'schema:headline': this.extractHeadline(params.content),
      'schema:articleBody': params.content,
      'schema:author': {
        '@type': 'schema:Person',
        'schema:name': 'Nika (二化)',
        'schema:url': `https://x.com/${this.config.twitterHandle}`,
      },
      'schema:datePublished': new Date().toISOString(),
      'schema:keywords': params.topics || this.extractKeywords(params.content),
      'nika:assetType': 'tweet',
      'nika:mood': params.mood,
      'nika:tweetId': params.tweetId,
    };
  }

  private extractMetadata(content: Record<string, unknown>): MemoryMetadata {
    return {
      type: (content['nika:assetType'] as MemoryType) || 'observation',
      timestamp: (content['schema:datePublished'] as string) || new Date().toISOString(),
      tweetId: content['nika:tweetId'] as string | undefined,
      mood: content['nika:mood'] as string | undefined,
      inReplyTo: content['nika:inReplyTo'] as string | undefined,
      quotedTweet: content['nika:quotedTweet'] as string | undefined,
    };
  }

  private extractHeadline(content: string): string {
    const words = content.split(/\s+/).slice(0, 8);
    return words.join(' ') + (words.length < content.split(/\s+/).length ? '...' : '');
  }

  private extractKeywords(content: string): string[] {
    const stopwords = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'to', 'of',
      'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through',
      'during', 'before', 'after', 'above', 'below', 'between', 'under',
      'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where',
      'why', 'how', 'all', 'each', 'few', 'more', 'most', 'other', 'some',
      'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too',
      'very', 'just', 'and', 'but', 'if', 'or', 'because', 'until', 'while',
      'this', 'that', 'these', 'those', 'what', 'which', 'who', 'whom',
      'its', 'it', 'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'him',
      'his', 'she', 'her', 'they', 'them', 'their',
    ]);

    const words = content
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 3 && !stopwords.has(w));

    const freq: Record<string, number> = {};
    for (const w of words) {
      freq[w] = (freq[w] || 0) + 1;
    }

    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([w]) => w);
  }
}

// Singleton instance
let memory: DKGMemory | null = null;

export function getDKGMemory(): DKGMemory | null {
  return memory;
}

export async function initializeDKGMemory(config: Config): Promise<DKGMemory> {
  if (memory) {
    return memory;
  }

  memory = new DKGMemory({
    endpoint: config.DKG_ENDPOINT,
    port: config.DKG_PORT,
    blockchain: config.DKG_BLOCKCHAIN,
    privateKey: config.DKG_PRIVATE_KEY,
    paranetUAL: config.NIKA_PARANET_UAL,
    twitterHandle: config.TWITTER_HANDLE,
  });

  await memory.initialize();
  return memory;
}
