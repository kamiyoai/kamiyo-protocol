/**
 * World Context Gatherer - gives Kyoshin awareness of what's happening.
 *
 * Gathers real-world context from trending topics, Twitter search,
 * and thoughtleader scanning before each post. Does NOT make every
 * tweet about current events -- makes Kyoshin aware so she can choose
 * to reference or deliberately ignore them.
 */

import { createXTools, type XToolsConfig, type ToolConfig } from '@kamiyo/agents';
import { createLogger, getMetrics, CircuitBreaker, withRetry } from './lib';
import type { TrendingMonitor, TrendingTopic } from './trending-monitor';

const log = createLogger('kyoshin:world-context');
const metrics = getMetrics();

const contextCircuit = new CircuitBreaker('world-context', {
  failureThreshold: 3,
  resetTimeoutMs: 300000,
  halfOpenSuccessThreshold: 1,
});

export interface WorldContext {
  trends: string[];
  recentConversations: string[];
  currentEvents: string[];
  gatheredAt: Date;
}

export interface WorldContextConfig {
  twitter: XToolsConfig;
  trendingMonitor?: TrendingMonitor | null;
  thoughtleaderAccounts?: string[];
}

export class WorldContextGatherer {
  private config: WorldContextConfig;
  private xTools: ToolConfig[];

  constructor(config: WorldContextConfig) {
    this.config = config;
    this.xTools = createXTools(config.twitter);

    log.info('World context gatherer initialized', {
      trendingEnabled: !!config.trendingMonitor,
      thoughtleaders: config.thoughtleaderAccounts?.length ?? 0,
    });
  }

  /**
   * Gather world context relevant to a topic seed.
   */
  async gather(topicSeed: string): Promise<WorldContext> {
    const startTime = Date.now();
    const context: WorldContext = {
      trends: [],
      recentConversations: [],
      currentEvents: [],
      gatheredAt: new Date(),
    };

    // Run sources in parallel, each with independent error handling
    const results = await Promise.allSettled([
      this.gatherTrends(),
      this.gatherConversations(topicSeed),
    ]);

    if (results[0].status === 'fulfilled') {
      context.trends = results[0].value;
    }

    if (results[1].status === 'fulfilled') {
      context.recentConversations = results[1].value;
    }

    metrics.incrementCounter('world_context_gathered');
    metrics.recordHistogram('world_context_duration_ms', Date.now() - startTime);

    log.info('World context gathered', {
      trends: context.trends.length,
      conversations: context.recentConversations.length,
      durationMs: Date.now() - startTime,
    });

    return context;
  }

  /**
   * Get relevant trending topics.
   */
  private async gatherTrends(): Promise<string[]> {
    const monitor = this.config.trendingMonitor;
    if (!monitor) return [];

    try {
      const trends = monitor.getCurrentTrends().slice(0, 5);
      return trends.map((t: TrendingTopic) =>
        `${t.name} (${t.category}${t.tweetVolume ? `, ${t.tweetVolume} tweets` : ''})`
      );
    } catch (error) {
      log.warn('Failed to gather trends', { error: String(error) });
      return [];
    }
  }

  /**
   * Search Twitter for conversations related to the topic seed.
   */
  private async gatherConversations(topicSeed: string): Promise<string[]> {
    // Extract 2-3 key terms from the seed for search
    const terms = this.extractSearchTerms(topicSeed);
    if (terms.length === 0) return [];

    const conversations: string[] = [];

    try {
      await contextCircuit.execute(() =>
        withRetry(async () => {
          const searchTool = this.xTools.find((t) => t.name === 'search_tweets');
          if (!searchTool) return;

          // Search for the most specific term
          const query = terms[0];
          const result = await searchTool.handler({
            query,
            max_results: 5,
          });

          if (result.success && Array.isArray(result.data)) {
            for (const tweet of result.data.slice(0, 3)) {
              const t = tweet as { text?: string; author?: string };
              if (t.text) {
                const preview = t.text.slice(0, 120);
                const author = t.author ? `@${t.author}` : 'someone';
                conversations.push(`${author}: "${preview}"`);
              }
            }
          }
        }, { maxAttempts: 1, initialDelayMs: 1000 })
      );
    } catch (error) {
      log.debug('Twitter search failed for context', { error: String(error) });
    }

    // Also scan thoughtleader accounts if configured
    const thoughtleaderTweets = await this.scanThoughtleaders();
    conversations.push(...thoughtleaderTweets);

    return conversations.slice(0, 5);
  }

  /**
   * Scan thoughtleader accounts for recent interesting tweets.
   */
  private async scanThoughtleaders(): Promise<string[]> {
    const accounts = this.config.thoughtleaderAccounts;
    if (!accounts || accounts.length === 0) return [];

    const results: string[] = [];

    try {
      const getTimelineTool = this.xTools.find((t) => t.name === 'get_timeline');
      if (!getTimelineTool) return [];

      // Only scan 2-3 accounts per post to save API calls
      const selected = accounts
        .sort(() => Math.random() - 0.5)
        .slice(0, 3);

      for (const handle of selected) {
        try {
          const result = await getTimelineTool.handler({
            username: handle,
            max_results: 3,
          });

          if (result.success && Array.isArray(result.data)) {
            for (const tweet of result.data.slice(0, 1)) {
              const t = tweet as { text?: string };
              if (t.text) {
                results.push(`@${handle}: "${t.text.slice(0, 120)}"`);
              }
            }
          }
        } catch {
          // Skip individual failures
        }
      }
    } catch (error) {
      log.debug('Thoughtleader scan failed', { error: String(error) });
    }

    return results;
  }

  /**
   * Extract 2-3 meaningful search terms from a topic seed.
   */
  private extractSearchTerms(seed: string): string[] {
    const stopwords = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'and',
      'or', 'but', 'not', 'this', 'that', 'it', 'its', 'they', 'them',
      'their', 'what', 'which', 'who', 'how', 'when', 'where', 'why',
      'most', 'some', 'all', 'any', 'each', 'every', 'both', 'few',
      'more', 'other', 'than', 'very', 'just', 'about', 'into', 'through',
      'does', 'did', 'has', 'have', 'had', 'will', 'would', 'could',
      'should', 'can', 'may', 'might', 'must', 'shall', 'still', 'also',
    ]);

    const words = seed
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 3 && !stopwords.has(w));

    // Count frequency
    const freq: Record<string, number> = {};
    for (const w of words) {
      freq[w] = (freq[w] || 0) + 1;
    }

    // Return top terms by frequency, then by length (longer = more specific)
    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
      .slice(0, 3)
      .map(([w]) => w);
  }
}
