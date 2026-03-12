import { logger } from './logger';
import { startContextRefresh, stopContextRefresh } from './crypto-context';
import { startCacheCleanup, stopCacheCleanup } from './cache';
import { startMaintenanceSchedule, stopMaintenanceSchedule } from './maintenance';
import { startChallengeCleanup, stopChallengeCleanup } from './api/auth';
import { startRateLimitCleanup, stopRateLimitCleanup } from './api/middleware';
import { startMcpCleanup, stopMcpCleanup } from './mcp/index.js';
import { startPoCHRolloutEvaluator, stopPoCHRolloutEvaluator } from './api/routes/poch';
import { aggregateHourlySentiment, cleanupOldSentiment } from './sentiment';
import { cleanupOldImages } from './image-gen';
import { cleanupOldProcessedTweets } from './db';
import { cleanupOldInfluencerTweets } from './influencer-monitor';
import { cleanupOldPerformance, getGrowthStats } from './growth-tracker';
import { getEngagementStats } from './engagement-optimizer';
import { startBurnWorker, stopBurnWorker } from './burn-service';
import { startBuybackWorker, stopBuybackWorker } from './buyback-service';
import { startStakingReferralWorker, stopStakingReferralWorker } from './staking-referrals';

let operationalIntervals: NodeJS.Timeout[] = [];

function pushInterval(interval: NodeJS.Timeout): void {
  interval.unref?.();
  operationalIntervals.push(interval);
}

export function startCoreRuntimeSupport(): void {
  startContextRefresh();
  startCacheCleanup();
  startMaintenanceSchedule();
  startChallengeCleanup();
  startRateLimitCleanup();
  startMcpCleanup();
}

export function stopCoreRuntimeSupport(): void {
  stopContextRefresh();
  stopCacheCleanup();
  stopMaintenanceSchedule();
  stopChallengeCleanup();
  stopRateLimitCleanup();
  stopMcpCleanup();
}

export function startExtendedRuntimeSupport(): void {
  if (operationalIntervals.length === 0) {
    pushInterval(setInterval(aggregateHourlySentiment, 60 * 60 * 1000));
    pushInterval(setInterval(() => {
      cleanupOldSentiment();
      cleanupOldImages();
      cleanupOldProcessedTweets(7);
      cleanupOldInfluencerTweets();
      cleanupOldPerformance();
    }, 24 * 60 * 60 * 1000));
    pushInterval(setInterval(() => {
      const growth = getGrowthStats();
      const engagement = getEngagementStats();
      logger.info('Daily growth stats', {
        trackedPosts: growth.tracked,
        avgScore: growth.avgScore.toFixed(1),
        bestScore: growth.bestScore.toFixed(1),
        totalReplies: engagement.totalReplies,
      });
    }, 24 * 60 * 60 * 1000));
  }

  startBurnWorker();
  startBuybackWorker();
  startStakingReferralWorker();
  startPoCHRolloutEvaluator();
}

export function stopExtendedRuntimeSupport(): void {
  for (const interval of operationalIntervals) {
    clearInterval(interval);
  }
  operationalIntervals = [];

  stopBurnWorker();
  stopBuybackWorker();
  stopStakingReferralWorker();
  stopPoCHRolloutEvaluator();
}
