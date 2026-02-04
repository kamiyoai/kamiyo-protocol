/**
 * Nika (二化) X-Bot Service
 *
 * Part of KAMIYO Protocol. Uses @kamiyo/agents with X tools.
 */

import { createLogger, getMetrics, initializeMetrics, setLogLevel } from './lib';
import { validateConfig, getConfig, getRedactedConfig } from './config';
import { NikaAgent, createNikaAgent } from './nika-agent';
import { ProductionScheduler } from './scheduler';
import { HealthMonitor } from './health';
import { MentionMonitor, createMentionMonitor } from './mention-monitor';

const log = createLogger('nika');

// Global state
let agent: NikaAgent | null = null;
let scheduler: ProductionScheduler | null = null;
let mentionMonitor: MentionMonitor | null = null;
let health: HealthMonitor | null = null;
let isShuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    log.warn('Shutdown already in progress');
    return;
  }

  isShuttingDown = true;
  log.info('Shutting down', { signal });

  scheduler?.stop();
  scheduler?.removeAllListeners();

  mentionMonitor?.stop();
  mentionMonitor?.removeAllListeners();

  health?.stop();
  health?.removeAllListeners();

  log.info('Shutdown complete');
  process.exit(0);
}

async function main(): Promise<void> {
  // Initialize metrics
  initializeMetrics();
  const metrics = getMetrics();

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

  // Initialize agent
  agent = createNikaAgent(config);
  log.info('Agent initialized');

  // Initialize health monitor
  health = new HealthMonitor();
  health.on('warning', (warnings: string[]) => {
    log.warn('Health warning', { warnings });
  });
  health.start();
  log.info('Health monitor started');

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

      try {
        const result = await agent.generateReply(mentionId, mentionText, authorUsername);
        log.info('Replied to mention', {
          mentionId,
          replyLength: result.reply.length,
        });
        health?.recordTweet();
        metrics.incrementCounter('nika_mentions_replied');
      } catch (error) {
        log.error('Failed to reply to mention', { mentionId, error: String(error) });
        health?.recordError();
        throw error;
      }
    }
  );

  mentionMonitor.on('error', (error) => {
    log.error('Mention monitor error', { error: String(error) });
    health?.recordError();
  });

  await mentionMonitor.start();
  log.info('Mention monitor started');

  // Initialize scheduler
  scheduler = new ProductionScheduler({
    minIntervalMs: config.POST_INTERVAL_MIN_MS,
    maxIntervalMs: config.POST_INTERVAL_MAX_MS,
    onTick: async () => {
      if (!agent) return;

      const result = await agent.generatePost();
      log.info('Scheduled post complete', {
        preview: result.tweet.slice(0, 50),
        mood: result.mood,
        type: result.tweetType,
        style: result.tweetStyle,
        durationMs: result.durationMs,
      });

      health?.recordTweet();
    },
    onError: (error) => {
      health?.recordError();
      metrics.incrementCounter('nika_scheduled_post_errors');
      log.error('Scheduled post failed', { error: error.message });
    },
  });

  scheduler.on('alert', (message: string) => {
    log.error('Scheduler alert', { message });
  });

  await scheduler.start();
  log.info('Scheduler started');

  // Setup graceful shutdown
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('uncaughtException', async (error) => {
    log.error('Uncaught exception', { error: error.message, stack: error.stack });
    metrics.incrementCounter('nika_uncaught_exceptions');
    await shutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason) => {
    log.error('Unhandled rejection', { reason: String(reason) });
    metrics.incrementCounter('nika_unhandled_rejections');
  });

  log.info('Nika service started', {
    postIntervalMin: `${config.POST_INTERVAL_MIN_MS / (60 * 60 * 1000)}h`,
    postIntervalMax: `${config.POST_INTERVAL_MAX_MS / (60 * 60 * 1000)}h`,
    mentionCheckInterval: '5m',
  });

  // Log metrics periodically
  setInterval(() => {
    const healthStatus = health?.getStatus();
    const schedulerStatus = scheduler?.getHealthStatus();

    log.info('Status update', {
      healthy: healthStatus?.healthy,
      uptime: health?.getUptimeFormatted(),
      tweetCount24h: healthStatus?.metrics.tweetCount24h,
      schedulerRunning: schedulerStatus?.running,
      consecutiveFailures: schedulerStatus?.consecutiveFailures,
      circuitStatus: agent?.getCircuitStatus(),
    });
  }, 5 * 60 * 1000);
}

// Export for testing
export { NikaAgent, createNikaAgent, ProductionScheduler, HealthMonitor, MentionMonitor };

// Main entry point
main().catch((error) => {
  log.error('Fatal error', { error: error.message, stack: error.stack });
  process.exit(1);
});
