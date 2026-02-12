import { createXTools } from '@kamiyo/agents';
import {
  createLogger,
  getMetrics,
  initializeMetrics,
  setLogLevel,
  initializeShutdownManager,
  getShutdownManager,
  getRateLimiter,
  initializeAlerting,
  alertError,
  alertCritical,
  alertWarning,
} from './lib';
import { validateConfig, getConfig, getRedactedConfig } from './config';
import { NikaAgent, createNikaAgent } from './nika-agent';
import { ProductionScheduler } from './scheduler';
import { DailyScheduler, type PostSlot } from './daily-scheduler';
import { HealthMonitor } from './health';
import { MentionMonitor, createMentionMonitor } from './mention-monitor';
import { createServer, Server, tweetsPosted, mentionsProcessed, agentDuration } from './server';
import { initializeDKGMemory, getDKGMemory, type DKGMemory } from './dkg-memory';
import { createEngagementTracker, type EngagementTracker } from './engagement-tracker';
import { createTaskCompletionPublisher, type TaskCompletionPublisher } from './task-completion-publisher';
import { initializeQualityGate } from './quality-gate';
import { initializeEngagementOptimizer, getEngagementOptimizer, type EngagementOptimizer } from './engagement-optimizer';
import { initializeTrendingMonitor, type TrendingMonitor } from './trending-monitor';
import { TopicEngine } from './topic-engine';
import { WorldContextGatherer } from './world-context';
import { PostOrchestrator } from './post-orchestrator';
import {
  postRelaunchAnnouncement,
  shouldPostRelaunchAnnouncement,
  hasAnnouncementBeenPosted,
} from './relaunch-announcement';
import { setXaiApiKey } from './x-mcp-server';
import { RepoKnowledgeMonitor, getRepoKnowledgeSnapshot } from './repo-knowledge';

const log = createLogger('nika');
const VERSION = '1.0.0';

// Global state
let agent: NikaAgent | null = null;
let dailyScheduler: DailyScheduler | null = null;
let mentionMonitor: MentionMonitor | null = null;
let health: HealthMonitor | null = null;
let server: Server | null = null;
let dkgMemory: DKGMemory | null = null;
let engagementTracker: EngagementTracker | null = null;
let engagementOptimizer: EngagementOptimizer | null = null;
let trendingMonitor: TrendingMonitor | null = null;
let taskPublisher: TaskCompletionPublisher | null = null;
let statusInterval: NodeJS.Timeout | null = null;
let repoKnowledgeMonitor: RepoKnowledgeMonitor | null = null;

async function validateConnections(config: ReturnType<typeof getConfig>): Promise<void> {
  log.info('Validating external connections');

  const VALIDATION_TIMEOUT_MS = 30000;

  // Validate Twitter credentials with timeout
  try {
    const xTools = createXTools({
      apiKey: config.TWITTER_API_KEY,
      apiSecret: config.TWITTER_API_SECRET,
      accessToken: config.TWITTER_ACCESS_TOKEN,
      accessSecret: config.TWITTER_ACCESS_SECRET,
    });

    const getUserTool = xTools.find((t) => t.name === 'get_user');
    if (!getUserTool) {
      throw new Error('get_user tool not found');
    }

    // Fetch configured user to validate credentials with timeout
    const result = await Promise.race([
      getUserTool.handler({ username: config.TWITTER_HANDLE }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Twitter validation timed out')), VALIDATION_TIMEOUT_MS)
      ),
    ]) as Awaited<ReturnType<typeof getUserTool.handler>>;

    if (!result.success) {
      throw new Error(`Twitter validation failed: ${result.error}`);
    }

    log.info('Twitter credentials validated', { username: (result.data as { username?: string })?.username });
  } catch (error) {
    throw new Error(`Twitter connection failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  log.info('External connections validated');
}

async function main(): Promise<void> {
  // Initialize shutdown manager first
  const shutdownManager = initializeShutdownManager(30000);

  // Initialize metrics
  initializeMetrics();
  const metrics = getMetrics();

  // Initialize rate limiter
  getRateLimiter();

  // Validate configuration
  const configResult = validateConfig();

  if (configResult.warnings.length > 0) {
    for (const warning of configResult.warnings) {
      log.warn('Configuration warning', { warning });
    }
  }

  if (!configResult.valid) {
    for (const error of configResult.errors) {
      log.error('Configuration error', { error });
    }
    process.exit(1);
  }

  const config = getConfig();
  setLogLevel(config.LOG_LEVEL);
  log.info('Configuration validated', getRedactedConfig());

  // Initialize xAI API key for image generation
  if (config.XAI_API_KEY) {
    setXaiApiKey(config.XAI_API_KEY);
    log.info('xAI image generation enabled');
  }

  // Initialize alerting
  if (config.ALERT_WEBHOOK_URL) {
    initializeAlerting({
      webhookUrl: config.ALERT_WEBHOOK_URL,
      webhookType: config.ALERT_WEBHOOK_TYPE,
      serviceName: 'nika',
      environment: config.NODE_ENV,
    });
    log.info('Alerting initialized', { type: config.ALERT_WEBHOOK_TYPE });
  }

  // Validate external connections before starting
  await validateConnections(config);

  // Initialize DKG memory (optional - continues without if fails)
  if (config.NIKA_PARANET_UAL || config.DKG_PRIVATE_KEY) {
    try {
      dkgMemory = await initializeDKGMemory(config);
      log.info('DKG memory initialized', {
        endpoint: config.DKG_ENDPOINT,
        blockchain: config.DKG_BLOCKCHAIN,
        paranetUAL: config.NIKA_PARANET_UAL || '(none)',
      });
    } catch (error) {
      log.warn('DKG memory initialization failed - continuing without', {
        error: String(error),
      });
      // Continue without DKG - not fatal
    }
  } else {
    log.info('DKG memory disabled (no paranet UAL or private key)');
  }

  // Initialize quality gate
  initializeQualityGate({
    anthropicApiKey: config.ANTHROPIC_API_KEY,
    enabled: true,
  });
  log.info('Quality gate initialized');

  repoKnowledgeMonitor = new RepoKnowledgeMonitor({
    enabled: config.NIKA_REPO_WATCH_ENABLED,
    intervalMs: config.NIKA_REPO_WATCH_INTERVAL_MS,
    repoRootHint: config.NIKA_REPO_ROOT,
    dkgMemory,
  });
  await repoKnowledgeMonitor.start();

  // Initialize engagement optimizer
  engagementOptimizer = initializeEngagementOptimizer({ dkgMemory: dkgMemory ?? undefined });
  try {
    await engagementOptimizer.initialize();
    log.info('Engagement optimizer initialized');
  } catch (error) {
    log.warn('Engagement optimizer initialization failed', { error: String(error) });
  }

  // Initialize trending monitor
  try {
    trendingMonitor = initializeTrendingMonitor({
      twitter: {
        apiKey: config.TWITTER_API_KEY,
        apiSecret: config.TWITTER_API_SECRET,
        accessToken: config.TWITTER_ACCESS_TOKEN,
        accessSecret: config.TWITTER_ACCESS_SECRET,
      },
      dkgMemory: dkgMemory ?? undefined,
      checkIntervalMs: 30 * 60 * 1000,
    });
    await trendingMonitor.start();
    log.info('Trending monitor started');
  } catch (error) {
    log.warn('Trending monitor failed to start', { error: String(error) });
  }

  // Initialize agent
  agent = createNikaAgent(config);
  log.info('Agent initialized', { dkgEnabled: !!dkgMemory });

  // Post relaunch announcement if enabled (one-time)
  if (shouldPostRelaunchAnnouncement() && !hasAnnouncementBeenPosted()) {
    try {
      const announcementResult = await postRelaunchAnnouncement({
        twitter: {
          apiKey: config.TWITTER_API_KEY,
          apiSecret: config.TWITTER_API_SECRET,
          accessToken: config.TWITTER_ACCESS_TOKEN,
          accessSecret: config.TWITTER_ACCESS_SECRET,
        },
      });
      log.info('Relaunch announcement posted', {
        tweetId: announcementResult.tweetId,
        variant: announcementResult.variant,
      });
    } catch (error) {
      log.error('Failed to post relaunch announcement', { error: String(error) });
      // Don't fail startup - this is optional
    }
  }

  // Initialize health monitor
  health = new HealthMonitor();
  health.on('warning', (warnings: string[]) => {
    log.warn('Health warning', { warnings });
  });
  health.start();
  log.info('Health monitor started');

  // Register health monitor shutdown
  shutdownManager.register('health', async () => {
    health?.stop();
    health?.removeAllListeners();
  }, 30);

  // Initialize mention monitor
  mentionMonitor = createMentionMonitor({
    twitter: {
      apiKey: config.TWITTER_API_KEY,
      apiSecret: config.TWITTER_API_SECRET,
      accessToken: config.TWITTER_ACCESS_TOKEN,
      accessSecret: config.TWITTER_ACCESS_SECRET,
    },
    checkIntervalMs: 5 * 60 * 1000, // 5 minutes
    maxRepliesPerCycle: 2, // Max 2 replies per cycle
    maxMentionRetries: config.MENTION_MAX_RETRIES,
    replyDelayMs: 5 * 60 * 1000, // 5 minutes between replies
    stateFilePath: config.NIKA_MENTION_STATE_FILE || undefined,
    processedMentionTtlMs: config.MENTION_PROCESSED_TTL_MS,
    conversationCooldownMs: config.MENTION_CONVERSATION_COOLDOWN_MS,
    sharedStateRedisUrl: config.SHARED_STATE_REDIS_URL || undefined,
    sharedStatePrefix: config.SHARED_STATE_PREFIX,
    onMention: async (mentionId, mentionText, authorUsername) => {
      if (!agent) return;
      if (shutdownManager.isShutdown()) {
        log.warn('Skipping mention during shutdown', { mentionId });
        return;
      }

      const complete = shutdownManager.trackOperation(
        `reply-${mentionId}`,
        `Replying to @${authorUsername}`
      );

      const startTime = Date.now();
      try {
        const result = await agent.generateReply(mentionId, mentionText, authorUsername);

        // Actually post the reply to Twitter
        const replyId = await agent.replyToTweet(mentionId, result.reply);

        log.info('Replied to mention', {
          mentionId,
          replyId,
          replyLength: result.reply.length,
        });
        health?.recordTweet();
        metrics.incrementCounter('nika_mentions_replied');
        mentionsProcessed.inc({ status: 'success' });
        agentDuration.observe({ operation: 'reply' }, (Date.now() - startTime) / 1000);
      } catch (error) {
        log.error('Failed to reply to mention', { mentionId, error: String(error) });
        health?.recordError();
        mentionsProcessed.inc({ status: 'error' });
        throw error;
      } finally {
        complete();
      }
    },
  });

  mentionMonitor.on('error', (error) => {
    log.error('Mention monitor error', { error: String(error) });
    health?.recordError();
  });

  await mentionMonitor.start();
  log.info('Mention monitor started');

  // Register mention monitor shutdown
  shutdownManager.register('mentionMonitor', async () => {
    mentionMonitor?.stop();
    mentionMonitor?.removeAllListeners();
  }, 20);

  shutdownManager.register('repoKnowledgeMonitor', async () => {
    repoKnowledgeMonitor?.stop();
  }, 21);

  // Initialize topic engine, world context gatherer, and post orchestrator
  const topicEngine = new TopicEngine({
    anthropicApiKey: config.ANTHROPIC_API_KEY,
    optimizer: engagementOptimizer,
    dkgMemory,
  });

  const worldContextGatherer = new WorldContextGatherer({
    twitter: {
      apiKey: config.TWITTER_API_KEY,
      apiSecret: config.TWITTER_API_SECRET,
      accessToken: config.TWITTER_ACCESS_TOKEN,
      accessSecret: config.TWITTER_ACCESS_SECRET,
    },
    trendingMonitor,
    thoughtleaderAccounts: config.THOUGHTLEADER_ACCOUNTS,
  });

  const orchestrator = new PostOrchestrator({
    topicEngine,
    worldContext: worldContextGatherer,
    optimizer: engagementOptimizer,
    dkgMemory,
  });

  log.info('Post orchestration pipeline initialized');

  // Initialize daily scheduler (twice-daily posting)
  dailyScheduler = new DailyScheduler({
    twitter: {
      apiKey: config.TWITTER_API_KEY,
      apiSecret: config.TWITTER_API_SECRET,
      accessToken: config.TWITTER_ACCESS_TOKEN,
      accessSecret: config.TWITTER_ACCESS_SECRET,
    },
    twitterHandle: config.TWITTER_HANDLE,
    morningWindow: [config.MORNING_WINDOW_START_UTC, config.MORNING_WINDOW_END_UTC],
    eveningWindow: [config.EVENING_WINDOW_START_UTC, config.EVENING_WINDOW_END_UTC],
    onTick: async (slot: PostSlot) => {
      if (!agent) return;
      if (shutdownManager.isShutdown()) {
        log.warn('Skipping scheduled post during shutdown');
        return;
      }

      const complete = shutdownManager.trackOperation(
        `post-${slot}-${Date.now()}`,
        `Generating ${slot} post`
      );

      const startTime = Date.now();
      try {
        // Plan the post with full orchestration
        const plan = await orchestrator.planPost(slot);
        const result = await agent.generatePost({ orchestrated: plan });

        // Post the tweet to Twitter
        const tweetId = await agent.postTweet(result.tweet);

        // Record in engagement optimizer
        const optimizer = getEngagementOptimizer();
        if (optimizer) {
          optimizer.recordPerformance({
            tweetId,
            mood: result.mood,
            tweetType: result.tweetType,
            tweetStyle: result.tweetStyle,
            topics: [],
            postedAt: new Date(),
            metrics: { likes: 0, retweets: 0, replies: 0, quotes: 0 },
            engagementScore: 0,
          });
        }

        log.info('Scheduled post complete', {
          tweetId,
          slot,
          preview: result.tweet.slice(0, 50),
          mood: result.mood,
          type: result.tweetType,
          style: result.tweetStyle,
          category: plan.topicPlan.category,
          durationMs: result.durationMs,
        });

        health?.recordTweet();
        tweetsPosted.inc({ type: result.tweetType });
        agentDuration.observe({ operation: 'post' }, (Date.now() - startTime) / 1000);
      } finally {
        complete();
      }
    },
    onError: (error, slot) => {
      health?.recordError();
      metrics.incrementCounter('nika_scheduled_post_errors');
      tweetsPosted.inc({ type: 'error' });
      log.error('Scheduled post failed', { error: error.message, slot });
    },
  });

  dailyScheduler.on('alert', (message: string) => {
    log.error('Scheduler alert', { message });
    alertError('Scheduler Alert', message, 'scheduler').catch(() => {
      // Ignore alert send failures
    });
  });

  await dailyScheduler.start();
  log.info('Daily scheduler started', {
    morningWindow: `${config.MORNING_WINDOW_START_UTC}:00-${config.MORNING_WINDOW_END_UTC}:00 UTC`,
    eveningWindow: `${config.EVENING_WINDOW_START_UTC}:00-${config.EVENING_WINDOW_END_UTC}:00 UTC`,
  });

  // Register scheduler shutdown
  shutdownManager.register('dailyScheduler', async () => {
    dailyScheduler?.stop();
    dailyScheduler?.removeAllListeners();
  }, 10);

  // Register trending monitor shutdown
  shutdownManager.register('trendingMonitor', async () => {
    trendingMonitor?.stop();
  }, 12);

  // Initialize engagement tracker (only if DKG is enabled)
  if (dkgMemory) {
    engagementTracker = createEngagementTracker(
      {
        apiKey: config.TWITTER_API_KEY,
        apiSecret: config.TWITTER_API_SECRET,
        accessToken: config.TWITTER_ACCESS_TOKEN,
        accessSecret: config.TWITTER_ACCESS_SECRET,
      },
      { intervalMs: 30 * 60 * 1000 } // 30 minutes
    );
    await engagementTracker.start();
    log.info('Engagement tracker started');

    shutdownManager.register('engagementTracker', async () => {
      engagementTracker?.stop();
    }, 15);

    // Initialize TaskCompletion publisher for DKG leaderboard
    taskPublisher = createTaskCompletionPublisher(config);
    await taskPublisher.start();
    log.info('TaskCompletion publisher started');

    shutdownManager.register('taskPublisher', async () => {
      taskPublisher?.stop();
    }, 14);
  }

  // Initialize HTTP server
  server = createServer({
    port: config.PORT,
    getHealth: () => ({
      healthy: health?.getStatus().healthy ?? false,
      uptime: health?.getUptime() ?? 0,
      version: VERSION,
      components: {
        scheduler: {
          running: dailyScheduler?.isRunning() ?? false,
          consecutiveFailures: dailyScheduler?.getHealthStatus().consecutiveFailures ?? 0,
          ...(dailyScheduler?.getHealthStatus() ?? {}),
        },
        mentionMonitor: {
          running: mentionMonitor?.isRunning() ?? false,
          lastCheckAt: mentionMonitor?.getLastCheckAt()?.getTime() ?? null,
        },
        circuitBreaker: agent?.getCircuitStatus() ?? { posting: 'unknown', replies: 'unknown', dkg: 'unknown' },
        dkg: {
          enabled: !!dkgMemory,
          circuitStatus: dkgMemory?.getCircuitStatus() ?? 'disabled',
          activePort: dkgMemory?.getActivePort?.() ?? null,
        },
        engagementTracker: {
          running: engagementTracker?.isRunning() ?? false,
        },
        taskPublisher: {
          running: taskPublisher?.isRunning() ?? false,
          published: taskPublisher?.getStats().published ?? 0,
        },
        repoKnowledge: {
          running: repoKnowledgeMonitor?.isRunning() ?? false,
          lastUpdateAt: getRepoKnowledgeSnapshot()?.generatedAt ?? null,
          commit: getRepoKnowledgeSnapshot()?.commitSha ?? null,
        },
      },
    }),
    getReadiness: async () => {
      const schedulerOk = dailyScheduler?.isRunning() ?? false;
      const mentionMonitorOk = mentionMonitor?.isRunning() ?? false;

      // DKG is optional - not required for readiness
      const dkgOk = !dkgMemory || dkgMemory.getCircuitStatus() !== 'open';

      return {
        ready: schedulerOk && mentionMonitorOk,
        checks: {
          twitter: { ok: mentionMonitorOk, error: mentionMonitorOk ? undefined : 'Not running' },
          anthropic: { ok: true }, // Validated at startup
          dkg: { ok: dkgOk, error: dkgOk ? undefined : 'Circuit open' },
        },
      };
    },
  });

  await server.start();
  log.info('HTTP server started', { port: config.PORT });

  // Register server shutdown (first to stop accepting requests)
  shutdownManager.register('server', async () => {
    await server?.stop();
  }, 1);

  // Setup graceful shutdown
  const handleShutdown = async (signal: string, exitCode = 0) => {
    await shutdownManager.shutdown(signal);
    process.exit(exitCode);
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM', 0));
  process.on('SIGINT', () => handleShutdown('SIGINT', 0));

  process.on('uncaughtException', async (error) => {
    log.error('Uncaught exception', { error: error.message, stack: error.stack });
    metrics.incrementCounter('nika_uncaught_exceptions');
    await alertCritical('Uncaught Exception', error.message, 'process').catch(() => {});
    await handleShutdown('uncaughtException', 1);
  });

  process.on('unhandledRejection', (reason) => {
    log.error('Unhandled rejection', { reason: String(reason) });
    metrics.incrementCounter('nika_unhandled_rejections');
    alertWarning('Unhandled Rejection', String(reason), 'process').catch(() => {});
  });

  log.info('Nika service started', {
    version: VERSION,
    port: config.PORT,
    postsPerDay: config.POSTS_PER_DAY,
    morningWindow: `${config.MORNING_WINDOW_START_UTC}:00-${config.MORNING_WINDOW_END_UTC}:00 UTC`,
    eveningWindow: `${config.EVENING_WINDOW_START_UTC}:00-${config.EVENING_WINDOW_END_UTC}:00 UTC`,
    mentionCheckInterval: '5m',
    maxRepliesPerCycle: 2,
  });

  // Log metrics periodically
  statusInterval = setInterval(() => {
    const healthStatus = health?.getStatus();
    const schedulerStatus = dailyScheduler?.getHealthStatus();
    const rateLimiter = getRateLimiter();

    log.info('Status update', {
      healthy: healthStatus?.healthy,
      uptime: health?.getUptimeFormatted(),
      tweetCount24h: healthStatus?.metrics.tweetCount24h,
      schedulerRunning: schedulerStatus?.running,
      consecutiveFailures: schedulerStatus?.consecutiveFailures,
      todaySlots: schedulerStatus?.todaySlots,
      circuitStatus: agent?.getCircuitStatus(),
      rateLimited: rateLimiter.isAnyLimited(),
      inFlightOps: getShutdownManager().getInFlightCount(),
      repoKnowledgeUpdatedAt: getRepoKnowledgeSnapshot()?.generatedAt ?? null,
    });
  }, 5 * 60 * 1000);

  // Register status interval cleanup
  shutdownManager.register('statusInterval', async () => {
    if (statusInterval) {
      clearInterval(statusInterval);
      statusInterval = null;
    }
  }, 50);
}

// Export for testing
export { NikaAgent, createNikaAgent, ProductionScheduler, HealthMonitor, MentionMonitor };

// Export new Claude Agent SDK implementation
export { NikaAgentSDK, createNikaAgentSDK } from './nika-agent-sdk';
export { createXMcpServer, X_MCP_TOOL_NAMES } from './x-mcp-server';

// Export Phase 2: dRAG (Decentralized RAG) with vector embeddings
export { NikaDRAG, initializeDRAG, getDRAG } from './drag';
export type { SemanticSearchResult, EmbeddingVector, DRAGConfig } from './drag';

// Export Phase 2: SPARQL generation from natural language
export { SPARQLGenerator, initializeSPARQLGenerator, getSPARQLGenerator } from './sparql-generator';
export type { SPARQLGenerationResult, QueryResult, SPARQLGeneratorConfig } from './sparql-generator';

// Export Phase 3: Engagement-driven optimization
export { EngagementOptimizer, initializeEngagementOptimizer, getEngagementOptimizer } from './engagement-optimizer';
export type { TweetPerformance, ParameterStats, EngagementOptimizerConfig } from './engagement-optimizer';

// Export Quality Gate
export { shouldTweet, requiresQualityCheck, initializeQualityGate, isQualityGateEnabled } from './quality-gate';
export type { QualityCheckResult, QualityGateConfig } from './quality-gate';

// Export Phase 4: Full KAMIYO protocol tools
export { createProtocolMcpServer, PROTOCOL_MCP_TOOL_NAMES } from './protocol-tools-mcp';
export type { ProtocolMcpConfig, ProtocolMcpToolName } from './protocol-tools-mcp';

// Export Phase 5: Trending topic awareness
export { TrendingMonitor, initializeTrendingMonitor, getTrendingMonitor } from './trending-monitor';
export type { TrendingTopic, CommentaryOpportunity, TrendingMonitorConfig } from './trending-monitor';

// Export relaunch announcement
export {
  postRelaunchAnnouncement,
  shouldPostRelaunchAnnouncement,
  hasAnnouncementBeenPosted,
  markAnnouncementPosted,
} from './relaunch-announcement';
export type { RelaunchAnnouncementConfig, RelaunchAnnouncementResult } from './relaunch-announcement';

// Export DKG query tools
export {
  queryKnowledge,
  getAgentReputation,
  findProviders,
  getQueryCircuitStatus,
} from './dkg-query-tools';
export type {
  KnowledgeQueryResult,
  AgentReputationResult,
  ProviderResult,
} from './dkg-query-tools';

// Export Market Intel Monitor
export { MarketIntelMonitor, createMarketIntelMonitor } from './market-intel-monitor';
export type { MarketIntel, MarketIntelMonitorConfig } from './market-intel-monitor';

// Export TaskCompletion Publisher (DKG Leaderboard)
export { TaskCompletionPublisher, createTaskCompletionPublisher, getTaskCompletionPublisher } from './task-completion-publisher';
export type { TaskCompletionPublisherConfig } from './task-completion-publisher';

// Main entry point
main().catch((error) => {
  log.error('Fatal error', { error: error.message, stack: error.stack });
  process.exit(1);
});
