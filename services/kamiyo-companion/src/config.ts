/**
 * Centralized configuration
 * All environment variables validated and typed
 */

import { logger } from './logger';

// Parse integer with default and validation
function parseIntEnv(key: string, defaultValue: number, min?: number, max?: number): number {
  const raw = process.env[key];
  if (!raw) return defaultValue;

  const parsed = parseInt(raw, 10);
  if (isNaN(parsed)) {
    logger.warn(`Invalid integer for ${key}, using default`, { value: raw, default: defaultValue });
    return defaultValue;
  }

  if (min !== undefined && parsed < min) {
    logger.warn(`${key} below minimum, clamping`, { value: parsed, min });
    return min;
  }
  if (max !== undefined && parsed > max) {
    logger.warn(`${key} above maximum, clamping`, { value: parsed, max });
    return max;
  }

  return parsed;
}

// Data directory
export const DATA_DIR = process.env.DATA_DIR || './data';

// Engagement rate limits
export const ENGAGEMENT_CONFIG = {
  autoReplyEnabled: process.env.AUTO_REPLY_ENABLED !== 'false',
  autoReplyMinScore: parseIntEnv('AUTO_REPLY_MIN_SCORE', 7, 1, 10),
  maxRepliesPerHour: parseIntEnv('MAX_REPLIES_PER_HOUR', 4, 1, 20),
  maxQuotesPerDay: parseIntEnv('MAX_QUOTES_PER_DAY', 3, 1, 10),
};

// Timing constants (in milliseconds)
export const TIMING = {
  // Reply opportunity window (30 min)
  replyWindowMinutes: 30,
  replyWindowMs: 30 * 60 * 1000,

  // Quote tweet window (1-4 hours old)
  quoteMinAgeMs: 1 * 60 * 60 * 1000,
  quoteMaxAgeMs: 4 * 60 * 60 * 1000,

  // User cooldown (24 hours)
  userCooldownMs: 24 * 60 * 60 * 1000,

  // Trend cache TTL (30 min)
  trendCacheTtlMs: 30 * 60 * 1000,

  // Rate limit tracking
  hourMs: 60 * 60 * 1000,
  dayMs: 24 * 60 * 60 * 1000,

  // Monitoring intervals
  priority1IntervalMs: 10 * 60 * 1000,
  priority2IntervalMs: 30 * 60 * 1000,
  priority3IntervalMs: 60 * 60 * 1000,

  // Engagement loop intervals
  replyCycleMs: 5 * 60 * 1000,
  quoteCycleMs: 30 * 60 * 1000,

  // Post rate limit (2 hours min between posts)
  minPostIntervalMs: 2 * 60 * 60 * 1000,
};

// Thresholds
export const THRESHOLDS = {
  // Minimum engagement velocity for reply opportunity
  minEngagementVelocity: 5,

  // Minimum engagement score for quote tweets
  minQuoteEngagementScore: 500,

  // Max images to keep
  maxStoredImages: 50,

  // Performance data retention (30 days)
  performanceRetentionDays: 30,

  // Influencer tweet retention (7 days)
  influencerRetentionDays: 7,
};

// Approval modes
export type ApprovalMode = 'auto' | 'dm' | 'hybrid';
export const APPROVAL_MODE = (process.env.APPROVAL_MODE || 'hybrid') as ApprovalMode;
export const OWNER_TWITTER_ID = process.env.OWNER_TWITTER_ID;

// Log config on startup
logger.info('Configuration loaded', {
  dataDir: DATA_DIR,
  approvalMode: APPROVAL_MODE,
  autoReplyEnabled: ENGAGEMENT_CONFIG.autoReplyEnabled,
  maxRepliesPerHour: ENGAGEMENT_CONFIG.maxRepliesPerHour,
  maxQuotesPerDay: ENGAGEMENT_CONFIG.maxQuotesPerDay,
});
