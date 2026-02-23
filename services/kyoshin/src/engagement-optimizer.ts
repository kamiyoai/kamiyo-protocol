/**
 * Engagement Optimizer - learns from tweet performance.
 */

import { createLogger, getMetrics, LRUCache } from './lib';
import type { DKGMemory } from './dkg-memory';
import type { Mood, TweetType, TweetStyle } from './personality';

const log = createLogger('kyoshin:engagement-optimizer');
const metrics = getMetrics();

/**
 * Engagement metrics for a tweet
 */
export interface TweetPerformance {
  tweetId: string;
  mood: Mood;
  tweetType: TweetType;
  tweetStyle: TweetStyle;
  topics: string[];
  postedAt: Date;
  metrics: {
    likes: number;
    retweets: number;
    replies: number;
    quotes: number;
    impressions?: number;
  };
  engagementScore: number;
}

/**
 * Performance statistics for a parameter combination
 */
export interface ParameterStats {
  count: number;
  totalScore: number;
  avgScore: number;
  recentScores: number[]; // Last 10 scores
  trending: 'up' | 'down' | 'stable';
}

/**
 * Optimization weights
 */
export interface OptimizationWeights {
  likes: number;
  retweets: number;
  replies: number;
  quotes: number;
  recency: number; // How much to favor recent data
}

/**
 * Engagement Optimizer configuration
 */
export interface EngagementOptimizerConfig {
  dkgMemory?: DKGMemory;
  weights?: Partial<OptimizationWeights>;
  learningRate?: number;
  minSamples?: number;
}

const DEFAULT_WEIGHTS: OptimizationWeights = {
  likes: 1.0,
  retweets: 3.0,
  replies: 2.0,
  quotes: 4.0,
  recency: 0.1, // Decay per day
};

/**
 * Engagement Optimizer - Learns from performance to improve generation
 */
export class EngagementOptimizer {
  private config: Required<EngagementOptimizerConfig>;
  private moodStats: Map<Mood, ParameterStats> = new Map();
  private typeStats: Map<TweetType, ParameterStats> = new Map();
  private styleStats: Map<TweetStyle, ParameterStats> = new Map();
  private topicStats: Map<string, ParameterStats> = new Map();
  private comboStats: Map<string, ParameterStats> = new Map();
  private performanceCache: LRUCache<TweetPerformance>;
  private initialized = false;

  constructor(config: EngagementOptimizerConfig = {}) {
    this.config = {
      dkgMemory: config.dkgMemory || null,
      weights: { ...DEFAULT_WEIGHTS, ...config.weights },
      learningRate: config.learningRate || 0.1,
      minSamples: config.minSamples || 5,
    } as Required<EngagementOptimizerConfig>;

    this.performanceCache = new LRUCache<TweetPerformance>({
      maxSize: 1000,
      ttlMs: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    log.info('Engagement optimizer initialized', {
      learningRate: this.config.learningRate,
      minSamples: this.config.minSamples,
    });
  }

  /**
   * Initialize from DKG memory
   */
  async initialize(): Promise<void> {
    if (this.initialized || !this.config.dkgMemory) {
      this.initialized = true;
      return;
    }

    log.info('Loading engagement history from DKG');

    try {
      const patterns = await this.config.dkgMemory.getEngagementPatterns(30);
      log.info('Loaded engagement patterns', {
        topMoods: patterns.topMoods,
        recentTweetCount: patterns.recentTweetCount,
      });
      this.initialized = true;
    } catch (error) {
      log.warn('Failed to load engagement history', { error: String(error) });
      this.initialized = true;
    }
  }

  /**
   * Record tweet performance
   */
  recordPerformance(performance: TweetPerformance): void {
    if (!performance || !performance.tweetId) {
      log.warn('Invalid performance data', { hasPerformance: !!performance });
      return;
    }

    // Calculate engagement score with bounds
    const score = Math.max(0, this.calculateScore(performance.metrics));
    performance.engagementScore = score;

    // Cache the performance
    this.performanceCache.set(performance.tweetId, performance);

    // Update statistics
    this.updateStats(this.moodStats, performance.mood, score);
    this.updateStats(this.typeStats, performance.tweetType, score);
    this.updateStats(this.styleStats, performance.tweetStyle, score);

    for (const topic of performance.topics) {
      this.updateStats(this.topicStats, topic, score);
    }

    // Track combo (mood + type + style)
    const comboKey = `${performance.mood}:${performance.tweetType}:${performance.tweetStyle}`;
    this.updateStats(this.comboStats, comboKey, score);

    metrics.incrementCounter('engagement_recorded');
    metrics.recordHistogram('engagement_score', score);

    log.debug('Performance recorded', {
      tweetId: performance.tweetId,
      score,
      mood: performance.mood,
      type: performance.tweetType,
    });
  }

  /**
   * Update engagement metrics for an existing tweet
   */
  updateMetrics(
    tweetId: string,
    newMetrics: Partial<TweetPerformance['metrics']>
  ): void {
    const cached = this.performanceCache.get(tweetId);
    if (!cached) {
      log.debug('Tweet not found for metrics update', { tweetId });
      return;
    }

    const oldScore = cached.engagementScore;
    cached.metrics = { ...cached.metrics, ...newMetrics };
    const newScore = this.calculateScore(cached.metrics);
    cached.engagementScore = newScore;

    this.performanceCache.set(tweetId, cached);

    // Update stats with delta
    const delta = newScore - oldScore;
    if (Math.abs(delta) > 0.01) {
      this.adjustStats(this.moodStats, cached.mood, delta);
      this.adjustStats(this.typeStats, cached.tweetType, delta);
      this.adjustStats(this.styleStats, cached.tweetStyle, delta);

      for (const topic of cached.topics) {
        this.adjustStats(this.topicStats, topic, delta);
      }

      const comboKey = `${cached.mood}:${cached.tweetType}:${cached.tweetStyle}`;
      this.adjustStats(this.comboStats, comboKey, delta);
    }

    log.debug('Metrics updated', { tweetId, oldScore, newScore });
  }

  /**
   * Get optimized selection weights for moods
   */
  getMoodWeights(): Map<Mood, number> {
    return this.getWeightsFromStats(this.moodStats);
  }

  /**
   * Get optimized selection weights for tweet types
   */
  getTypeWeights(): Map<TweetType, number> {
    return this.getWeightsFromStats(this.typeStats);
  }

  /**
   * Get optimized selection weights for styles
   */
  getStyleWeights(): Map<TweetStyle, number> {
    return this.getWeightsFromStats(this.styleStats);
  }

  /**
   * Get optimized topic suggestions
   */
  getTopTopics(limit = 10): string[] {
    const entries = Array.from(this.topicStats.entries())
      .filter(([, stats]) => stats.count >= this.config.minSamples)
      .sort((a, b) => b[1].avgScore - a[1].avgScore);

    return entries.slice(0, limit).map(([topic]) => topic);
  }

  /**
   * Get recommended parameter combination
   */
  getRecommendedParams(): {
    mood: Mood;
    type: TweetType;
    style: TweetStyle;
    confidence: number;
  } {
    // Find best combo
    let bestCombo: string | null = null;
    let bestScore = -Infinity;

    for (const [combo, stats] of this.comboStats) {
      if (stats.count >= this.config.minSamples) {
        const trendBonus = stats.trending === 'up' ? 0.1 : stats.trending === 'down' ? -0.1 : 0;
        const score = stats.avgScore + trendBonus;
        if (score > bestScore) {
          bestScore = score;
          bestCombo = combo;
        }
      }
    }

    // Parse combo or return defaults
    if (bestCombo) {
      const [mood, type, style] = bestCombo.split(':') as [Mood, TweetType, TweetStyle];
      return {
        mood,
        type,
        style,
        confidence: Math.min(bestScore / 10, 1), // Normalize to 0-1
      };
    }

    // Default fallback
    return {
      mood: 'curious',
      type: 'observation',
      style: 'concise',
      confidence: 0.3,
    };
  }

  /**
   * Select mood with engagement-weighted probability
   */
  selectOptimizedMood(availableMoods: Mood[]): Mood {
    const weights = this.getMoodWeights();
    return this.weightedSelect(availableMoods, weights);
  }

  /**
   * Select tweet type with engagement-weighted probability
   */
  selectOptimizedType(availableTypes: TweetType[]): TweetType {
    const weights = this.getTypeWeights();
    return this.weightedSelect(availableTypes, weights);
  }

  /**
   * Select style with engagement-weighted probability
   */
  selectOptimizedStyle(availableStyles: TweetStyle[]): TweetStyle {
    const weights = this.getStyleWeights();
    return this.weightedSelect(availableStyles, weights);
  }

  /**
   * Check if a topic is trending up
   */
  isTopicTrending(topic: string): boolean {
    const stats = this.topicStats.get(topic);
    return stats?.trending === 'up';
  }

  /**
   * Get performance summary
   */
  getSummary(): {
    totalSamples: number;
    topMoods: { mood: Mood; score: number }[];
    topTypes: { type: TweetType; score: number }[];
    topStyles: { style: TweetStyle; score: number }[];
    topTopics: { topic: string; score: number }[];
    averageScore: number;
  } {
    const moodEntries = Array.from(this.moodStats.entries())
      .map(([mood, stats]) => ({ mood, score: stats.avgScore }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    const typeEntries = Array.from(this.typeStats.entries())
      .map(([type, stats]) => ({ type, score: stats.avgScore }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    const styleEntries = Array.from(this.styleStats.entries())
      .map(([style, stats]) => ({ style, score: stats.avgScore }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    const topicEntries = Array.from(this.topicStats.entries())
      .filter(([, stats]) => stats.count >= 3)
      .map(([topic, stats]) => ({ topic, score: stats.avgScore }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    const allScores = Array.from(this.moodStats.values());
    const totalSamples = allScores.reduce((sum, s) => sum + s.count, 0);
    const totalScore = allScores.reduce((sum, s) => sum + s.totalScore, 0);
    const averageScore = totalSamples > 0 ? totalScore / totalSamples : 0;

    return {
      totalSamples,
      topMoods: moodEntries as { mood: Mood; score: number }[],
      topTypes: typeEntries as { type: TweetType; score: number }[],
      topStyles: styleEntries as { style: TweetStyle; score: number }[],
      topTopics: topicEntries,
      averageScore,
    };
  }

  /**
   * Calculate engagement score from metrics
   */
  private calculateScore(m: TweetPerformance['metrics']): number {
    if (!m) return 0;
    const w = this.config.weights;
    // Ensure non-negative values and cap at reasonable maximums
    const likes = Math.min(Math.max(0, m.likes || 0), 1_000_000);
    const retweets = Math.min(Math.max(0, m.retweets || 0), 1_000_000);
    const replies = Math.min(Math.max(0, m.replies || 0), 1_000_000);
    const quotes = Math.min(Math.max(0, m.quotes || 0), 1_000_000);

    return (
      likes * (w.likes ?? 1) +
      retweets * (w.retweets ?? 3) +
      replies * (w.replies ?? 2) +
      quotes * (w.quotes ?? 4)
    );
  }

  /**
   * Update stats for a parameter
   */
  private updateStats<K>(
    statsMap: Map<K, ParameterStats>,
    key: K,
    score: number
  ): void {
    const existing = statsMap.get(key) || {
      count: 0,
      totalScore: 0,
      avgScore: 0,
      recentScores: [],
      trending: 'stable' as const,
    };

    existing.count++;
    existing.totalScore += score;
    existing.avgScore = existing.totalScore / existing.count;

    // Track recent scores for trend detection
    existing.recentScores.push(score);
    if (existing.recentScores.length > 10) {
      existing.recentScores.shift();
    }

    // Calculate trend
    if (existing.recentScores.length >= 5) {
      const firstHalf = existing.recentScores.slice(0, 5);
      const secondHalf = existing.recentScores.slice(-5);
      const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

      if (secondAvg > firstAvg * 1.1) {
        existing.trending = 'up';
      } else if (secondAvg < firstAvg * 0.9) {
        existing.trending = 'down';
      } else {
        existing.trending = 'stable';
      }
    }

    statsMap.set(key, existing);
  }

  /**
   * Adjust stats with delta (for updates)
   */
  private adjustStats<K>(
    statsMap: Map<K, ParameterStats>,
    key: K,
    delta: number
  ): void {
    const existing = statsMap.get(key);
    if (existing) {
      existing.totalScore += delta;
      existing.avgScore = existing.totalScore / existing.count;
      statsMap.set(key, existing);
    }
  }

  /**
   * Convert stats to selection weights
   */
  private getWeightsFromStats<K>(statsMap: Map<K, ParameterStats>): Map<K, number> {
    const weights = new Map<K, number>();

    // Get scores with minimum samples
    const entries = Array.from(statsMap.entries()).filter(
      ([, stats]) => stats.count >= this.config.minSamples
    );

    if (entries.length === 0) {
      // Return equal weights
      for (const key of statsMap.keys()) {
        weights.set(key, 1.0);
      }
      return weights;
    }

    // Find min/max for normalization
    const scores = entries.map(([, stats]) => stats.avgScore);
    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);
    const range = maxScore - minScore || 1;

    // Normalize to weights (0.5 - 2.0 range)
    for (const [key, stats] of entries) {
      const normalized = (stats.avgScore - minScore) / range;
      const trendBonus = stats.trending === 'up' ? 0.1 : stats.trending === 'down' ? -0.1 : 0;
      weights.set(key, 0.5 + normalized * 1.5 + trendBonus);
    }

    // Set default weight for entries below min samples
    for (const [key, stats] of statsMap) {
      if (stats.count < this.config.minSamples && !weights.has(key)) {
        weights.set(key, 1.0);
      }
    }

    return weights;
  }

  /**
   * Weighted random selection
   */
  private weightedSelect<T>(options: T[], weights: Map<T, number>): T {
    // Calculate total weight
    let totalWeight = 0;
    const optionWeights: number[] = [];

    for (const option of options) {
      const weight = weights.get(option) || 1.0;
      optionWeights.push(weight);
      totalWeight += weight;
    }

    // Random selection
    let random = Math.random() * totalWeight;
    for (let i = 0; i < options.length; i++) {
      random -= optionWeights[i];
      if (random <= 0) {
        return options[i];
      }
    }

    // Fallback
    return options[Math.floor(Math.random() * options.length)];
  }
}

// Singleton instance
let optimizerInstance: EngagementOptimizer | null = null;

export function getEngagementOptimizer(): EngagementOptimizer | null {
  return optimizerInstance;
}

export function initializeEngagementOptimizer(
  config: EngagementOptimizerConfig = {}
): EngagementOptimizer {
  if (optimizerInstance) {
    return optimizerInstance;
  }

  optimizerInstance = new EngagementOptimizer(config);
  return optimizerInstance;
}
