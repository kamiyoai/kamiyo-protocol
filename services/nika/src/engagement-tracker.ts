/**
 * Engagement Tracker - fetches metrics, updates DKG.
 */

import { createXTools, type XToolsConfig } from '@kamiyo/agents';
import { createLogger, getMetrics, withRetry } from './lib';
import { getDKGMemory } from './dkg-memory';

const log = createLogger('nika:engagement');
const metrics = getMetrics();

interface TweetMetrics {
  id: string;
  text: string;
  createdAt?: string;
  metrics?: {
    like_count?: number;
    retweet_count?: number;
    reply_count?: number;
    quote_count?: number;
  };
}

export interface EngagementTrackerConfig {
  twitter: XToolsConfig;
  intervalMs: number;
  batchSize: number;
}

const DEFAULT_CONFIG: Partial<EngagementTrackerConfig> = {
  intervalMs: 30 * 60 * 1000, // 30 minutes
  batchSize: 20,
};

export class EngagementTracker {
  private config: EngagementTrackerConfig;
  private intervalId: NodeJS.Timeout | null = null;
  private running = false;
  private getTimelineTool: ReturnType<typeof createXTools>[number] | null = null;

  constructor(config: EngagementTrackerConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config } as EngagementTrackerConfig;

    const xTools = createXTools(config.twitter);
    this.getTimelineTool = xTools.find((t) => t.name === 'get_timeline') || null;

    if (!this.getTimelineTool) {
      log.warn('get_timeline tool not found - engagement tracking disabled');
    }
  }

  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    if (!this.getTimelineTool) {
      log.warn('Cannot start engagement tracker - get_timeline tool not available');
      return;
    }

    this.running = true;
    log.info('Engagement tracker started', { intervalMs: this.config.intervalMs });

    // Run immediately on start
    await this.tick();

    // Schedule periodic runs
    this.intervalId = setInterval(() => {
      this.tick().catch((error) => {
        log.error('Engagement tick failed', { error: String(error) });
      });
    }, this.config.intervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.running = false;
    log.info('Engagement tracker stopped');
  }

  isRunning(): boolean {
    return this.running;
  }

  private async tick(): Promise<void> {
    const dkgMemory = getDKGMemory();
    if (!dkgMemory) {
      log.debug('DKG memory not available - skipping engagement update');
      return;
    }

    if (!this.getTimelineTool) {
      return;
    }

    const startTime = Date.now();
    log.debug('Fetching tweet engagement metrics');

    try {
      const result = await withRetry(
        async () => this.getTimelineTool!.handler({ limit: this.config.batchSize }),
        { maxAttempts: 2, initialDelayMs: 5000 }
      );

      if (!result.success) {
        log.warn('Failed to fetch timeline', { error: result.error });
        metrics.incrementCounter('engagement_fetch_error');
        return;
      }

      const tweets = (result.data as { tweets: TweetMetrics[] })?.tweets || [];
      log.debug('Fetched tweets for engagement update', { count: tweets.length });

      let updated = 0;
      for (const tweet of tweets) {
        if (!tweet.metrics) continue;

        try {
          await dkgMemory.updateEngagement(tweet.id, {
            likes: tweet.metrics.like_count,
            retweets: tweet.metrics.retweet_count,
            replies: tweet.metrics.reply_count,
          });
          updated++;
        } catch (error) {
          log.warn('Failed to update engagement for tweet', {
            tweetId: tweet.id,
            error: String(error),
          });
        }
      }

      const duration = Date.now() - startTime;
      metrics.incrementCounter('engagement_updates_total', updated);
      metrics.recordHistogram('engagement_update_duration_ms', duration);

      log.info('Engagement metrics updated', {
        tweetsChecked: tweets.length,
        updated,
        durationMs: duration,
      });
    } catch (error) {
      metrics.incrementCounter('engagement_tick_error');
      log.error('Engagement tick failed', { error: String(error) });
    }
  }

  /**
   * Force an immediate update (for testing/manual trigger).
   */
  async forceUpdate(): Promise<void> {
    await this.tick();
  }
}

export function createEngagementTracker(
  twitter: XToolsConfig,
  options?: Partial<Omit<EngagementTrackerConfig, 'twitter'>>
): EngagementTracker {
  return new EngagementTracker({
    twitter,
    intervalMs: options?.intervalMs ?? DEFAULT_CONFIG.intervalMs!,
    batchSize: options?.batchSize ?? DEFAULT_CONFIG.batchSize!,
  });
}
