/**
 * Mention Monitor - polls for mentions, triggers replies.
 */

import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createXTools, type XToolsConfig, type ToolResult } from '@kamiyo/agents';
import { createClient, type RedisClientType } from 'redis';
import { createLogger, getMetrics, withRetry, LRUCache } from './lib';

const log = createLogger('kyoshin:mentions');
const metrics = getMetrics();
const TWEET_ID_PATTERN = /^\d{10,}$/;
const DEFAULT_PROCESSED_MENTION_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const DEFAULT_CONVERSATION_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MAX_REPLIES_PER_CONVERSATION = 2;
const DEFAULT_STATE_FILE_PATH = path.join(process.cwd(), '.kyoshin', 'mention-monitor-state.json');
const MAX_PERSISTED_MENTIONS = 5000;
const MAX_PERSISTED_CONVERSATIONS = 2000;
const DEFAULT_SHARED_STATE_PREFIX = 'kyoshin:mentions';
const DEFAULT_BLOCKED_USERNAMES = ['chatdkg'];

function normalizeUsername(value: string): string {
  return value.trim().replace(/^@+/, '').toLowerCase();
}

interface PersistedEntry {
  id: string;
  at: number;
}

interface PersistedConversationEntry extends PersistedEntry {
  count: number;
}

interface MentionMonitorStateV1 {
  version: 1;
  lastMentionId: string | null;
  processedMentions: PersistedEntry[];
  repliedConversations: PersistedEntry[];
  updatedAt: string;
}

interface MentionMonitorStateV2 {
  version: 2;
  lastMentionId: string | null;
  processedMentions: PersistedEntry[];
  repliedConversations: PersistedConversationEntry[];
  updatedAt: string;
}

type MentionMonitorState = MentionMonitorStateV1 | MentionMonitorStateV2;

export interface MentionMonitorConfig {
  twitter: XToolsConfig;
  checkIntervalMs: number;
  maxRepliesPerCycle: number;
  maxRepliesPerConversation?: number;
  blockedUsernames?: string[];
  maxMentionRetries: number;
  replyDelayMs: number;
  startupDelayMs: number;
  stateFilePath?: string;
  processedMentionTtlMs?: number;
  conversationCooldownMs?: number;
  sharedStateRedisUrl?: string;
  sharedStatePrefix?: string;
  onMention: (
    mentionId: string,
    mentionText: string,
    authorUsername: string,
    authorId: string | null
  ) => Promise<void>;
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
  private isChecking = false;
  private lastMentionId: string | null = null;
  private lastCheckAt: Date | null = null;
  private processedCache: LRUCache<boolean>;
  private failureCache: LRUCache<number>;
  private repliedConversationCache: LRUCache<number>;
  private processedMentions: PersistedEntry[] = [];
  private repliedConversations: PersistedConversationEntry[] = [];
  private stateDirty = false;
  private stateFilePath: string;
  private processedMentionTtlMs: number;
  private conversationCooldownMs: number;
  private maxRepliesPerConversation: number;
  private maxMentionRetries: number;
  private blockedUsernames: Set<string>;
  private sharedStateRedisUrl: string | null;
  private sharedStatePrefix: string;
  private sharedState: RedisClientType | null = null;
  private sharedStateAvailable = false;
  private xTools: ReturnType<typeof createXTools>;

  constructor(config: MentionMonitorConfig) {
    super();
    this.config = config;
    this.processedMentionTtlMs = config.processedMentionTtlMs ?? DEFAULT_PROCESSED_MENTION_TTL_MS;
    this.conversationCooldownMs = config.conversationCooldownMs ?? DEFAULT_CONVERSATION_COOLDOWN_MS;
    this.maxRepliesPerConversation = Math.max(
      1,
      config.maxRepliesPerConversation ?? DEFAULT_MAX_REPLIES_PER_CONVERSATION
    );
    this.maxMentionRetries = Math.max(1, config.maxMentionRetries);
    this.stateFilePath = config.stateFilePath || DEFAULT_STATE_FILE_PATH;
    this.sharedStateRedisUrl = config.sharedStateRedisUrl || null;
    const sharedPrefix = (config.sharedStatePrefix || DEFAULT_SHARED_STATE_PREFIX).trim();
    this.sharedStatePrefix = sharedPrefix || DEFAULT_SHARED_STATE_PREFIX;
    this.processedCache = new LRUCache<boolean>({
      maxSize: MAX_PERSISTED_MENTIONS,
      ttlMs: this.processedMentionTtlMs,
    });
    this.failureCache = new LRUCache<number>({
      maxSize: MAX_PERSISTED_MENTIONS,
      ttlMs: this.processedMentionTtlMs,
    });
    this.repliedConversationCache = new LRUCache<number>({
      maxSize: MAX_PERSISTED_CONVERSATIONS,
      ttlMs: this.conversationCooldownMs,
    });
    this.blockedUsernames = new Set(
      [...DEFAULT_BLOCKED_USERNAMES, ...(config.blockedUsernames ?? [])]
        .map(normalizeUsername)
        .filter(Boolean)
    );
    this.xTools = createXTools(config.twitter);

    log.info('Mention monitor initialized', {
      checkIntervalMs: config.checkIntervalMs,
      maxRepliesPerCycle: config.maxRepliesPerCycle,
      maxRepliesPerConversation: this.maxRepliesPerConversation,
      maxMentionRetries: this.maxMentionRetries,
      replyDelayMs: config.replyDelayMs,
      stateFilePath: this.stateFilePath,
      processedMentionTtlMs: this.processedMentionTtlMs,
      conversationCooldownMs: this.conversationCooldownMs,
      blockedUsernamesCount: this.blockedUsernames.size,
      sharedStateRedisEnabled: !!this.sharedStateRedisUrl,
      sharedStatePrefix: this.sharedStatePrefix,
    });
  }

  async start(): Promise<void> {
    if (this.running) {
      log.warn('Mention monitor already running');
      return;
    }

    this.running = true;
    log.info('Mention monitor starting', {
      startupDelayMs: this.config.startupDelayMs,
    });

    await this.loadState();
    await this.initializeSharedState();
    if (this.sharedStateAvailable) {
      await this.loadStateFromShared();
    }
    await this.primeCursorIfNeeded();

    // Delay first check to let the system stabilize after deploy
    if (this.config.startupDelayMs > 0) {
      log.info('Delaying first mention check', { delayMs: this.config.startupDelayMs });
      await new Promise((resolve) => setTimeout(resolve, this.config.startupDelayMs));
    }

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
    if (this.isChecking) {
      log.debug('Skipping mention check - already in progress');
      return;
    }

    this.isChecking = true;
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

      let highestHandledMentionId = this.lastMentionId;

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
        if (await this.isMentionProcessed(mention.id)) {
          log.debug('Skipping already processed mention', { mentionId: mention.id });
          highestHandledMentionId = this.maxMentionId(highestHandledMentionId, mention.id);
          metrics.incrementCounter('nika_mentions_skipped_processed');
          continue;
        }

        const conversationId = this.normalizeConversationId(mention.conversationId);
        let authorUsername = mention.authorUsername || 'unknown';
        if (!mention.authorUsername && mention.authorId) {
          authorUsername = mention.authorId;
        }

        if (this.isBlockedAuthor(authorUsername)) {
          log.info('Skipping mention from blocked author', {
            mentionId: mention.id,
            author: authorUsername,
          });
          await this.markMentionProcessed(mention.id);
          highestHandledMentionId = this.maxMentionId(highestHandledMentionId, mention.id);
          metrics.incrementCounter('nika_mentions_skipped_blocked_author');
          continue;
        }

        // Skip if this conversation hit the reply limit recently
        if (conversationId && await this.isConversationReplyLimitReached(conversationId)) {
          log.info('Skipping mention in conversation at reply cap', {
            mentionId: mention.id,
            conversationId,
          });
          await this.markMentionProcessed(mention.id);
          highestHandledMentionId = this.maxMentionId(highestHandledMentionId, mention.id);
          metrics.incrementCounter('nika_mentions_skipped_conversation');
          continue;
        }

        try {
          log.info('Processing mention', {
            mentionId: mention.id,
            author: authorUsername,
            preview: mention.text.slice(0, 50),
          });

          const authorId = typeof mention.authorId === 'string' ? mention.authorId : null;
          await this.config.onMention(mention.id, mention.text, authorUsername, authorId);

          // Mark as processed
          await this.markMentionProcessed(mention.id);
          if (conversationId) {
            await this.markConversationReplied(conversationId);
          }
          highestHandledMentionId = this.maxMentionId(highestHandledMentionId, mention.id);
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

          const attempt = this.incrementMentionFailureCount(mention.id);

          if (attempt >= this.maxMentionRetries) {
            log.error('Mention reached max retries, marking as processed', {
              mentionId: mention.id,
              attempt,
              maxMentionRetries: this.maxMentionRetries,
            });
            await this.markMentionProcessed(mention.id);
            highestHandledMentionId = this.maxMentionId(highestHandledMentionId, mention.id);
            metrics.incrementCounter('nika_mentions_failed_max_retries');
            continue;
          }

          log.warn('Mention processing failed; will retry in next cycle', {
            mentionId: mention.id,
            attempt,
            maxMentionRetries: this.maxMentionRetries,
          });
          metrics.incrementCounter('nika_mentions_retry_scheduled');

          // Stop processing newer mentions so sinceId does not skip this failed mention.
          break;
        }
      }

      if (highestHandledMentionId && highestHandledMentionId !== this.lastMentionId) {
        this.lastMentionId = highestHandledMentionId;
        this.stateDirty = true;
        await this.writeSharedLastMentionId(highestHandledMentionId);
      }

      const duration = Date.now() - startTime;
      metrics.recordHistogram('nika_mention_check_duration_ms', duration);
    } catch (error) {
      metrics.incrementCounter('nika_mention_check_errors');
      throw error;
    } finally {
      await this.persistStateIfDirty();
      this.isChecking = false;
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

    void this.persistStateIfDirty();
    void this.closeSharedState();

    log.info('Mention monitor stopped');
    metrics.incrementCounter('nika_mention_monitor_stopped');
    this.emit('stopped');
  }

  isRunning(): boolean {
    return this.running;
  }

  setLastMentionId(id: string): void {
    this.lastMentionId = id;
    this.stateDirty = true;
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

  private normalizeConversationId(value?: string): string | null {
    if (!value || typeof value !== 'string') {
      return null;
    }

    const conversationId = value.trim();
    if (!TWEET_ID_PATTERN.test(conversationId)) {
      return null;
    }
    return conversationId;
  }

  private maxMentionId(current: string | null, candidate: string): string {
    if (!TWEET_ID_PATTERN.test(candidate)) {
      return current || candidate;
    }
    if (!current || !TWEET_ID_PATTERN.test(current)) {
      return candidate;
    }

    try {
      return BigInt(candidate) > BigInt(current) ? candidate : current;
    } catch {
      return candidate > current ? candidate : current;
    }
  }

  private async markMentionProcessed(mentionId: string, at = Date.now()): Promise<void> {
    if (!TWEET_ID_PATTERN.test(mentionId)) {
      return;
    }

    this.failureCache.delete(mentionId);
    this.processedCache.set(mentionId, true, this.processedMentionTtlMs);
    this.processedMentions = this.upsertPersistedEntry(
      this.processedMentions,
      mentionId,
      at,
      MAX_PERSISTED_MENTIONS
    );
    this.stateDirty = true;

    if (!this.sharedStateAvailable || !this.sharedState) {
      return;
    }

    const key = this.sharedKey('processed', mentionId);
    try {
      await this.sharedState.set(key, String(at), { PX: this.processedMentionTtlMs });
    } catch (error) {
      log.warn('Failed to write processed mention to shared state', {
        mentionId,
        error: String(error),
      });
    }
  }

  private async markConversationReplied(conversationId: string, at = Date.now()): Promise<void> {
    const current = await this.getConversationReplyCount(conversationId);
    const next = Math.min(current + 1, this.maxRepliesPerConversation);

    this.repliedConversationCache.set(conversationId, next, this.conversationCooldownMs);
    this.repliedConversations = this.upsertPersistedConversationEntry(
      this.repliedConversations,
      conversationId,
      at,
      next,
      MAX_PERSISTED_CONVERSATIONS
    );
    this.stateDirty = true;

    if (!this.sharedStateAvailable || !this.sharedState) {
      return;
    }

    const key = this.sharedKey('conversation', conversationId);
    try {
      await this.sharedState.set(key, String(next), { PX: this.conversationCooldownMs });
    } catch (error) {
      log.warn('Failed to write conversation reply marker to shared state', {
        conversationId,
        error: String(error),
      });
    }
  }

  private incrementMentionFailureCount(mentionId: string): number {
    const current = this.failureCache.get(mentionId) || 0;
    const next = current + 1;
    this.failureCache.set(mentionId, next, this.processedMentionTtlMs);
    return next;
  }

  private upsertPersistedEntry(
    entries: PersistedEntry[],
    id: string,
    at: number,
    limit: number
  ): PersistedEntry[] {
    const next = entries.filter((entry) => entry.id !== id);
    next.unshift({ id, at });
    if (next.length > limit) {
      next.length = limit;
    }
    return next;
  }

  private upsertPersistedConversationEntry(
    entries: PersistedConversationEntry[],
    id: string,
    at: number,
    count: number,
    limit: number
  ): PersistedConversationEntry[] {
    const next = entries.filter((entry) => entry.id !== id);
    next.unshift({ id, at, count });
    if (next.length > limit) {
      next.length = limit;
    }
    return next;
  }

  private async primeCursorIfNeeded(): Promise<void> {
    if (this.lastMentionId) {
      return;
    }

    const getMentionsTool = this.xTools.find((t) => t.name === 'get_mentions');
    if (!getMentionsTool) {
      throw new Error('get_mentions tool not found');
    }

    const result = await withRetry(
      () => getMentionsTool.handler({ limit: 1 }),
      { maxAttempts: 3, initialDelayMs: 1000 }
    ) as ToolResult;

    if (!result.success || !result.data) {
      log.warn('Failed to prime mention cursor', { error: result.error });
      return;
    }

    const data = result.data as { mentions?: Mention[] };
    const latestMention = data.mentions?.[0];
    if (!latestMention?.id || !TWEET_ID_PATTERN.test(latestMention.id)) {
      return;
    }

    this.lastMentionId = latestMention.id;
    await this.markMentionProcessed(latestMention.id);
    await this.writeSharedLastMentionId(latestMention.id);
    await this.persistStateIfDirty();

    log.info('Mention cursor primed to latest mention; historical backlog will be skipped', {
      mentionId: latestMention.id,
    });
  }

  private async loadState(): Promise<void> {
    try {
      const raw = await fs.readFile(this.stateFilePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<MentionMonitorState>;
      if (!parsed || (parsed.version !== 1 && parsed.version !== 2)) {
        log.warn('Ignoring invalid mention monitor state');
        return;
      }

      if (typeof parsed.lastMentionId === 'string' && TWEET_ID_PATTERN.test(parsed.lastMentionId)) {
        this.lastMentionId = parsed.lastMentionId;
      }

      const now = Date.now();
      const mentionEntries = this.filterValidEntries(parsed.processedMentions);
      const conversationEntries =
        parsed.version === 2
          ? this.filterValidConversationEntries(parsed.repliedConversations)
          : this.filterValidEntries(parsed.repliedConversations).map((entry) => ({ ...entry, count: 1 }));

      for (const entry of mentionEntries) {
        const remainingTtl = this.processedMentionTtlMs - (now - entry.at);
        if (remainingTtl <= 0) {
          continue;
        }
        this.processedCache.set(entry.id, true, remainingTtl);
        this.processedMentions = this.upsertPersistedEntry(
          this.processedMentions,
          entry.id,
          entry.at,
          MAX_PERSISTED_MENTIONS
        );
      }

      for (const entry of conversationEntries) {
        const remainingTtl = this.conversationCooldownMs - (now - entry.at);
        if (remainingTtl <= 0) {
          continue;
        }
        this.repliedConversationCache.set(entry.id, entry.count, remainingTtl);
        this.repliedConversations = this.upsertPersistedConversationEntry(
          this.repliedConversations,
          entry.id,
          entry.at,
          entry.count,
          MAX_PERSISTED_CONVERSATIONS
        );
      }

      log.info('Loaded mention monitor state', {
        lastMentionId: this.lastMentionId,
        processedMentions: this.processedMentions.length,
        repliedConversations: this.repliedConversations.length,
      });
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err?.code === 'ENOENT') {
        log.info('Mention monitor state file not found; starting fresh');
        return;
      }
      log.warn('Failed to load mention monitor state', { error: String(error) });
    }
  }

  private async loadStateFromShared(): Promise<void> {
    const lastMentionId = await this.readSharedLastMentionId();
    if (lastMentionId && TWEET_ID_PATTERN.test(lastMentionId)) {
      this.lastMentionId = lastMentionId;
      log.info('Loaded mention cursor from shared state', { lastMentionId });
    }
  }

  private filterValidEntries(entries: unknown): PersistedEntry[] {
    if (!Array.isArray(entries)) {
      return [];
    }

    return entries
      .filter((entry): entry is PersistedEntry => {
        if (!entry || typeof entry !== 'object') {
          return false;
        }
        const candidate = entry as PersistedEntry;
        return TWEET_ID_PATTERN.test(candidate.id) && Number.isFinite(candidate.at);
      })
      .sort((a, b) => b.at - a.at);
  }

  private filterValidConversationEntries(entries: unknown): PersistedConversationEntry[] {
    if (!Array.isArray(entries)) {
      return [];
    }

    return entries
      .filter((entry): entry is PersistedConversationEntry => {
        if (!entry || typeof entry !== 'object') {
          return false;
        }
        const candidate = entry as PersistedConversationEntry;
        return (
          TWEET_ID_PATTERN.test(candidate.id) &&
          Number.isFinite(candidate.at) &&
          Number.isFinite(candidate.count) &&
          candidate.count >= 1
        );
      })
      .sort((a, b) => b.at - a.at);
  }

  private async persistStateIfDirty(): Promise<void> {
    if (!this.stateDirty) {
      return;
    }

    const state: MentionMonitorState = {
      version: 2,
      lastMentionId: this.lastMentionId,
      processedMentions: this.processedMentions,
      repliedConversations: this.repliedConversations,
      updatedAt: new Date().toISOString(),
    };

    try {
      if (this.lastMentionId) {
        await this.writeSharedLastMentionId(this.lastMentionId);
      }

      await fs.mkdir(path.dirname(this.stateFilePath), { recursive: true });
      const tmpFile = `${this.stateFilePath}.tmp`;
      await fs.writeFile(tmpFile, JSON.stringify(state, null, 2), 'utf8');
      await fs.rename(tmpFile, this.stateFilePath);
      this.stateDirty = false;
    } catch (error) {
      log.warn('Failed to persist mention monitor state', { error: String(error) });
    }
  }

  private sharedKey(kind: 'cursor' | 'processed' | 'conversation', id?: string): string {
    if (kind === 'cursor') {
      return `${this.sharedStatePrefix}:cursor`;
    }
    return `${this.sharedStatePrefix}:${kind}:${id}`;
  }

  private async initializeSharedState(): Promise<void> {
    if (!this.sharedStateRedisUrl) {
      return;
    }

    try {
      this.sharedState = createClient({ url: this.sharedStateRedisUrl });
      this.sharedState.on('error', (error) => {
        log.warn('Shared state Redis error', { error: String(error) });
      });
      await this.sharedState.connect();
      this.sharedStateAvailable = true;
      log.info('Shared state Redis connected');
    } catch (error) {
      this.sharedStateAvailable = false;
      this.sharedState = null;
      log.warn('Failed to initialize shared state Redis; falling back to local state', {
        error: String(error),
      });
    }
  }

  private async closeSharedState(): Promise<void> {
    if (!this.sharedState) {
      return;
    }

    try {
      if (this.sharedState.isOpen) {
        await this.sharedState.quit();
      }
    } catch (error) {
      log.warn('Failed to close shared state Redis connection', { error: String(error) });
      try {
        this.sharedState.disconnect();
      } catch {
        // Ignore disconnect errors during shutdown.
      }
    } finally {
      this.sharedStateAvailable = false;
      this.sharedState = null;
    }
  }

  private async readSharedLastMentionId(): Promise<string | null> {
    if (!this.sharedStateAvailable || !this.sharedState) {
      return null;
    }

    try {
      const value = await this.sharedState.get(this.sharedKey('cursor'));
      return value || null;
    } catch (error) {
      log.warn('Failed to read mention cursor from shared state', { error: String(error) });
      return null;
    }
  }

  private async writeSharedLastMentionId(lastMentionId: string): Promise<void> {
    if (!this.sharedStateAvailable || !this.sharedState) {
      return;
    }

    try {
      await this.sharedState.set(this.sharedKey('cursor'), lastMentionId);
    } catch (error) {
      log.warn('Failed to write mention cursor to shared state', {
        lastMentionId,
        error: String(error),
      });
    }
  }

  private async isMentionProcessed(mentionId: string): Promise<boolean> {
    if (this.processedCache.get(mentionId)) {
      return true;
    }

    if (!this.sharedStateAvailable || !this.sharedState) {
      return false;
    }

    try {
      const key = this.sharedKey('processed', mentionId);
      const exists = await this.sharedState.exists(key);
      if (exists) {
        this.processedCache.set(mentionId, true, this.processedMentionTtlMs);
        return true;
      }
      return false;
    } catch (error) {
      log.warn('Failed to read processed mention from shared state', {
        mentionId,
        error: String(error),
      });
      return false;
    }
  }

  private isBlockedAuthor(authorUsername: string): boolean {
    const normalized = normalizeUsername(authorUsername);
    return normalized ? this.blockedUsernames.has(normalized) : false;
  }

  private async getConversationReplyCount(conversationId: string): Promise<number> {
    const cached = this.repliedConversationCache.get(conversationId);
    if (cached !== undefined) {
      return cached;
    }

    if (!this.sharedStateAvailable || !this.sharedState) {
      return 0;
    }

    try {
      const key = this.sharedKey('conversation', conversationId);
      const raw = await this.sharedState.get(key);
      if (!raw) {
        return 0;
      }

      const n = Number.parseInt(raw, 10);
      if (!Number.isFinite(n) || n <= 0) {
        return 1;
      }

      // Backward compatibility: older versions stored "at" timestamps.
      return n > 100 ? 1 : n;
    } catch (error) {
      log.warn('Failed to read conversation marker from shared state', {
        conversationId,
        error: String(error),
      });
      return 0;
    }
  }

  private async isConversationReplyLimitReached(conversationId: string): Promise<boolean> {
    const count = await this.getConversationReplyCount(conversationId);
    if (count > 0) {
      this.repliedConversationCache.set(conversationId, count, this.conversationCooldownMs);
    }
    return count >= this.maxRepliesPerConversation;
  }
}

export interface CreateMentionMonitorOptions {
  twitter: XToolsConfig;
  checkIntervalMs: number;
  maxRepliesPerCycle?: number;
  maxRepliesPerConversation?: number;
  blockedUsernames?: string[];
  maxMentionRetries?: number;
  replyDelayMs?: number;
  startupDelayMs?: number;
  stateFilePath?: string;
  processedMentionTtlMs?: number;
  conversationCooldownMs?: number;
  sharedStateRedisUrl?: string;
  sharedStatePrefix?: string;
  onMention: (
    mentionId: string,
    mentionText: string,
    authorUsername: string,
    authorId: string | null
  ) => Promise<void>;
}

export function createMentionMonitor(options: CreateMentionMonitorOptions): MentionMonitor {
  return new MentionMonitor({
    twitter: options.twitter,
    checkIntervalMs: options.checkIntervalMs,
    maxRepliesPerCycle: options.maxRepliesPerCycle ?? 3,
    maxRepliesPerConversation: options.maxRepliesPerConversation,
    blockedUsernames: options.blockedUsernames,
    maxMentionRetries: options.maxMentionRetries ?? 3,
    replyDelayMs: options.replyDelayMs ?? 60000, // 1 minute between replies
    startupDelayMs: options.startupDelayMs ?? 30000, // 30s delay before first check
    stateFilePath: options.stateFilePath,
    processedMentionTtlMs: options.processedMentionTtlMs,
    conversationCooldownMs: options.conversationCooldownMs,
    sharedStateRedisUrl: options.sharedStateRedisUrl,
    sharedStatePrefix: options.sharedStatePrefix,
    onMention: options.onMention,
  });
}
