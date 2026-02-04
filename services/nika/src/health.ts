/**
 * Health Monitor for Nika
 */

import { EventEmitter } from 'events';
import { createLogger, getMetrics } from './lib';

const log = createLogger('nika:health');
const metrics = getMetrics();

export interface HealthMetrics {
  lastTweetAt: number;
  lastDKGWriteAt: number;
  lastDKGQueryAt: number;
  lastMentionCheckAt: number;
  consecutiveErrors: number;
  uptimeStart: number;
  tweetCount24h: number;
  errorCount24h: number;
  dkgWriteCount24h: number;
}

export interface HealthStatus {
  healthy: boolean;
  warnings: string[];
  metrics: HealthMetrics;
}

export class HealthMonitor extends EventEmitter {
  private healthMetrics: HealthMetrics;
  private checkInterval: NodeJS.Timeout | null = null;
  private dailyResetInterval: NodeJS.Timeout | null = null;
  private midnightTimeout: NodeJS.Timeout | null = null;
  private checkIntervalMs = 60 * 1000;

  private maxHoursSincePost = 6;
  private maxHoursSinceDKG = 2;
  private maxConsecutiveErrors = 3;
  private maxHoursSinceMentionCheck = 1;

  constructor() {
    super();
    this.healthMetrics = {
      lastTweetAt: 0,
      lastDKGWriteAt: 0,
      lastDKGQueryAt: 0,
      lastMentionCheckAt: 0,
      consecutiveErrors: 0,
      uptimeStart: Date.now(),
      tweetCount24h: 0,
      errorCount24h: 0,
      dkgWriteCount24h: 0,
    };

    log.info('Health monitor initialized');
  }

  start(): void {
    log.info('Health monitor starting', { checkIntervalMs: this.checkIntervalMs });

    this.checkInterval = setInterval(() => {
      this.runHealthCheck();
    }, this.checkIntervalMs);

    const now = new Date();
    const msUntilMidnight =
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).getTime() -
      now.getTime();

    this.midnightTimeout = setTimeout(() => {
      this.resetDailyCounters();
      this.dailyResetInterval = setInterval(() => {
        this.resetDailyCounters();
      }, 24 * 60 * 60 * 1000);
    }, msUntilMidnight);

    this.runHealthCheck();
    this.emit('started');
    metrics.incrementCounter('nika_health_monitor_started');
  }

  private runHealthCheck(): void {
    const now = Date.now();
    const warnings: string[] = [];

    if (this.healthMetrics.lastTweetAt > 0) {
      const hoursSincePost = (now - this.healthMetrics.lastTweetAt) / (1000 * 60 * 60);
      if (hoursSincePost > this.maxHoursSincePost) {
        warnings.push(`No tweets in ${hoursSincePost.toFixed(1)} hours`);
      }
      metrics.recordGauge('nika_hours_since_tweet', hoursSincePost);
    }

    const lastDKGActivity = Math.max(
      this.healthMetrics.lastDKGWriteAt,
      this.healthMetrics.lastDKGQueryAt
    );
    if (lastDKGActivity > 0) {
      const hoursSinceDKG = (now - lastDKGActivity) / (1000 * 60 * 60);
      if (hoursSinceDKG > this.maxHoursSinceDKG) {
        warnings.push(`No DKG activity in ${hoursSinceDKG.toFixed(1)} hours`);
      }
      metrics.recordGauge('nika_hours_since_dkg', hoursSinceDKG);
    }

    if (this.healthMetrics.lastMentionCheckAt > 0) {
      const hoursSinceMentionCheck =
        (now - this.healthMetrics.lastMentionCheckAt) / (1000 * 60 * 60);
      if (hoursSinceMentionCheck > this.maxHoursSinceMentionCheck) {
        warnings.push(`No mention check in ${hoursSinceMentionCheck.toFixed(1)} hours`);
      }
      metrics.recordGauge('nika_hours_since_mention_check', hoursSinceMentionCheck);
    }

    if (this.healthMetrics.consecutiveErrors >= this.maxConsecutiveErrors) {
      warnings.push(`${this.healthMetrics.consecutiveErrors} consecutive errors`);
    }
    metrics.recordGauge('nika_consecutive_errors', this.healthMetrics.consecutiveErrors);

    const healthy = warnings.length === 0;
    metrics.recordGauge('nika_health_status', healthy ? 1 : 0);

    if (warnings.length > 0) {
      log.warn('Health warnings detected', { warnings });
      this.emit('warning', warnings);
      metrics.incrementCounter('nika_health_warnings_emitted');
    }

    this.emit('status', this.getStatus());
  }

  recordTweet(): void {
    this.healthMetrics.lastTweetAt = Date.now();
    this.healthMetrics.tweetCount24h++;
    this.healthMetrics.consecutiveErrors = 0;

    log.debug('Tweet recorded', { tweetCount24h: this.healthMetrics.tweetCount24h });
    metrics.incrementCounter('nika_tweets_recorded');
    metrics.recordGauge('nika_tweet_count_24h', this.healthMetrics.tweetCount24h);

    this.emit('tweet');
  }

  recordDKGWrite(): void {
    this.healthMetrics.lastDKGWriteAt = Date.now();
    this.healthMetrics.dkgWriteCount24h++;

    log.debug('DKG write recorded', { dkgWriteCount24h: this.healthMetrics.dkgWriteCount24h });
    metrics.incrementCounter('nika_dkg_writes_recorded');
    metrics.recordGauge('nika_dkg_write_count_24h', this.healthMetrics.dkgWriteCount24h);

    this.emit('dkg:write');
  }

  recordDKGQuery(): void {
    this.healthMetrics.lastDKGQueryAt = Date.now();

    log.debug('DKG query recorded');
    metrics.incrementCounter('nika_dkg_queries_recorded');

    this.emit('dkg:query');
  }

  recordMentionCheck(): void {
    this.healthMetrics.lastMentionCheckAt = Date.now();

    log.debug('Mention check recorded');
    metrics.incrementCounter('nika_mention_checks_recorded');

    this.emit('mention:check');
  }

  recordError(): void {
    this.healthMetrics.consecutiveErrors++;
    this.healthMetrics.errorCount24h++;

    log.debug('Error recorded', {
      consecutiveErrors: this.healthMetrics.consecutiveErrors,
      errorCount24h: this.healthMetrics.errorCount24h,
    });

    metrics.incrementCounter('nika_errors_recorded');
    metrics.recordGauge('nika_error_count_24h', this.healthMetrics.errorCount24h);

    this.emit('error:recorded');
  }

  resetErrors(): void {
    const previous = this.healthMetrics.consecutiveErrors;
    this.healthMetrics.consecutiveErrors = 0;

    if (previous > 0) {
      log.info('Consecutive errors reset', { previous });
    }
  }

  getStatus(): HealthStatus {
    const now = Date.now();
    const warnings: string[] = [];

    if (this.healthMetrics.lastTweetAt > 0) {
      const hoursSincePost = (now - this.healthMetrics.lastTweetAt) / (1000 * 60 * 60);
      if (hoursSincePost > this.maxHoursSincePost) {
        warnings.push(`No tweets in ${hoursSincePost.toFixed(1)} hours`);
      }
    }

    const lastDKGActivity = Math.max(
      this.healthMetrics.lastDKGWriteAt,
      this.healthMetrics.lastDKGQueryAt
    );
    if (lastDKGActivity > 0) {
      const hoursSinceDKG = (now - lastDKGActivity) / (1000 * 60 * 60);
      if (hoursSinceDKG > this.maxHoursSinceDKG) {
        warnings.push(`No DKG activity in ${hoursSinceDKG.toFixed(1)} hours`);
      }
    }

    if (this.healthMetrics.consecutiveErrors >= this.maxConsecutiveErrors) {
      warnings.push(`${this.healthMetrics.consecutiveErrors} consecutive errors`);
    }

    return {
      healthy: warnings.length === 0,
      warnings,
      metrics: { ...this.healthMetrics },
    };
  }

  getMetrics(): HealthMetrics {
    return { ...this.healthMetrics };
  }

  getUptime(): number {
    return Date.now() - this.healthMetrics.uptimeStart;
  }

  getUptimeFormatted(): string {
    const uptime = this.getUptime();
    const hours = Math.floor(uptime / (1000 * 60 * 60));
    const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  }

  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    if (this.midnightTimeout) {
      clearTimeout(this.midnightTimeout);
      this.midnightTimeout = null;
    }

    if (this.dailyResetInterval) {
      clearInterval(this.dailyResetInterval);
      this.dailyResetInterval = null;
    }

    log.info('Health monitor stopped', {
      uptime: this.getUptimeFormatted(),
      tweetCount24h: this.healthMetrics.tweetCount24h,
      errorCount24h: this.healthMetrics.errorCount24h,
    });

    metrics.incrementCounter('nika_health_monitor_stopped');
    this.emit('stopped');
  }

  resetDailyCounters(): void {
    log.info('Resetting daily counters', {
      previous: {
        tweetCount24h: this.healthMetrics.tweetCount24h,
        errorCount24h: this.healthMetrics.errorCount24h,
        dkgWriteCount24h: this.healthMetrics.dkgWriteCount24h,
      },
    });

    this.healthMetrics.tweetCount24h = 0;
    this.healthMetrics.errorCount24h = 0;
    this.healthMetrics.dkgWriteCount24h = 0;

    metrics.incrementCounter('nika_daily_reset');
    this.emit('daily:reset');
  }

  setThresholds(thresholds: {
    maxHoursSincePost?: number;
    maxHoursSinceDKG?: number;
    maxConsecutiveErrors?: number;
    maxHoursSinceMentionCheck?: number;
  }): void {
    if (thresholds.maxHoursSincePost !== undefined) {
      this.maxHoursSincePost = thresholds.maxHoursSincePost;
    }
    if (thresholds.maxHoursSinceDKG !== undefined) {
      this.maxHoursSinceDKG = thresholds.maxHoursSinceDKG;
    }
    if (thresholds.maxConsecutiveErrors !== undefined) {
      this.maxConsecutiveErrors = thresholds.maxConsecutiveErrors;
    }
    if (thresholds.maxHoursSinceMentionCheck !== undefined) {
      this.maxHoursSinceMentionCheck = thresholds.maxHoursSinceMentionCheck;
    }

    log.info('Health thresholds updated', {
      maxHoursSincePost: this.maxHoursSincePost,
      maxHoursSinceDKG: this.maxHoursSinceDKG,
      maxConsecutiveErrors: this.maxConsecutiveErrors,
      maxHoursSinceMentionCheck: this.maxHoursSinceMentionCheck,
    });
  }

  exportPrometheusMetrics(): string {
    const lines: string[] = [];
    const now = Date.now();

    lines.push(`# HELP nika_uptime_seconds Bot uptime in seconds`);
    lines.push(`# TYPE nika_uptime_seconds gauge`);
    lines.push(`nika_uptime_seconds ${Math.floor(this.getUptime() / 1000)}`);

    lines.push(`# HELP nika_healthy Whether the bot is healthy (1=yes, 0=no)`);
    lines.push(`# TYPE nika_healthy gauge`);
    lines.push(`nika_healthy ${this.getStatus().healthy ? 1 : 0}`);

    lines.push(`# HELP nika_tweets_24h Number of tweets in the last 24 hours`);
    lines.push(`# TYPE nika_tweets_24h gauge`);
    lines.push(`nika_tweets_24h ${this.healthMetrics.tweetCount24h}`);

    lines.push(`# HELP nika_errors_24h Number of errors in the last 24 hours`);
    lines.push(`# TYPE nika_errors_24h gauge`);
    lines.push(`nika_errors_24h ${this.healthMetrics.errorCount24h}`);

    lines.push(`# HELP nika_consecutive_errors Current consecutive error count`);
    lines.push(`# TYPE nika_consecutive_errors gauge`);
    lines.push(`nika_consecutive_errors ${this.healthMetrics.consecutiveErrors}`);

    if (this.healthMetrics.lastTweetAt > 0) {
      lines.push(`# HELP nika_last_tweet_seconds_ago Seconds since last tweet`);
      lines.push(`# TYPE nika_last_tweet_seconds_ago gauge`);
      lines.push(
        `nika_last_tweet_seconds_ago ${Math.floor((now - this.healthMetrics.lastTweetAt) / 1000)}`
      );
    }

    lines.push(`# HELP nika_dkg_writes_24h Number of DKG writes in the last 24 hours`);
    lines.push(`# TYPE nika_dkg_writes_24h gauge`);
    lines.push(`nika_dkg_writes_24h ${this.healthMetrics.dkgWriteCount24h}`);

    return lines.join('\n');
  }
}
