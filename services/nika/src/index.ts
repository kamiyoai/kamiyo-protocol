/**
 * Nika (二化) X-Bot Service
 *
 * Part of KAMIYO Protocol. Uses @kamiyo/agents with X tools.
 */

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
import { HealthMonitor } from './health';
import { MentionMonitor, createMentionMonitor } from './mention-monitor';
import { createServer, Server, tweetsPosted, mentionsProcessed, agentDuration } from './server';
import { initializeDKGMemory, getDKGMemory, type DKGMemory } from './dkg-memory';
import { createEngagementTracker, type EngagementTracker } from './engagement-tracker';
import { initializeQualityGate } from './quality-gate';
import {
  postRelaunchAnnouncement,
  shouldPostRelaunchAnnouncement,
  hasAnnouncementBeenPosted,
} from './relaunch-announcement';

const log = createLogger('nika');
const VERSION = '1.0.0';

// Global state
let agent: NikaAgent | null = null;
let scheduler: ProductionScheduler | null = null;
let mentionMonitor: MentionMonitor | null = null;
let health: HealthMonitor | null = null;
let server: Server | null = null;
let dkgMemory: DKGMemory | null = null;
let engagementTracker: EngagementTracker | null = null;

/**
 * Validate external service connections at startup.
 */
async function validateConnections(config: ReturnType<typeof getConfig>): Promise<void> {
  log.info('Validating external connections');

  // Validate Twitter credentials
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

    // Fetch configured user to validate credentials
    const result = await getUserTool.handler({ username: config.TWITTER_HANDLE });
    if (!result.success) {
      throw new Error(`Twitter validation failed: ${result.error}`);
    }

    log.info('Twitter credentials validated', { username: (result.data as { username?: string })?.username });
  } catch (error) {
    throw new Error(`Twitter connection failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Note: Anthropic validation happens on first agent call
  // Could add explicit validation here if needed

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
  mentionMonitor = createMentionMonitor(
    {
      apiKey: config.TWITTER_API_KEY,
      apiSecret: config.TWITTER_API_SECRET,
      accessToken: config.TWITTER_ACCESS_TOKEN,
      accessSecret: config.TWITTER_ACCESS_SECRET,
    },
    5 * 60 * 1000, // 5 minutes
    async (mentionId, mentionText, authorUsername) => {
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
        log.info('Replied to mention', {
          mentionId,
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
    }
  );

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

  // Initialize scheduler
  scheduler = new ProductionScheduler({
    minIntervalMs: config.POST_INTERVAL_MIN_MS,
    maxIntervalMs: config.POST_INTERVAL_MAX_MS,
    onTick: async () => {
      if (!agent) return;
      if (shutdownManager.isShutdown()) {
        log.warn('Skipping scheduled post during shutdown');
        return;
      }

      const complete = shutdownManager.trackOperation(
        `post-${Date.now()}`,
        'Generating scheduled post'
      );

      const startTime = Date.now();
      try {
        const result = await agent.generatePost();
        log.info('Scheduled post complete', {
          preview: result.tweet.slice(0, 50),
          mood: result.mood,
          type: result.tweetType,
          style: result.tweetStyle,
          durationMs: result.durationMs,
        });

        health?.recordTweet();
        tweetsPosted.inc({ type: result.tweetType });
        agentDuration.observe({ operation: 'post' }, (Date.now() - startTime) / 1000);
      } finally {
        complete();
      }
    },
    onError: (error) => {
      health?.recordError();
      metrics.incrementCounter('nika_scheduled_post_errors');
      tweetsPosted.inc({ type: 'error' });
      log.error('Scheduled post failed', { error: error.message });
    },
  });

  scheduler.on('alert', (message: string) => {
    log.error('Scheduler alert', { message });
    alertError('Scheduler Alert', message, 'scheduler').catch(() => {
      // Ignore alert send failures
    });
  });

  await scheduler.start();
  log.info('Scheduler started');

  // Register scheduler shutdown
  shutdownManager.register('scheduler', async () => {
    scheduler?.stop();
    scheduler?.removeAllListeners();
  }, 10);

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
          running: scheduler?.isRunning() ?? false,
          consecutiveFailures: scheduler?.getHealthStatus().consecutiveFailures ?? 0,
        },
        mentionMonitor: {
          running: mentionMonitor?.isRunning() ?? false,
          lastCheckAt: mentionMonitor?.getLastCheckAt()?.getTime() ?? null,
        },
        circuitBreaker: agent?.getCircuitStatus() ?? { twitter: 'unknown', dkg: 'unknown' },
        dkg: {
          enabled: !!dkgMemory,
          circuitStatus: dkgMemory?.getCircuitStatus() ?? 'disabled',
        },
        engagementTracker: {
          running: engagementTracker?.isRunning() ?? false,
        },
      },
    }),
    getReadiness: async () => {
      // For now, just check that components are running
      const schedulerOk = scheduler?.isRunning() ?? false;
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
  const handleShutdown = async (signal: string) => {
    await shutdownManager.shutdown(signal);
    process.exit(0);
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));

  process.on('uncaughtException', async (error) => {
    log.error('Uncaught exception', { error: error.message, stack: error.stack });
    metrics.incrementCounter('nika_uncaught_exceptions');
    await alertCritical('Uncaught Exception', error.message, 'process').catch(() => {});
    await handleShutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason) => {
    log.error('Unhandled rejection', { reason: String(reason) });
    metrics.incrementCounter('nika_unhandled_rejections');
    alertWarning('Unhandled Rejection', String(reason), 'process').catch(() => {});
  });

  log.info('Nika service started', {
    version: VERSION,
    port: config.PORT,
    postIntervalMin: `${config.POST_INTERVAL_MIN_MS / (60 * 60 * 1000)}h`,
    postIntervalMax: `${config.POST_INTERVAL_MAX_MS / (60 * 60 * 1000)}h`,
    mentionCheckInterval: '5m',
  });

  // Log metrics periodically
  setInterval(() => {
    const healthStatus = health?.getStatus();
    const schedulerStatus = scheduler?.getHealthStatus();
    const rateLimiter = getRateLimiter();

    log.info('Status update', {
      healthy: healthStatus?.healthy,
      uptime: health?.getUptimeFormatted(),
      tweetCount24h: healthStatus?.metrics.tweetCount24h,
      schedulerRunning: schedulerStatus?.running,
      consecutiveFailures: schedulerStatus?.consecutiveFailures,
      circuitStatus: agent?.getCircuitStatus(),
      rateLimited: rateLimiter.isAnyLimited(),
      inFlightOps: getShutdownManager().getInFlightCount(),
    });
  }, 5 * 60 * 1000);
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

// Main entry point
main().catch((error) => {
  log.error('Fatal error', { error: error.message, stack: error.stack });
  process.exit(1);
});
