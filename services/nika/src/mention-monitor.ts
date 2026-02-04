/**
 * Mention Monitor - polls for mentions, triggers replies.
 */

import { EventEmitter } from 'events';
import { createXTools, type XToolsConfig, type ToolResult } from '@kamiyo/agents';
import { createLogger, getMetrics, withRetry, LRUCache } from './lib';

const log = createLogger('nika:mentions');
const metrics = getMetrics();

export interface MentionMonitorConfig {
  twitter: XToolsConfig;
  checkIntervalMs: number;
  maxRepliesPerCycle: number;
  replyDelayMs: number;
  onMention: (mentionId: string, mentionText: string, authorUsername: string) => Promise<void>;
}

export interface Mention {
  id: string;
  text: string;
  authorId: string;
  authorUsername?: string;
  createdAt?: string;
  conversationId?: string;
}

export class MentionMonitor extends EventEmitter {
  private config: MentionMonitorConfig;
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private lastMentionId: string | null = null;
  private lastCheckAt: Date | null = null;
  private processedCache: LRUCache<boolean>;
  private xTools: ReturnType<typeof createXTools>;

  constructor(config: MentionMonitorConfig) {
    super();
    this.config = config;
    this.processedCache = new LRUCache<boolean>({ maxSize: 1000, ttlMs: 24 * 60 * 60 * 1000 });
    this.xTools = createXTools(config.twitter);

    log.info('Mention monitor initialized', {
      checkIntervalMs: config.checkIntervalMs,
      maxRepliesPerCycle: config.maxRepliesPerCycle,
      replyDelayMs: config.replyDelayMs,
    });
  }

  async start(): Promise<void> {
    if (this.running) {
      log.warn('Mention monitor already running');
      return;
    }

    this.running = true;
    log.info('Mention monitor starting');

    // Initial check
    await this.checkMentions();

    // Schedule periodic checks
    this.timer = setInterval(() => {
      this.checkMentions().catch((error) => {
        log.error('Mention check failed', { error: String(error) });
        this.emit('error', error);
      });
    }, this.config.checkIntervalMs);

    this.emit('started');
    metrics.incrementCounter('nika_mention_monitor_started');
  }

  private async checkMentions(): Promise<void> {
    const startTime = Date.now();
    this.lastCheckAt = new Date();

    log.debug('Checking mentions', { sinceId: this.lastMentionId });
    metrics.incrementCounter('nika_mention_checks');

    try {
      // Find the get_mentions tool
      const getMentionsTool = this.xTools.find((t) => t.name === 'get_mentions');
      if (!getMentionsTool) {
        throw new Error('get_mentions tool not found');
      }

      const result = await withRetry(
        () =>
          getMentionsTool.handler({
            limit: 20,
            ...(this.lastMentionId ? { sinceId: this.lastMentionId } : {}),
          }),
        { maxAttempts: 3, initialDelayMs: 1000 }
      ) as ToolResult;

      if (!result.success || !result.data) {
        log.warn('Failed to fetch mentions', { error: result.error });
        return;
      }

      const data = result.data as { mentions: Mention[] };
      const mentions = data.mentions || [];

      if (mentions.length === 0) {
        log.debug('No new mentions');
        return;
      }

      log.info('Found mentions', { count: mentions.length });
      metrics.incrementCounter('nika_mentions_found');

      // Update last mention ID (first one is most recent)
      if (mentions.length > 0) {
        this.lastMentionId = mentions[0].id;
      }

      // Process mentions (oldest first), limited per cycle
      const mentionsToProcess = [...mentions].reverse();
      let repliesThisCycle = 0;

      for (const mention of mentionsToProcess) {
        // Respect rate limit
        if (repliesThisCycle >= this.config.maxRepliesPerCycle) {
          log.info('Rate limit reached, deferring remaining mentions', {
            processed: repliesThisCycle,
            remaining: mentionsToProcess.length - repliesThisCycle,
          });
          break;
        }

        // Skip if already processed
        if (this.processedCache.get(mention.id)) {
          log.debug('Skipping already processed mention', { mentionId: mention.id });
          continue;
        }

        try {
          // Get author username if not present
          let authorUsername = mention.authorUsername || 'unknown';
          if (!mention.authorUsername && mention.authorId) {
            authorUsername = mention.authorId;
          }

          log.info('Processing mention', {
            mentionId: mention.id,
            author: authorUsername,
            preview: mention.text.slice(0, 50),
          });

          await this.config.onMention(mention.id, mention.text, authorUsername);

          // Mark as processed
          this.processedCache.set(mention.id, true);
          repliesThisCycle++;

          this.emit('processed', {
            mentionId: mention.id,
            authorUsername,
            skipped: false,
          });

          metrics.incrementCounter('nika_mentions_processed');

          // Delay between replies to avoid spam
          if (repliesThisCycle < this.config.maxRepliesPerCycle) {
            await new Promise((resolve) => setTimeout(resolve, this.config.replyDelayMs));
          }
        } catch (error) {
          log.error('Failed to process mention', {
            mentionId: mention.id,
            error: String(error),
          });

          this.emit('error', error);
          metrics.incrementCounter('nika_mention_processing_errors');

          // Still mark as processed to avoid infinite retry
          this.processedCache.set(mention.id, true);
        }
      }

      const duration = Date.now() - startTime;
      metrics.recordHistogram('nika_mention_check_duration_ms', duration);
    } catch (error) {
      metrics.incrementCounter('nika_mention_check_errors');
      throw error;
    }
  }

  stop(): void {
    if (!this.running) {
      return;
    }

    this.running = false;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    log.info('Mention monitor stopped');
    metrics.incrementCounter('nika_mention_monitor_stopped');
    this.emit('stopped');
  }

  isRunning(): boolean {
    return this.running;
  }

  setLastMentionId(id: string): void {
    this.lastMentionId = id;
    log.debug('Last mention ID set', { id });
  }

  getLastMentionId(): string | null {
    return this.lastMentionId;
  }

  getProcessedCount(): number {
    return this.processedCache.size;
  }

  getLastCheckAt(): Date | null {
    return this.lastCheckAt;
  }
}

export interface CreateMentionMonitorOptions {
  twitter: XToolsConfig;
  checkIntervalMs: number;
  maxRepliesPerCycle?: number;
  replyDelayMs?: number;
  onMention: (mentionId: string, mentionText: string, authorUsername: string) => Promise<void>;
}

export function createMentionMonitor(options: CreateMentionMonitorOptions): MentionMonitor {
  return new MentionMonitor({
    twitter: options.twitter,
    checkIntervalMs: options.checkIntervalMs,
    maxRepliesPerCycle: options.maxRepliesPerCycle ?? 3,
    replyDelayMs: options.replyDelayMs ?? 60000, // 1 minute between replies
    onMention: options.onMention,
  });
}
