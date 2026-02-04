/**
 * Market Intel Monitor - tracks market-relevant accounts.
 */

import { EventEmitter } from 'events';
import { createXTools, type XToolsConfig } from '@kamiyo/agents';
import { createLogger, getMetrics, withRetry, LRUCache, CircuitBreaker } from './lib';

const log = createLogger('nika:market-intel');
const metrics = getMetrics();

const TRACKED_ACCOUNTS = ['aixbt_agent'] as const;
const RELEVANT_KEYWORDS = ['kamiyo', '$KAMIYO', 'KAMIYO'];

export interface MarketIntel {
  tweetId: string;
  text: string;
  authorUsername: string;
  timestamp: string;
  relevance: 'direct' | 'indirect';
}

export interface MarketIntelMonitorConfig {
  twitter: XToolsConfig;
  intervalMs?: number;
  onIntel?: (intel: MarketIntel) => Promise<void>;
}

export class MarketIntelMonitor extends EventEmitter {
  private twitter: XToolsConfig;
  private intervalMs: number;
  private onIntel?: (intel: MarketIntel) => Promise<void>;
  private running = false;
  private intervalHandle?: ReturnType<typeof setInterval>;
  private processedCache = new LRUCache<boolean>({ maxSize: 1000, ttlMs: 7 * 24 * 60 * 60 * 1000 });
  private circuit = new CircuitBreaker('market-intel', { failureThreshold: 3, resetTimeoutMs: 300000 });
  private lastCheckAt: Date | null = null;

  constructor(config: MarketIntelMonitorConfig) {
    super();
    this.twitter = config.twitter;
    this.intervalMs = config.intervalMs ?? 30 * 60 * 1000; // 30 min default
    this.onIntel = config.onIntel;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    log.info('Market intel monitor starting', {
      trackedAccounts: TRACKED_ACCOUNTS,
      intervalMs: this.intervalMs,
    });

    await this.check();

    this.intervalHandle = setInterval(() => {
      this.check().catch((err) => {
        log.error('Market intel check failed', { error: String(err) });
        this.emit('error', err);
      });
    }, this.intervalMs);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;

    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = undefined;
    }

    log.info('Market intel monitor stopped');
  }

  isRunning(): boolean {
    return this.running;
  }

  getLastCheckAt(): Date | null {
    return this.lastCheckAt;
  }

  getCircuitStatus(): string {
    return this.circuit.getState();
  }

  private async check(): Promise<void> {
    const startTime = Date.now();

    try {
      await this.circuit.execute(async () => {
        for (const account of TRACKED_ACCOUNTS) {
          await this.checkAccount(account);
        }
      });

      this.lastCheckAt = new Date();
      metrics.incrementCounter('nika_market_intel_checks');

      log.debug('Market intel check complete', {
        durationMs: Date.now() - startTime,
      });
    } catch (error) {
      metrics.incrementCounter('nika_market_intel_errors');
      throw error;
    }
  }

  private async checkAccount(username: string): Promise<void> {
    const xTools = createXTools(this.twitter);
    const searchTool = xTools.find((t) => t.name === 'search_tweets');

    if (!searchTool) {
      log.warn('search_tweets tool not found');
      return;
    }

    try {
      const result = await withRetry(
        async () => searchTool.handler({ query: `from:${username}`, max_results: 20 }),
        { maxAttempts: 2, initialDelayMs: 2000 }
      );

      if (!result.success || !result.data) {
        return;
      }

      const tweets = (result.data as { tweets?: Array<{ id: string; text: string; created_at?: string }> }).tweets || [];

      for (const tweet of tweets) {
        const cacheKey = `intel_${tweet.id}`;
        if (this.processedCache.get(cacheKey)) {
          continue;
        }

        const relevance = this.checkRelevance(tweet.text);
        if (!relevance) {
          this.processedCache.set(cacheKey, true);
          continue;
        }

        const intel: MarketIntel = {
          tweetId: tweet.id,
          text: tweet.text,
          authorUsername: username,
          timestamp: tweet.created_at || new Date().toISOString(),
          relevance,
        };

        log.info('Market intel found', {
          tweetId: tweet.id,
          username,
          relevance,
          preview: tweet.text.slice(0, 50),
        });

        this.processedCache.set(cacheKey, true);
        this.emit('intel', intel);

        if (this.onIntel) {
          try {
            await this.onIntel(intel);
          } catch (err) {
            log.error('Intel handler failed', { tweetId: tweet.id, error: String(err) });
          }
        }
      }
    } catch (error) {
      log.error('Failed to check account', { username, error: String(error) });
      throw error;
    }
  }

  private checkRelevance(text: string): 'direct' | 'indirect' | null {
    const lowerText = text.toLowerCase();

    for (const keyword of RELEVANT_KEYWORDS) {
      if (lowerText.includes(keyword.toLowerCase())) {
        return 'direct';
      }
    }

    const indirectKeywords = [
      'ai agent',
      'agent protocol',
      'reputation',
      'trust score',
      'escrow',
      'decentralized ai',
    ];

    for (const keyword of indirectKeywords) {
      if (lowerText.includes(keyword)) {
        return 'indirect';
      }
    }

    return null;
  }
}

export function createMarketIntelMonitor(config: MarketIntelMonitorConfig): MarketIntelMonitor {
  return new MarketIntelMonitor(config);
}
