/**
 * Trending Topic Monitor - tracks relevant trends.
 */

import { TwitterApi } from 'twitter-api-v2';
import { EventEmitter } from 'events';
import { createLogger, getMetrics, LRUCache, CircuitBreaker, withRetry } from './lib';
import type { DKGMemory } from './dkg-memory';
import type { NikaDRAG } from './drag';

const log = createLogger('kyoshin:trending');
const metrics = getMetrics();

/**
 * Trending topic with metadata
 */
export interface TrendingTopic {
  name: string;
  query: string;
  tweetVolume: number | null;
  category: TrendCategory;
  relevanceScore: number;
  discoveredAt: Date;
  exampleTweets?: string[];
}

/**
 * Categories for trend classification
 */
export type TrendCategory =
  | 'ai'
  | 'crypto'
  | 'defi'
  | 'agents'
  | 'solana'
  | 'blockchain'
  | 'tech'
  | 'culture'
  | 'other';

/**
 * Commentary opportunity
 */
export interface CommentaryOpportunity {
  topic: TrendingTopic;
  angle: string;
  urgency: 'immediate' | 'soon' | 'later';
  existingCoverage: boolean;
  suggestedApproach: string;
}

/**
 * Trending Monitor configuration
 */
export interface TrendingMonitorConfig {
  twitter: {
    apiKey: string;
    apiSecret: string;
    accessToken: string;
    accessSecret: string;
  };
  dkgMemory?: DKGMemory;
  drag?: NikaDRAG;
  checkIntervalMs?: number;
  minRelevanceScore?: number;
}

/**
 * Domain keywords for relevance scoring
 */
const DOMAIN_KEYWORDS: Record<TrendCategory, string[]> = {
  ai: [
    'ai', 'artificial intelligence', 'machine learning', 'ml', 'llm', 'gpt',
    'claude', 'openai', 'anthropic', 'neural', 'deep learning', 'transformer',
    'agent', 'agi', 'genai', 'generative ai',
  ],
  crypto: [
    'crypto', 'bitcoin', 'btc', 'ethereum', 'eth', 'blockchain', 'web3',
    'defi', 'nft', 'token', 'wallet', 'dex', 'dao',
  ],
  defi: [
    'defi', 'yield', 'lending', 'borrowing', 'liquidity', 'amm', 'swap',
    'staking', 'farming', 'protocol', 'tvl',
  ],
  agents: [
    'agent', 'autonomous', 'automation', 'bot', 'assistant', 'agentic',
    'tool use', 'mcp', 'function calling', 'orchestration',
  ],
  solana: [
    'solana', 'sol', 'phantom', 'raydium', 'jupiter', 'marinade', 'jito',
    'bonk', 'wif', 'bonfida', 'anchor',
  ],
  blockchain: [
    'blockchain', 'smart contract', 'consensus', 'validator', 'node',
    'decentralized', 'distributed', 'trustless', 'permissionless',
  ],
  tech: [
    'tech', 'startup', 'silicon valley', 'venture', 'vc', 'funding',
    'launch', 'product', 'developer', 'engineering',
  ],
  culture: [
    'meme', 'viral', 'trend', 'community', 'based', 'alpha', 'degen',
  ],
  other: [],
};

/**
 * Kamiyo-specific keywords for extra relevance
 */
const KAMIYO_KEYWORDS = [
  'kamiyo', 'kyoshin', 'origintrail', 'dkg', 'knowledge graph', 'paranet',
  'trust infrastructure', 'agent protocol', 'escrow', 'oracle',
];

const twitterCircuit = new CircuitBreaker('twitter-trends', {
  failureThreshold: 3,
  resetTimeoutMs: 300000, // 5 minutes
  halfOpenSuccessThreshold: 1,
});

/**
 * Trending Topic Monitor
 */
export class TrendingMonitor extends EventEmitter {
  private config: TrendingMonitorConfig;
  private twitter: TwitterApi;
  private trendCache: LRUCache<TrendingTopic>;
  private seenTopics: Set<string> = new Set();
  private checkInterval: NodeJS.Timeout | null = null;
  private running = false;

  constructor(config: TrendingMonitorConfig) {
    super();

    this.config = {
      checkIntervalMs: 30 * 60 * 1000, // 30 minutes
      minRelevanceScore: 0.3,
      ...config,
    };

    this.twitter = new TwitterApi({
      appKey: config.twitter.apiKey,
      appSecret: config.twitter.apiSecret,
      accessToken: config.twitter.accessToken,
      accessSecret: config.twitter.accessSecret,
    });

    this.trendCache = new LRUCache<TrendingTopic>({
      maxSize: 200,
      ttlMs: 60 * 60 * 1000, // 1 hour
    });

    log.info('Trending monitor initialized', {
      checkIntervalMs: this.config.checkIntervalMs,
      minRelevance: this.config.minRelevanceScore,
    });
  }

  /**
   * Start monitoring
   */
  async start(): Promise<void> {
    if (this.running) return;

    this.running = true;
    log.info('Starting trending monitor');

    // Initial check
    await this.checkTrends();

    // Schedule periodic checks
    this.checkInterval = setInterval(
      () => this.checkTrends(),
      this.config.checkIntervalMs
    );
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (!this.running) return;

    this.running = false;
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    log.info('Trending monitor stopped');
  }

  /**
   * Check for new trends
   */
  async checkTrends(): Promise<TrendingTopic[]> {
    const startTime = Date.now();

    try {
      // Fetch trends from Twitter
      const rawTrends = await this.fetchTrends();

      // Process and score trends
      const scoredTrends = rawTrends
        .map((trend) => this.scoreTrend(trend))
        .filter((t) => t.relevanceScore >= (this.config.minRelevanceScore || 0.3))
        .sort((a, b) => b.relevanceScore - a.relevanceScore);

      // Find new trends
      const newTrends = scoredTrends.filter((t) => !this.seenTopics.has(t.name));

      // Mark as seen and cache
      for (const trend of scoredTrends) {
        this.seenTopics.add(trend.name);
        this.trendCache.set(trend.name, trend);
      }

      // Prune seenTopics to prevent unbounded growth
      const maxSeenSize = 500;
      if (this.seenTopics.size > maxSeenSize) {
        const toDelete = Array.from(this.seenTopics).slice(0, this.seenTopics.size - maxSeenSize);
        for (const name of toDelete) {
          this.seenTopics.delete(name);
        }
      }

      // Emit events for new relevant trends
      for (const trend of newTrends) {
        this.emit('newTrend', trend);

        // Check if we should comment
        const opportunity = await this.evaluateCommentaryOpportunity(trend);
        if (opportunity) {
          this.emit('commentaryOpportunity', opportunity);
        }
      }

      metrics.recordHistogram('trending_check_duration_ms', Date.now() - startTime);
      metrics.incrementCounter('trending_checks');

      log.info('Trends checked', {
        total: rawTrends.length,
        relevant: scoredTrends.length,
        new: newTrends.length,
        durationMs: Date.now() - startTime,
      });

      return scoredTrends;
    } catch (error) {
      metrics.incrementCounter('trending_check_error');
      log.error('Failed to check trends', { error: String(error) });
      return [];
    }
  }

  /**
   * Get current relevant trends
   */
  getCurrentTrends(): TrendingTopic[] {
    const trends: TrendingTopic[] = [];
    // LRUCache doesn't have entries(), so we track differently
    for (const name of this.seenTopics) {
      const trend = this.trendCache.get(name);
      if (trend) {
        trends.push(trend);
      }
    }
    return trends
      .filter((t) => t.relevanceScore >= (this.config.minRelevanceScore || 0.3))
      .sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  /**
   * Get top trends for Kyoshin's domains
   */
  getTopDomainTrends(limit = 5): TrendingTopic[] {
    return this.getCurrentTrends().slice(0, limit);
  }

  /**
   * Check if a topic is currently trending
   */
  isTrending(topic: string): boolean {
    const lower = topic.toLowerCase();
    for (const name of this.seenTopics) {
      if (name.toLowerCase().includes(lower)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Fetch raw trends from Twitter
   */
  private async fetchTrends(): Promise<Array<{
    name: string;
    query: string;
    tweet_volume: number | null;
  }>> {
    return twitterCircuit.execute(() =>
      withRetry(
        async () => {
          // Twitter API v2 doesn't have direct trends endpoint
          // Use search for trending topics approach
          const searchTerms = [
            'AI agents',
            'crypto',
            'Solana',
            'DeFi',
            'blockchain',
            'LLM',
            'autonomous agents',
          ];

          const trends: Array<{
            name: string;
            query: string;
            tweet_volume: number | null;
          }> = [];

          for (const term of searchTerms) {
            try {
              const results = await this.twitter.v2.search(term, {
                max_results: 10,
                'tweet.fields': ['public_metrics', 'created_at'],
              });

              if (results.data.data && results.data.data.length > 0) {
                // Extract hashtags and topics from results
                for (const tweet of results.data.data) {
                  const hashtags = tweet.text.match(/#\w+/g) || [];
                  for (const tag of hashtags) {
                    if (!trends.find((t) => t.name === tag)) {
                      trends.push({
                        name: tag,
                        query: tag,
                        tweet_volume: null,
                      });
                    }
                  }
                }
              }
            } catch (error) {
              log.debug('Search failed for term', { term, error: String(error) });
            }
          }

          return trends;
        },
        { maxAttempts: 2, initialDelayMs: 5000 }
      )
    );
  }

  /**
   * Score a trend for relevance
   */
  private scoreTrend(trend: {
    name: string;
    query: string;
    tweet_volume: number | null;
  }): TrendingTopic {
    // Defensive: ensure trend has required fields
    const name = trend?.name || '';
    const query = trend?.query || name;
    const volume = typeof trend?.tweet_volume === 'number' ? trend.tweet_volume : null;

    const nameLower = name.toLowerCase();
    let score = 0;
    let category: TrendCategory = 'other';
    let maxCategoryScore = 0;

    // Check each category
    for (const [cat, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
      let categoryScore = 0;
      for (const keyword of keywords) {
        if (nameLower.includes(keyword)) {
          categoryScore += 1;
        }
      }

      if (categoryScore > maxCategoryScore) {
        maxCategoryScore = categoryScore;
        category = cat as TrendCategory;
      }
      score += categoryScore * 0.2;
    }

    // Bonus for Kamiyo-specific keywords
    for (const keyword of KAMIYO_KEYWORDS) {
      if (nameLower.includes(keyword)) {
        score += 0.5;
      }
    }

    // Volume bonus (if available)
    if (volume && volume > 0) {
      score += Math.min(volume / 100000, 0.3);
    }

    // Normalize to 0-1
    const normalizedScore = Math.min(Math.max(0, score), 1);

    return {
      name,
      query,
      tweetVolume: volume,
      category,
      relevanceScore: normalizedScore,
      discoveredAt: new Date(),
    };
  }

  /**
   * Evaluate if we should comment on a trend
   */
  private async evaluateCommentaryOpportunity(
    trend: TrendingTopic
  ): Promise<CommentaryOpportunity | null> {
    // Skip low relevance
    if (trend.relevanceScore < 0.5) {
      return null;
    }

    // Check existing coverage in DKG
    let existingCoverage = false;
    if (this.config.dkgMemory) {
      const recentTopics = await this.config.dkgMemory.getRecentTopics(48);
      existingCoverage = recentTopics.some((t) =>
        t.toLowerCase().includes(trend.name.toLowerCase().replace('#', ''))
      );
    }

    // Check semantic similarity if dRAG available
    if (this.config.drag) {
      const similar = await this.config.drag.findSimilar(trend.name, 0.7);
      if (similar.length > 0) {
        existingCoverage = true;
      }
    }

    // Determine urgency
    let urgency: CommentaryOpportunity['urgency'] = 'later';
    if (trend.tweetVolume && trend.tweetVolume > 50000) {
      urgency = 'immediate';
    } else if (trend.relevanceScore > 0.7) {
      urgency = 'soon';
    }

    // Generate suggested approach based on category
    const approaches: Record<TrendCategory, string> = {
      ai: 'Share technical insight or philosophical reflection on AI development',
      crypto: 'Offer perspective on market dynamics or technology implications',
      defi: 'Analyze protocol mechanics or risk considerations',
      agents: 'Connect to KAMIYO protocol capabilities or agent autonomy themes',
      solana: 'Highlight ecosystem developments or technical achievements',
      blockchain: 'Discuss trust infrastructure or decentralization patterns',
      tech: 'Bridge to AI/Web3 intersection or startup ecosystem dynamics',
      culture: 'Engage authentically with community sentiment',
      other: 'Find unique angle connecting to Kyoshin\'s domains',
    };

    return {
      topic: trend,
      angle: `${trend.category} perspective on ${trend.name}`,
      urgency,
      existingCoverage,
      suggestedApproach: approaches[trend.category],
    };
  }

  /**
   * Check if monitor is running
   */
  isRunning(): boolean {
    return this.running;
  }
}

// Singleton instance
let monitorInstance: TrendingMonitor | null = null;

export function getTrendingMonitor(): TrendingMonitor | null {
  return monitorInstance;
}

export function initializeTrendingMonitor(
  config: TrendingMonitorConfig
): TrendingMonitor {
  if (monitorInstance) {
    return monitorInstance;
  }

  monitorInstance = new TrendingMonitor(config);
  return monitorInstance;
}
