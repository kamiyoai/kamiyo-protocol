/**
 * Production Scheduler for Kyoshin
 */

import { EventEmitter } from 'events';
import { createLogger, getMetrics } from './lib';

const log = createLogger('kyoshin:scheduler');
const metrics = getMetrics();

export interface SchedulerConfig {
  minIntervalMs: number;
  maxIntervalMs: number;
  onTick: () => Promise<void>;
  onError?: (error: Error) => void;
}

export interface SchedulerState {
  lastTickAt: number;
  lastSuccessAt: number;
  nextTickAt: number;
  consecutiveFailures: number;
  totalTicks: number;
  totalFailures: number;
}

export class ProductionScheduler extends EventEmitter {
  private timer: NodeJS.Timeout | null = null;
  private config: SchedulerConfig;
  private state: SchedulerState;
  private running = false;
  private maxConsecutiveFailures = 3;
  private retryDelayMs = 5 * 60 * 1000;

  constructor(config: SchedulerConfig) {
    super();
    this.config = config;
    this.state = {
      lastTickAt: 0,
      lastSuccessAt: 0,
      nextTickAt: 0,
      consecutiveFailures: 0,
      totalTicks: 0,
      totalFailures: 0,
    };

    log.info('Scheduler initialized', {
      minIntervalMs: config.minIntervalMs,
      maxIntervalMs: config.maxIntervalMs,
    });
  }

  private getNextInterval(): number {
    const { minIntervalMs, maxIntervalMs } = this.config;
    const interval = Math.floor(Math.random() * (maxIntervalMs - minIntervalMs)) + minIntervalMs;
    const jitter = Math.floor(Math.random() * interval * 0.1);
    return interval + jitter;
  }

  async start(): Promise<void> {
    if (this.running) {
      log.warn('Scheduler already running');
      return;
    }

    this.running = true;
    log.info('Scheduler starting');

    const now = Date.now();
    const timeSinceLastSuccess = this.state.lastSuccessAt ? now - this.state.lastSuccessAt : Infinity;

    let firstDelay: number;
    if (timeSinceLastSuccess >= this.config.minIntervalMs) {
      firstDelay = Math.floor(Math.random() * 5 * 60 * 1000);
      log.info('Scheduling immediate tick', { delayMs: firstDelay });
    } else {
      const remaining = this.config.minIntervalMs - timeSinceLastSuccess;
      firstDelay = remaining + Math.floor(Math.random() * 60 * 1000);
      log.info('Scheduling delayed tick', { delayMs: firstDelay, remaining });
    }

    this.scheduleNext(firstDelay);
    this.emit('started');
    metrics.incrementCounter('nika_scheduler_started');
  }

  private scheduleNext(delayMs?: number): void {
    if (!this.running) {
      return;
    }

    const delay = delayMs ?? this.getNextInterval();
    this.state.nextTickAt = Date.now() + delay;

    log.debug('Next tick scheduled', {
      delayMs: delay,
      nextTickAt: new Date(this.state.nextTickAt).toISOString(),
    });

    metrics.recordGauge('nika_scheduler_next_tick_ms', delay);

    this.timer = setTimeout(async () => {
      await this.executeTick();
    }, delay);
  }

  private async executeTick(): Promise<void> {
    const startTime = Date.now();
    this.state.lastTickAt = startTime;
    this.state.totalTicks++;

    log.info('Executing scheduled tick', { tickNumber: this.state.totalTicks });
    metrics.incrementCounter('nika_scheduler_tick_started');

    try {
      await this.config.onTick();

      const duration = Date.now() - startTime;
      this.state.lastSuccessAt = Date.now();
      this.state.consecutiveFailures = 0;

      log.info('Tick completed successfully', { durationMs: duration });
      metrics.incrementCounter('nika_scheduler_tick_success');
      metrics.recordHistogram('nika_scheduler_tick_duration_ms', duration);

      this.emit('success');
      this.scheduleNext();
    } catch (error) {
      this.state.consecutiveFailures++;
      this.state.totalFailures++;

      const err = error instanceof Error ? error : new Error(String(error));

      log.error('Tick failed', {
        error: err.message,
        consecutiveFailures: this.state.consecutiveFailures,
        totalFailures: this.state.totalFailures,
      });

      metrics.incrementCounter('nika_scheduler_tick_error');
      metrics.recordGauge('nika_scheduler_consecutive_failures', this.state.consecutiveFailures);

      this.emit('error', err);

      if (this.config.onError) {
        try {
          this.config.onError(err);
        } catch (callbackError) {
          log.error('Error callback threw', { error: String(callbackError) });
        }
      }

      if (this.state.consecutiveFailures >= this.maxConsecutiveFailures) {
        const message = `${this.state.consecutiveFailures} consecutive failures`;
        log.warn('Alert threshold reached', { message });
        this.emit('alert', message);
        metrics.incrementCounter('nika_scheduler_alert_triggered');
      }

      const backoffMultiplier = Math.min(this.state.consecutiveFailures, 5);
      const retryDelay = this.retryDelayMs * backoffMultiplier;

      log.info('Scheduling retry', { retryDelay, backoffMultiplier });
      this.scheduleNext(retryDelay);
    }
  }

  stop(): void {
    if (!this.running) {
      return;
    }

    this.running = false;

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    log.info('Scheduler stopped', {
      totalTicks: this.state.totalTicks,
      totalFailures: this.state.totalFailures,
    });

    metrics.incrementCounter('nika_scheduler_stopped');
    this.emit('stopped');
  }

  getState(): SchedulerState {
    return { ...this.state };
  }

  setLastSuccessAt(timestamp: number): void {
    this.state.lastSuccessAt = timestamp;
    log.debug('Last success time updated', { timestamp: new Date(timestamp).toISOString() });
  }

  isRunning(): boolean {
    return this.running;
  }

  getTimeUntilNextTick(): number {
    if (!this.state.nextTickAt) {
      return 0;
    }
    return Math.max(0, this.state.nextTickAt - Date.now());
  }

  async triggerNow(): Promise<void> {
    log.info('Manual tick triggered');
    metrics.incrementCounter('nika_scheduler_manual_trigger');

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await this.executeTick();
  }

  updateConfig(updates: Partial<Pick<SchedulerConfig, 'minIntervalMs' | 'maxIntervalMs'>>): void {
    if (updates.minIntervalMs !== undefined) {
      this.config.minIntervalMs = updates.minIntervalMs;
    }
    if (updates.maxIntervalMs !== undefined) {
      this.config.maxIntervalMs = updates.maxIntervalMs;
    }

    log.info('Scheduler config updated', {
      minIntervalMs: this.config.minIntervalMs,
      maxIntervalMs: this.config.maxIntervalMs,
    });
  }

  getHealthStatus(): {
    healthy: boolean;
    running: boolean;
    consecutiveFailures: number;
    lastSuccessAgo: number | null;
    nextTickIn: number;
  } {
    const now = Date.now();
    return {
      healthy: this.state.consecutiveFailures < this.maxConsecutiveFailures,
      running: this.running,
      consecutiveFailures: this.state.consecutiveFailures,
      lastSuccessAgo: this.state.lastSuccessAt ? now - this.state.lastSuccessAt : null,
      nextTickIn: this.getTimeUntilNextTick(),
    };
  }
}
